const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomBytes } = require("node:crypto");
const { once } = require("node:events");
const { DatabaseSync, backup } = require("node:sqlite");
const { ZipArchive } = require("archiver");
const {
    DeleteObjectsCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client
} = require("@aws-sdk/client-s3");

function enabledValue(value) {
    return ["1", "true", "yes", "on"].includes(
        String(value || "").trim().toLowerCase()
    );
}

function positiveNumber(value, fallback, minimum = 1) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, number) : fallback;
}

function createBackupConfiguration(env) {
    const enabled = enabledValue(env.PHOCLOUD_AUTOMATIC_BACKUPS);
    const accountId = (env.PHOCLOUD_R2_ACCOUNT_ID || "").trim();
    const accessKeyId = (
        env.PHOCLOUD_BACKUP_R2_ACCESS_KEY_ID
        || env.PHOCLOUD_GALLERY_R2_ACCESS_KEY_ID
        || ""
    ).trim();
    const secretAccessKey = (
        env.PHOCLOUD_BACKUP_R2_SECRET_ACCESS_KEY
        || env.PHOCLOUD_GALLERY_R2_SECRET_ACCESS_KEY
        || ""
    ).trim();
    const bucket = (
        env.PHOCLOUD_BACKUP_R2_BUCKET
        || env.PHOCLOUD_GALLERY_R2_BUCKET
        || ""
    ).trim();
    const missing = [
        ["PHOCLOUD_R2_ACCOUNT_ID", accountId],
        ["PHOCLOUD_BACKUP_R2_ACCESS_KEY_ID", accessKeyId],
        ["PHOCLOUD_BACKUP_R2_SECRET_ACCESS_KEY", secretAccessKey],
        ["PHOCLOUD_BACKUP_R2_BUCKET", bucket]
    ].filter(([, value]) => !value).map(([key]) => key);
    return {
        enabled,
        accountId,
        accessKeyId,
        secretAccessKey,
        bucket,
        missing,
        endpoint: (env.PHOCLOUD_R2_ENDPOINT || "").trim()
            || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : ""),
        retentionDays: positiveNumber(env.PHOCLOUD_BACKUP_RETENTION_DAYS, 30),
        intervalMs: positiveNumber(
            env.PHOCLOUD_BACKUP_INTERVAL_HOURS, 24
        ) * 60 * 60 * 1000,
        initialDelayMs: positiveNumber(
            env.PHOCLOUD_BACKUP_INITIAL_DELAY_MS, 60_000, 1_000
        )
    };
}

function fileChecksum(filePath) {
    return new Promise((resolve, reject) => {
        const hash = createHash("sha256");
        const stream = fs.createReadStream(filePath);
        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(hash.digest("hex")));
    });
}

async function deleteExpiredObjects(client, bucket, prefix, cutoff) {
    let continuationToken;
    const expiredKeys = [];
    do {
        const response = await client.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken
        }));
        for (const object of response.Contents || []) {
            if (object.Key && object.LastModified
                && object.LastModified.getTime() < cutoff) {
                expiredKeys.push(object.Key);
            }
        }
        continuationToken = response.IsTruncated
            ? response.NextContinuationToken
            : undefined;
    } while (continuationToken);

    for (let index = 0; index < expiredKeys.length; index += 1000) {
        const keys = expiredKeys.slice(index, index + 1000);
        await client.send(new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true }
        }));
    }
    return expiredKeys.length;
}

async function createArchive({
    databasePath, uploadsDirectory, brandingDirectory, stagingRoot
}) {
    fs.mkdirSync(stagingRoot, { recursive: true });
    const runId = `${Date.now()}-${randomBytes(5).toString("hex")}`;
    const stageDirectory = path.resolve(stagingRoot, runId);
    if (path.dirname(stageDirectory) !== path.resolve(stagingRoot)) {
        throw new Error("Ruta temporal de backup no válida");
    }
    fs.mkdirSync(stageDirectory);
    const databaseCopy = path.join(stageDirectory, "phocloud.db");
    const archivePath = path.join(stageDirectory, "phocloud-backup.zip");
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
        await backup(database, databaseCopy);
    } finally {
        database.close();
    }

    const output = fs.createWriteStream(archivePath);
    const archive = new ZipArchive({ zlib: { level: 6 } });
    const outputClosed = once(output, "close");
    archive.on("error", (error) => output.destroy(error));
    archive.pipe(output);
    archive.file(databaseCopy, { name: "phocloud.db" });
    if (fs.existsSync(uploadsDirectory)) {
        archive.directory(uploadsDirectory, "uploads");
    }
    if (fs.existsSync(brandingDirectory)) {
        archive.directory(brandingDirectory, "branding");
    }
    archive.append(JSON.stringify({
        createdAt: new Date().toISOString(),
        version: 3,
        contents: ["phocloud.db", "uploads", "branding"]
    }, null, 2), { name: "manifest.json" });
    await archive.finalize();
    await outputClosed;
    return { stageDirectory, archivePath };
}

function createAutomaticBackupService({
    databasePath,
    uploadsDirectory,
    brandingDirectory,
    env = process.env,
    client: injectedClient = null
}) {
    const configuration = createBackupConfiguration(env);
    if (configuration.enabled && configuration.missing.length) {
        throw new Error(
            `Configuración de backups R2 incompleta: ${configuration.missing.join(", ")}`
        );
    }
    const client = configuration.enabled
        ? (injectedClient || new S3Client({
            region: "auto",
            endpoint: configuration.endpoint,
            requestChecksumCalculation: "WHEN_REQUIRED",
            credentials: {
                accessKeyId: configuration.accessKeyId,
                secretAccessKey: configuration.secretAccessKey
            }
        }))
        : null;
    const prefix = "_system/backups/";
    const stagingRoot = path.join(path.dirname(databasePath), ".backup-staging");
    let running = null;
    let initialTimer = null;
    let intervalTimer = null;
    let lastSuccessAt = null;
    let lastErrorAt = null;

    async function runNow() {
        if (!configuration.enabled) return null;
        if (running) return running;
        running = (async () => {
            let archiveResult = null;
            try {
                archiveResult = await createArchive({
                    databasePath,
                    uploadsDirectory,
                    brandingDirectory,
                    stagingRoot
                });
                const createdAt = new Date();
                const objectName = `phocloud-${createdAt.toISOString().replace(/[:.]/g, "-")}.zip`;
                const checksum = await fileChecksum(archiveResult.archivePath);
                const size = fs.statSync(archiveResult.archivePath).size;
                await client.send(new PutObjectCommand({
                    Bucket: configuration.bucket,
                    Key: `${prefix}${objectName}`,
                    Body: fs.createReadStream(archiveResult.archivePath),
                    ContentLength: size,
                    ContentType: "application/zip",
                    ContentDisposition: `attachment; filename="${objectName}"`,
                    Metadata: { sha256: checksum, format: "phocloud-v3" }
                }));
                await deleteExpiredObjects(
                    client,
                    configuration.bucket,
                    prefix,
                    Date.now() - configuration.retentionDays * 24 * 60 * 60 * 1000
                );
                lastSuccessAt = createdAt.toISOString();
                console.info(`[PHOcloud backup] Copia externa completada: ${objectName}`);
                return { objectName, size, checksum, createdAt: lastSuccessAt };
            } catch (error) {
                lastErrorAt = new Date().toISOString();
                console.error(`[PHOcloud backup] No se pudo completar la copia: ${error.message}`);
                throw error;
            } finally {
                if (archiveResult?.stageDirectory
                    && path.dirname(archiveResult.stageDirectory) === path.resolve(stagingRoot)) {
                    fs.rmSync(archiveResult.stageDirectory, {
                        recursive: true,
                        force: true
                    });
                }
                running = null;
            }
        })();
        return running;
    }

    function start() {
        if (!configuration.enabled || initialTimer || intervalTimer) return;
        initialTimer = setTimeout(() => {
            initialTimer = null;
            runNow().catch(() => {});
            intervalTimer = setInterval(
                () => runNow().catch(() => {}),
                configuration.intervalMs
            );
            intervalTimer.unref();
        }, configuration.initialDelayMs);
        initialTimer.unref();
    }

    function stop() {
        if (initialTimer) clearTimeout(initialTimer);
        if (intervalTimer) clearInterval(intervalTimer);
        initialTimer = null;
        intervalTimer = null;
    }

    function status() {
        return {
            enabled: configuration.enabled,
            provider: configuration.enabled ? "r2" : "disabled",
            retentionDays: configuration.retentionDays,
            lastSuccessAt,
            lastErrorAt,
            running: Boolean(running)
        };
    }

    return { start, stop, runNow, status };
}

module.exports = {
    createAutomaticBackupService,
    createBackupConfiguration,
    deleteExpiredObjects
};
