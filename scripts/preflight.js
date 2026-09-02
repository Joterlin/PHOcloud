require("dotenv").config();

const fs = require("fs");
const path = require("path");

const production = process.env.NODE_ENV === "production";
const errors = [];
const warnings = [];

function required(name) {
    const value = process.env[name]?.trim();
    if (!value) errors.push(`Falta ${name}`);
    return value || "";
}

function ensureWritableDirectory(target, label) {
    if (!target) return;
    if (!path.isAbsolute(target)) {
        errors.push(`${label} debe utilizar una ruta absoluta`);
        return;
    }
    try {
        fs.mkdirSync(target, { recursive: true });
        fs.accessSync(target, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
        errors.push(`${label} no se puede leer y escribir: ${target}`);
    }
}

if (!production) {
    console.log("PHOcloud: configuración local detectada; las exigencias de publicación no se aplican.");
    process.exit(0);
}

const publicUrl = required("PHOCLOUD_PUBLIC_URL");
const databasePath = required("PHOCLOUD_DATABASE_PATH");
const uploadsDirectory = required("PHOCLOUD_UPLOADS_DIRECTORY");
const transfersDirectory = required("PHOCLOUD_TRANSFERS_DIRECTORY");
required("PHOCLOUD_FROM_EMAIL");
required("PHOCLOUD_LEGAL_NAME");
required("PHOCLOUD_LEGAL_EMAIL");
required("PHOCLOUD_LEGAL_COUNTRY");

const resendConfigured = Boolean(process.env.RESEND_API_KEY?.trim());
const smtpFields = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"];
const smtpConfigured = smtpFields.every((name) => process.env[name]?.trim());
if (!resendConfigured && !smtpConfigured) {
    errors.push("Configura RESEND_API_KEY o SMTP_HOST, SMTP_USER y SMTP_PASS");
}

const transferStorage = (process.env.PHOCLOUD_TRANSFER_STORAGE || "local")
    .trim().toLowerCase();
if (!["local", "r2"].includes(transferStorage)) {
    errors.push("PHOCLOUD_TRANSFER_STORAGE debe ser local o r2");
}
if (transferStorage === "r2") {
    required("PHOCLOUD_R2_ACCOUNT_ID");
    required("PHOCLOUD_R2_ACCESS_KEY_ID");
    required("PHOCLOUD_R2_SECRET_ACCESS_KEY");
    required("PHOCLOUD_R2_BUCKET");
} else {
    warnings.push("Las transferencias usan disco local y no se reanudan por bloques; usa R2 antes de ofrecer 50 GB");
}

try {
    const url = new URL(publicUrl);
    if (url.protocol !== "https:") errors.push("PHOCLOUD_PUBLIC_URL debe usar HTTPS");
    if (url.pathname !== "/") warnings.push("Se recomienda publicar PHOcloud en la raíz del dominio");
} catch {
    errors.push("PHOCLOUD_PUBLIC_URL no es una URL válida");
}

if (smtpConfigured) {
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
        errors.push("SMTP_PORT no es válido");
    }
}

if (databasePath) {
    if (!path.isAbsolute(databasePath)) {
        errors.push("PHOCLOUD_DATABASE_PATH debe utilizar una ruta absoluta");
    } else {
        ensureWritableDirectory(path.dirname(databasePath), "La carpeta de la base de datos");
    }
}
ensureWritableDirectory(uploadsDirectory, "PHOCLOUD_UPLOADS_DIRECTORY");
ensureWritableDirectory(transfersDirectory, "PHOCLOUD_TRANSFERS_DIRECTORY");

const backupDirectory = process.env.PHOCLOUD_BACKUP_DIRECTORY
    || (databasePath ? path.join(path.dirname(databasePath), "backups") : "");
ensureWritableDirectory(backupDirectory, "PHOCLOUD_BACKUP_DIRECTORY");
if (uploadsDirectory && backupDirectory) {
    const relative = path.relative(uploadsDirectory, backupDirectory);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
        errors.push("PHOCLOUD_BACKUP_DIRECTORY no puede estar dentro de uploads");
    }
}
if (transfersDirectory && backupDirectory) {
    const relative = path.relative(transfersDirectory, backupDirectory);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
        errors.push("PHOCLOUD_BACKUP_DIRECTORY no puede estar dentro de transfers");
    }
}
if (!process.env.PHOCLOUD_BACKUP_DIRECTORY) {
    warnings.push("PHOCLOUD_BACKUP_DIRECTORY usa el valor predeterminado; configura una copia externa adicional");
}

for (const warning of warnings) console.warn(`AVISO: ${warning}`);
if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exit(1);
}

console.log("PHOcloud: configuración de producción válida.");
