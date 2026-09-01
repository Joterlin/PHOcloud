require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { DatabaseSync, backup } = require("node:sqlite");

const rootDirectory = path.join(__dirname, "..");
const databasePath = path.resolve(
    process.env.PHOCLOUD_DATABASE_PATH
    || path.join(rootDirectory, "data", "phocloud.db")
);
const uploadsDirectory = path.resolve(
    process.env.PHOCLOUD_UPLOADS_DIRECTORY
    || path.join(rootDirectory, "uploads")
);
const transfersDirectory = path.resolve(
    process.env.PHOCLOUD_TRANSFERS_DIRECTORY
    || path.join(rootDirectory, "transfers")
);
const brandingDirectory = path.join(path.dirname(databasePath), "branding");
const backupRoot = path.resolve(
    process.env.PHOCLOUD_BACKUP_DIRECTORY
    || path.join(path.dirname(databasePath), "backups")
);
const configuredRetention = Number(
    process.env.PHOCLOUD_BACKUP_RETENTION_DAYS || 30
);
const retentionDays = Number.isFinite(configuredRetention)
    ? Math.max(1, configuredRetention)
    : 30;

function isInside(parent, target) {
    const relative = path.relative(parent, target);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, "-");
}

function removeExpiredBackups() {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    for (const entry of fs.readdirSync(backupRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.startsWith("phocloud-")) continue;
        const target = path.resolve(backupRoot, entry.name);
        if (path.dirname(target) !== backupRoot) continue;
        if (fs.statSync(target).mtimeMs < cutoff) {
            fs.rmSync(target, { recursive: true, force: true });
        }
    }
}

async function main() {
    if (!fs.existsSync(databasePath)) {
        throw new Error(`No existe la base de datos: ${databasePath}`);
    }
    if (isInside(uploadsDirectory, backupRoot)) {
        throw new Error("La carpeta de backups no puede estar dentro de uploads");
    }
    if (isInside(transfersDirectory, backupRoot)) {
        throw new Error("La carpeta de backups no puede estar dentro de transfers");
    }
    fs.mkdirSync(backupRoot, { recursive: true });
    const destination = path.join(backupRoot, `phocloud-${timestamp()}`);
    fs.mkdirSync(destination);

    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
        await backup(database, path.join(destination, "phocloud.db"));
    } finally {
        database.close();
    }

    if (fs.existsSync(uploadsDirectory)) {
        fs.cpSync(uploadsDirectory, path.join(destination, "uploads"), {
            recursive: true,
            errorOnExist: true
        });
    }
    if (fs.existsSync(brandingDirectory)) {
        fs.cpSync(brandingDirectory, path.join(destination, "branding"), {
            recursive: true,
            errorOnExist: true
        });
    }
    if (fs.existsSync(transfersDirectory)) {
        fs.cpSync(transfersDirectory, path.join(destination, "transfers"), {
            recursive: true,
            errorOnExist: true
        });
    }

    fs.writeFileSync(
        path.join(destination, "manifest.json"),
        JSON.stringify({ createdAt: new Date().toISOString(), version: 2 }, null, 2)
    );
    removeExpiredBackups();
    console.log(`Copia completada: ${destination}`);
}

main().catch((error) => {
    console.error(`No se pudo completar la copia: ${error.message}`);
    process.exitCode = 1;
});
