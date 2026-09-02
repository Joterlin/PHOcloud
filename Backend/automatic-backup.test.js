const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
    createAutomaticBackupService,
    createBackupConfiguration
} = require("./automatic-backup");

test("automatic backups are opt-in and can reuse gallery R2 credentials", () => {
    assert.equal(createBackupConfiguration({}).enabled, false);
    const configuration = createBackupConfiguration({
        PHOCLOUD_AUTOMATIC_BACKUPS: "true",
        PHOCLOUD_R2_ACCOUNT_ID: "account",
        PHOCLOUD_GALLERY_R2_ACCESS_KEY_ID: "access",
        PHOCLOUD_GALLERY_R2_SECRET_ACCESS_KEY: "secret",
        PHOCLOUD_GALLERY_R2_BUCKET: "gallery-bucket"
    });
    assert.equal(configuration.enabled, true);
    assert.equal(configuration.bucket, "gallery-bucket");
    assert.deepEqual(configuration.missing, []);
});

test("automatic backup uploads an archive and removes its staging files", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phocloud-backup-"));
    const databasePath = path.join(root, "phocloud.db");
    const uploadsDirectory = path.join(root, "uploads");
    const brandingDirectory = path.join(root, "branding");
    fs.mkdirSync(uploadsDirectory);
    fs.mkdirSync(brandingDirectory);
    fs.writeFileSync(path.join(uploadsDirectory, "preview.txt"), "preview");
    fs.writeFileSync(path.join(brandingDirectory, "logo.txt"), "logo");
    const database = new DatabaseSync(databasePath);
    database.exec("CREATE TABLE test (value TEXT); INSERT INTO test VALUES ('ok');");
    database.close();

    const calls = [];
    const client = {
        async send(command) {
            calls.push(command);
            if (command.constructor.name === "PutObjectCommand") {
                let bytes = 0;
                for await (const chunk of command.input.Body) bytes += chunk.length;
                assert.ok(bytes > 0);
                assert.match(command.input.Key, /^_system\/backups\/phocloud-/);
                assert.match(command.input.Metadata.sha256, /^[a-f0-9]{64}$/);
                return {};
            }
            if (command.constructor.name === "ListObjectsV2Command") {
                return { Contents: [], IsTruncated: false };
            }
            return {};
        }
    };
    const service = createAutomaticBackupService({
        databasePath,
        uploadsDirectory,
        brandingDirectory,
        client,
        env: {
            PHOCLOUD_AUTOMATIC_BACKUPS: "true",
            PHOCLOUD_R2_ACCOUNT_ID: "account",
            PHOCLOUD_BACKUP_R2_ACCESS_KEY_ID: "access",
            PHOCLOUD_BACKUP_R2_SECRET_ACCESS_KEY: "secret",
            PHOCLOUD_BACKUP_R2_BUCKET: "backups"
        }
    });
    try {
        const result = await service.runNow();
        assert.ok(result.size > 0);
        assert.ok(service.status().lastSuccessAt);
        assert.equal(calls.some((call) => (
            call.constructor.name === "PutObjectCommand"
        )), true);
        assert.equal(fs.existsSync(path.join(root, ".backup-staging")), true);
        assert.deepEqual(fs.readdirSync(path.join(root, ".backup-staging")), []);
    } finally {
        service.stop();
        fs.rmSync(root, { recursive: true, force: true });
    }
});
