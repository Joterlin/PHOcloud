require("dotenv").config();

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { createHash, randomBytes, randomInt, timingSafeEqual } = require("crypto");
const { PassThrough, Readable, Transform } = require("stream");
const { pipeline } = require("stream/promises");
const { ZipArchive } = require("archiver");
const { v4: uuidv4 } = require("uuid");
const { createDeliveryStore } = require("./database");
const {
    createObjectStorage,
    createGalleryStorage
} = require("./object-storage");
const { createBilling } = require("./billing");
const { createAutomaticBackupService } = require("./automatic-backup");
const {
    TECHNICAL_MAX_TRANSFER_BYTES,
    createConcurrencyLimiter,
    createEconomicConfig,
    monthKey
} = require("./economic-controls");
const {
    configuredSecurityEmail,
    renderLegalTemplate,
    validatePublicConfiguration
} = require("./public-config");
const {
    sendAccountLink,
    sendGalleryDelivery,
    sendTransferSenderCode,
    sendTransferDelivery,
    emailConfigured
} = require("./mailer");
const {
    BRAND_FOLDER,
    createLogo,
    createPreview,
    createPreviews,
    galleryLogoPath,
    previewPath,
    removePreview
} = require("./media");
const {
    SESSION_COOKIE_NAME,
    SESSION_DURATION_MS,
    createPasswordRecord,
    verifyPassword,
    createSessionToken,
    hashSessionToken,
    readCookie
} = require("./auth");
const {
    GOOGLE_OAUTH_COOKIE_NAME,
    GOOGLE_OAUTH_MAX_AGE_MS,
    createGoogleAuth,
    safeNextPath
} = require("./google-auth");

const app = express();
const rootDirectory = path.join(__dirname, "..");
const frontendDirectory = path.join(rootDirectory, "Frontend");
const publicDirectory = path.join(rootDirectory, "public");
const uploadsDirectory = process.env.PHOCLOUD_UPLOADS_DIRECTORY
    ? path.resolve(process.env.PHOCLOUD_UPLOADS_DIRECTORY)
    : path.join(rootDirectory, "uploads");
const transfersDirectory = process.env.PHOCLOUD_TRANSFERS_DIRECTORY
    ? path.resolve(process.env.PHOCLOUD_TRANSFERS_DIRECTORY)
    : path.join(rootDirectory, "transfers");
fs.mkdirSync(transfersDirectory, { recursive: true });
const databasePath = process.env.PHOCLOUD_DATABASE_PATH
    ? path.resolve(process.env.PHOCLOUD_DATABASE_PATH)
    : path.join(rootDirectory, "data", "phocloud.db");
const brandingDirectory = path.join(path.dirname(databasePath), "branding");
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
const objectStorage = createObjectStorage();
const galleryStorage = createGalleryStorage();
const billing = createBilling();
const economicConfig = createEconomicConfig();
const billingEnvironment = billing.publicConfiguration().mode;
const secureCookies = isProduction;
const googleAuth = createGoogleAuth();
const posthogProjectApiKey = (process.env.POSTHOG_PROJECT_API_KEY || "").trim();
const allowedPosthogHosts = new Set([
    "https://eu.i.posthog.com", "https://us.i.posthog.com"
]);
const requestedPosthogHost = (process.env.POSTHOG_HOST || "https://eu.i.posthog.com")
    .trim().replace(/\/$/, "");
const posthogHost = allowedPosthogHosts.has(requestedPosthogHost)
    ? requestedPosthogHost
    : "https://eu.i.posthog.com";
const analyticsAdminEmails = new Set(
    String(process.env.PHOCLOUD_ANALYTICS_ADMIN_EMAILS || "")
        .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean)
);
const GALLERY_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const GUEST_UPLOAD_COOKIE_NAME = "phocloud_guest_sender";
const GUEST_UPLOAD_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PHOTOS_PER_DELIVERY = 500;
const MAX_PHOTO_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;
const MAX_DELIVERY_SIZE_BYTES = 10 * 1024 * 1024 * 1024;
const MAX_LOGO_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_TRANSFER_FILES = 500;
const MAX_TRANSFER_FILE_SIZE_BYTES = TECHNICAL_MAX_TRANSFER_BYTES;
const MAX_TRANSFER_SIZE_BYTES = TECHNICAL_MAX_TRANSFER_BYTES;
const ACCOUNT_TOKEN_DURATION_MS = 60 * 60 * 1000;
const RESET_TOKEN_DURATION_MS = 30 * 60 * 1000;
const TRANSFER_SENDER_CODE_DURATION_MS = 10 * 60 * 1000;
const TRANSFER_SENDER_VERIFIED_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const TRANSFER_SENDER_CODE_MAX_ATTEMPTS = 5;
const TRANSFER_SENDER_CODE_RESEND_DELAY_MS = 60 * 1000;
const PLAN_LIMITS = {
    free: {
        galleries: 3,
        galleryLifetimeDays: 7,
        storageBytes: economicConfig.plans.free.galleryStorageBytes,
        transferStorageBytes: economicConfig.plans.free.transferStorageBytes
    },
    professional: {
        galleries: 25,
        galleryLifetimeDays: null,
        storageBytes: economicConfig.plans.professional.galleryStorageBytes,
        transferStorageBytes: economicConfig.plans.professional.transferStorageBytes
    },
    studio: {
        galleries: 100,
        galleryLifetimeDays: null,
        storageBytes: economicConfig.plans.studio.galleryStorageBytes,
        transferStorageBytes: economicConfig.plans.studio.transferStorageBytes
    }
};
const validFolderId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const loginAttempts = new Map();
const galleryAttempts = new Map();
const sensitiveActionAttempts = new Map();
const analyticsAttempts = new Map();
const zipConcurrency = createConcurrencyLimiter();
const uploadConcurrency = createConcurrencyLimiter();
const activeZipBuilds = new Map();
const activeConversionBuilds = new Map();

function validateRuntimeConfig() {
    if (!isProduction) return;

    const required = [
        "PHOCLOUD_PUBLIC_URL", "PHOCLOUD_DATABASE_PATH",
        "PHOCLOUD_UPLOADS_DIRECTORY", "PHOCLOUD_TRANSFERS_DIRECTORY"
    ];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length) {
        throw new Error(`Configuración de producción incompleta: ${missing.join(", ")}`);
    }
    if (!emailConfigured()) {
        throw new Error(
            "Configura RESEND_API_KEY o SMTP_HOST, SMTP_USER y SMTP_PASS para enviar correos"
        );
    }
    const publicConfigurationErrors = validatePublicConfiguration(process.env, {
        requireLegal: true,
        requireTransactional: true
    });
    if (publicConfigurationErrors.length) {
        throw new Error(
            `Configuración pública no válida: ${publicConfigurationErrors.join("; ")}`
        );
    }
    const galleryStorageMode = (process.env.PHOCLOUD_GALLERY_STORAGE || "local")
        .trim().toLowerCase();
    if (!["local", "r2"].includes(galleryStorageMode)) {
        throw new Error("PHOCLOUD_GALLERY_STORAGE debe ser local o r2");
    }
    if (galleryStorageMode === "r2") {
        const galleryRequired = [
            "PHOCLOUD_R2_ACCOUNT_ID",
            "PHOCLOUD_GALLERY_R2_ACCESS_KEY_ID",
            "PHOCLOUD_GALLERY_R2_SECRET_ACCESS_KEY",
            "PHOCLOUD_GALLERY_R2_BUCKET"
        ];
        const missingGallery = galleryRequired.filter((key) => !process.env[key]);
        if (missingGallery.length) {
            throw new Error(
                `Configuración R2 de galerías incompleta: ${missingGallery.join(", ")}`
            );
        }
    }

    let publicUrl;
    try {
        publicUrl = new URL(process.env.PHOCLOUD_PUBLIC_URL);
    } catch {
        throw new Error("PHOCLOUD_PUBLIC_URL debe ser una URL válida");
    }
    if (publicUrl.protocol !== "https:") {
        throw new Error("PHOCLOUD_PUBLIC_URL debe utilizar HTTPS en producción");
    }
}

validateRuntimeConfig();

fs.mkdirSync(uploadsDirectory, { recursive: true });
fs.mkdirSync(brandingDirectory, { recursive: true });

const deliveryStore = createDeliveryStore({
    databasePath,
    uploadsDirectory
});
const automaticBackups = createAutomaticBackupService({
    databasePath,
    uploadsDirectory,
    brandingDirectory
});

deliveryStore.deleteExpiredSessions(Date.now());
deliveryStore.deleteExpiredGallerySessions(Date.now());
deliveryStore.deleteExpiredAccountTokens(Date.now());
deliveryStore.deleteExpiredTransferSessions(Date.now());
deliveryStore.deleteExpiredGuestUploadSessions(Date.now());
deliveryStore.deleteExpiredTransferSenderVerifications(Date.now());
deliveryStore.deleteOrphanGuestUsers();
deliveryStore.resetStaleZipJobs(
    new Date(Date.now() - economicConfig.zipLeaseMs).toISOString()
);
deliveryStore.resetInterruptedTransferConversions();

async function removeTransferStorage(transfer) {
    if (transfer.storageProvider === "r2") {
        if (!objectStorage.enabled) {
            throw new Error("R2 no está configurado; no se borrarán referencias a objetos remotos");
        }
        const files = deliveryStore.listTransferFiles(transfer.id);
        const zipJob = deliveryStore.getTransferZipJob(transfer.id);
        await Promise.allSettled(files.map((file) => objectStorage.abortMultipart({
            key: file.objectKey,
            uploadId: file.multipartUploadId
        })));
        await objectStorage.deleteKeys(
            [
                ...files.map((file) => file.objectKey),
                zipJob?.objectKey
            ].filter(Boolean)
        );
        return;
    }
    const folderPath = transferFolderPath(transfer.id);
    if (folderPath && fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true });
    }
}

async function cleanupExpiredTransfers() {
    for (const transfer of deliveryStore.listExpiredTransfers(new Date().toISOString())) {
        if (deliveryStore.hasActiveTransferConversion(transfer.id)) continue;
        try {
            await removeTransferStorage(transfer);
            deliveryStore.deleteTransferById(transfer.id);
        } catch (error) {
            console.error(`No se pudo limpiar la transferencia ${transfer.id}`, error);
            recordUsage(transfer.ownerId, "errors", 1);
        }
    }
    deliveryStore.deleteOrphanGuestUsers();
}
cleanupExpiredTransfers().catch(console.error);

app.disable("x-powered-by");

if (secureCookies) {
    app.set("trust proxy", 1);
}

app.use((req, res, next) => {
    const requestId = req.get("X-Request-ID") || uuidv4();
    req.requestId = requestId;
    const storageOrigins = [...new Set([
        ...(objectStorage.requestOrigins || []),
        ...(galleryStorage.requestOrigins || [])
    ].filter(Boolean))].map((origin) => ` ${origin}`).join("");
    res.set({
        "Content-Security-Policy": `default-src 'self'; img-src 'self' data: blob:${storageOrigins}; media-src 'self' blob:${storageOrigins}; style-src 'self'; script-src 'self'; connect-src 'self'${storageOrigins}${posthogProjectApiKey ? ` ${posthogHost}` : ""}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
        "Cross-Origin-Opener-Policy": "same-origin",
        "X-Request-ID": requestId
    });
    if (isProduction) {
        res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
});

function stripeReferenceId(value) {
    if (typeof value === "string") return value;
    return value && typeof value.id === "string" ? value.id : null;
}

function stripeTimestamp(value) {
    return Number.isFinite(Number(value))
        ? new Date(Number(value) * 1000).toISOString()
        : null;
}

function userForCurrentBillingEnvironment(user) {
    if (!user || !user.stripeEnvironment
        || user.stripeEnvironment === billingEnvironment) {
        return user;
    }
    return {
        ...user,
        plan: "free",
        planStatus: "active",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripeCurrentPeriodEnd: null
    };
}

function billingUserForObject(object) {
    const metadataUserId = Number(object?.metadata?.phocloud_user_id);
    if (Number.isSafeInteger(metadataUserId) && metadataUserId > 0) {
        const user = deliveryStore.getUserById(metadataUserId);
        if (user) return user;
    }
    const subscriptionId = stripeReferenceId(
        object?.subscription
        || object?.parent?.subscription_details?.subscription
    );
    if (subscriptionId) {
        const user = deliveryStore.getUserByStripeSubscriptionId(subscriptionId);
        if (user) return user;
    }
    const customerId = stripeReferenceId(object?.customer);
    return customerId
        ? deliveryStore.getUserByStripeCustomerId(customerId)
        : null;
}

function updateBillingFromCheckout(session, environment, failed = false) {
    const user = billingUserForObject(session)
        || deliveryStore.getUserById(Number(session.client_reference_id));
    const plan = session.metadata?.phocloud_plan;
    if (!user || !["professional", "studio"].includes(plan)) return;
    const paid = !failed && session.payment_status !== "unpaid";
    deliveryStore.updateUserBilling(user.id, {
        customerId: stripeReferenceId(session.customer) || user.stripeCustomerId,
        subscriptionId: stripeReferenceId(session.subscription),
        environment,
        plan: paid ? plan : "free",
        planStatus: paid ? "active" : "incomplete",
        currentPeriodEnd: user.stripeCurrentPeriodEnd
    });
}

function updateBillingFromSubscription(subscription, environment) {
    const user = billingUserForObject(subscription);
    if (!user) return;
    const priceId = subscription.items?.data?.[0]?.price?.id;
    const selectedPlan = billing.planFromPriceId(priceId)
        || subscription.metadata?.phocloud_plan
        || user.plan;
    const entitled = ["active", "trialing", "past_due"].includes(
        subscription.status
    );
    const deleted = subscription.status === "canceled";
    const periodEnd = subscription.current_period_end
        || subscription.items?.data?.[0]?.current_period_end;
    deliveryStore.updateUserBilling(user.id, {
        customerId: stripeReferenceId(subscription.customer)
            || user.stripeCustomerId,
        subscriptionId: deleted ? null : subscription.id,
        environment,
        plan: entitled && ["professional", "studio"].includes(selectedPlan)
            ? selectedPlan
            : "free",
        planStatus: subscription.status || "inactive",
        currentPeriodEnd: stripeTimestamp(periodEnd)
    });
}

function updateBillingFromInvoice(invoice, environment, paid) {
    const user = billingUserForObject(invoice);
    if (!user) return;
    deliveryStore.updateUserBilling(user.id, {
        customerId: stripeReferenceId(invoice.customer) || user.stripeCustomerId,
        subscriptionId: stripeReferenceId(
            invoice.subscription
            || invoice.parent?.subscription_details?.subscription
        ) || user.stripeSubscriptionId,
        environment,
        plan: user.plan,
        planStatus: paid ? "active" : "past_due",
        currentPeriodEnd: user.stripeCurrentPeriodEnd
    });
}

function processStripeEvent(event) {
    if (deliveryStore.hasStripeEvent(event.id)) return;
    const environment = event.livemode ? "live" : "test";
    switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
        updateBillingFromCheckout(event.data.object, environment);
        break;
    case "checkout.session.async_payment_failed":
        updateBillingFromCheckout(event.data.object, environment, true);
        break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
        updateBillingFromSubscription(event.data.object, environment);
        break;
    case "invoice.paid":
        updateBillingFromInvoice(event.data.object, environment, true);
        break;
    case "invoice.payment_failed":
        updateBillingFromInvoice(event.data.object, environment, false);
        break;
    default:
        break;
    }
    deliveryStore.markStripeEventProcessed(
        event.id, event.type, new Date().toISOString()
    );
    deliveryStore.deleteOldStripeEvents(
        new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString()
    );
}

app.post("/billing/webhook", express.raw({ type: "application/json", limit: "1mb" }), (req, res) => {
    if (!billing.configured) {
        return res.status(503).json({ error: "Facturación no configurada" });
    }
    let event;
    try {
        event = billing.constructWebhookEvent(
            req.body, req.get("Stripe-Signature")
        );
    } catch (error) {
        console.warn(`[${req.requestId}] Stripe webhook rejected: ${error.message}`);
        return res.status(400).json({ error: "Firma de Stripe no válida" });
    }
    try {
        processStripeEvent(event);
        return res.json({ received: true });
    } catch (error) {
        console.error(`[${req.requestId}] Stripe webhook error`, error);
        return res.status(500).json({ error: "No se pudo procesar el evento" });
    }
});

app.use(express.json({ limit: "1mb" }));

function galleryFolderPath(folderId) {
    if (!validFolderId.test(folderId)) return null;

    const uploadsRoot = path.resolve(uploadsDirectory);
    const folderPath = path.resolve(uploadsRoot, folderId);

    if (path.dirname(folderPath) !== uploadsRoot) return null;

    return folderPath;
}

function transferFolderPath(transferId) {
    if (!validFolderId.test(transferId)) return null;
    const root = path.resolve(transfersDirectory);
    const folderPath = path.resolve(root, transferId);
    if (path.dirname(folderPath) !== root) return null;
    return folderPath;
}

function listTransferFiles(folderPath) {
    return fs.readdirSync(folderPath, { withFileTypes: true })
        .filter((item) => item.isFile() && !item.name.startsWith("."))
        .map((item) => {
            const stats = fs.statSync(path.join(folderPath, item.name));
            return { name: item.name, size: stats.size };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "es", {
            numeric: true, sensitivity: "base"
        }));
}

function transferFilePath(transferId, filename) {
    const folderPath = transferFolderPath(transferId);
    if (!folderPath || typeof filename !== "string"
        || path.basename(filename) !== filename) return null;
    const resolved = path.resolve(folderPath, filename);
    return path.dirname(resolved) === folderPath ? resolved : null;
}

const GALLERY_MANIFEST_FILENAME = ".gallery-files.json";

function galleryManifestPath(folderPath) {
    return path.join(folderPath, GALLERY_MANIFEST_FILENAME);
}

function readGalleryManifest(folderPath) {
    const manifestPath = galleryManifestPath(folderPath);
    if (!fs.existsSync(manifestPath)) return null;
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        if (manifest?.provider !== "r2" || !Array.isArray(manifest.files)) {
            throw new Error("formato no válido");
        }
        return {
            provider: "r2",
            files: manifest.files.filter((file) => {
                return file
                    && typeof file.name === "string"
                    && path.basename(file.name) === file.name
                    && typeof file.objectKey === "string"
                    && file.objectKey
                    && Number.isFinite(Number(file.size));
            }).map((file) => ({
                name: file.name,
                objectKey: file.objectKey,
                size: Number(file.size),
                mimeType: file.mimeType || "application/octet-stream"
            }))
        };
    } catch (error) {
        throw new Error(`Manifiesto de galería dañado: ${error.message}`);
    }
}

function writeGalleryManifest(folderPath, files) {
    const manifestPath = galleryManifestPath(folderPath);
    const temporaryPath = `${manifestPath}.tmp`;
    const orderedFiles = [...files].sort((a, b) => a.name.localeCompare(
        b.name, "es", { numeric: true, sensitivity: "base" }
    ));
    fs.writeFileSync(temporaryPath, JSON.stringify({
        version: 1,
        provider: "r2",
        files: orderedFiles
    }, null, 2));
    fs.renameSync(temporaryPath, manifestPath);
}

function mimeTypeForGalleryFile(filename) {
    const extension = path.extname(filename).toLowerCase();
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".avif": "image/avif",
        ".heic": "image/heic",
        ".heif": "image/heif",
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".m4v": "video/x-m4v",
        ".webm": "video/webm"
    }[extension] || "application/octet-stream";
}

function listGalleryFileRecords(folderPath) {
    const manifest = readGalleryManifest(folderPath);
    if (manifest) return manifest.files;
    return fs.readdirSync(folderPath, { withFileTypes: true })
        .filter((item) => {
            return item.isFile()
                && item.name !== "metadata.json"
                && !item.name.startsWith(".");
        })
        .map((item) => {
            const stats = fs.statSync(path.join(folderPath, item.name));
            return {
                name: item.name,
                objectKey: null,
                size: stats.size,
                mimeType: mimeTypeForGalleryFile(item.name)
            };
        });
}

function listGalleryFiles(folderPath) {
    return listGalleryFileRecords(folderPath)
        .map((file) => file.name)
        .sort((a, b) => a.localeCompare(b, "es", {
            numeric: true,
            sensitivity: "base"
        }));
}

function galleryFileRecord(folderPath, filename) {
    if (typeof filename !== "string" || path.basename(filename) !== filename) {
        return null;
    }
    return listGalleryFileRecords(folderPath)
        .find((file) => file.name === filename) || null;
}

function galleryStoredInR2(folderPath) {
    return Boolean(readGalleryManifest(folderPath));
}

async function persistGalleryFilesToR2(
    folderId, folderPath, uploadedFiles, previousRecords = []
) {
    const createdRecords = [];
    try {
        for (const file of uploadedFiles) {
            const objectKey = await galleryStorage.uploadFile({
                deliveryId: folderId,
                filename: file.filename,
                filePath: file.path,
                contentType: file.mimetype,
                size: file.size
            });
            createdRecords.push({
                name: file.filename,
                objectKey,
                size: file.size,
                mimeType: file.mimetype || mimeTypeForGalleryFile(file.filename)
            });
        }
        writeGalleryManifest(folderPath, [...previousRecords, ...createdRecords]);
        for (const file of uploadedFiles) {
            fs.rmSync(file.path, { force: true });
        }
        return createdRecords;
    } catch (error) {
        await galleryStorage.deleteKeys(
            createdRecords.map((file) => file.objectKey)
        ).catch(() => {});
        throw error;
    }
}

async function removeGalleryRemoteObjects(folderPath) {
    const manifest = readGalleryManifest(folderPath);
    if (!manifest) return;
    if (!galleryStorage.enabled) {
        throw new Error("R2 de galerías no está configurado");
    }
    await galleryStorage.deleteKeys(manifest.files.map((file) => file.objectKey));
}

async function migrateLocalGalleriesToR2() {
    if (!galleryStorage.enabled) return;
    const folders = fs.readdirSync(uploadsDirectory, { withFileTypes: true })
        .filter((item) => item.isDirectory() && validFolderId.test(item.name));
    for (const folder of folders) {
        const folderPath = galleryFolderPath(folder.name);
        if (!folderPath || readGalleryManifest(folderPath)
            || !deliveryStore.getDelivery(folder.name)) {
            continue;
        }
        const records = listGalleryFileRecords(folderPath);
        if (!records.length) continue;
        try {
            const imageNames = records.map((file) => file.name)
                .filter((filename) => !isVideoFilename(filename));
            const failures = await createPreviews(folderPath, imageNames);
            if (failures.length) {
                throw new Error(
                    `no se pudieron preparar ${failures.length} miniaturas`
                );
            }
            await persistGalleryFilesToR2(
                folder.name,
                folderPath,
                records.map((file) => ({
                    filename: file.name,
                    path: path.join(folderPath, file.name),
                    size: file.size,
                    mimetype: file.mimeType
                }))
            );
            console.log(`Galería ${folder.name} migrada a R2 (${records.length} archivos)`);
        } catch (error) {
            console.error(
                `No se pudo migrar la galería ${folder.name}; se conserva en disco local`,
                error
            );
        }
    }
}

const videoExtensions = new Set([".mp4", ".mov", ".m4v", ".webm"]);
function isVideoFilename(filename) {
    return videoExtensions.has(path.extname(filename).toLowerCase());
}

function mediaTypesForFiles(files) {
    return Object.fromEntries(files.map((filename) => [
        filename,
        isVideoFilename(filename) ? "video" : "image"
    ]));
}

function photoPath(folderId, filename) {
    const folderPath = galleryFolderPath(folderId);

    if (!folderPath || typeof filename !== "string"
        || path.basename(filename) !== filename) {
        return null;
    }

    const resolvedPath = path.resolve(folderPath, filename);
    if (path.dirname(resolvedPath) !== folderPath) return null;
    return resolvedPath;
}

function galleryCookieName(folderId) {
    return `phocloud_gallery_${folderId.replaceAll("-", "")}`;
}

function transferCookieName(transferId) {
    return `phocloud_transfer_${transferId.replaceAll("-", "")}`;
}

function isExpired(delivery) {
    return Boolean(delivery?.expiresAt
        && Date.parse(delivery.expiresAt) <= Date.now());
}

function hasGalleryAccess(req, delivery) {
    const photographerSession = getSessionFromRequest(req);
    if (!delivery.hasPassword
        || photographerSession?.userId === delivery.ownerId) return true;

    const token = readCookie(req.headers.cookie, galleryCookieName(delivery.id));
    if (!token) return false;

    return Boolean(deliveryStore.getGallerySession(
        hashSessionToken(token), delivery.id, Date.now()
    ));
}

function getPublicGallery(req, res) {
    const folderPath = galleryFolderPath(req.params.folderId);
    const delivery = deliveryStore.getDeliveryAccess(req.params.folderId);

    if (!folderPath || !delivery || !fs.existsSync(folderPath)) {
        res.status(404).json({ error: "Galería no encontrada" });
        return null;
    }
    const photographerSession = getSessionFromRequest(req);
    if (delivery.status !== "published"
        && photographerSession?.userId !== delivery.ownerId) {
        res.status(404).json({ error: "Galería no encontrada" });
        return null;
    }
    if (isExpired(delivery)
        && photographerSession?.userId !== delivery.ownerId) {
        res.status(410).json({ error: "Esta galería ha caducado" });
        return null;
    }
    if (!hasGalleryAccess(req, delivery)) {
        res.status(401).json({
            error: "Introduce la contraseña para ver esta galería",
            requiresPassword: true
        });
        return null;
    }

    return { folderPath, delivery };
}

function hasTransferAccess(req, transfer) {
    const photographerSession = getSessionFromRequest(req);
    if (!transfer.hasPassword
        || photographerSession?.userId === transfer.ownerId) return true;
    const token = readCookie(req.headers.cookie, transferCookieName(transfer.id));
    return Boolean(token && deliveryStore.getTransferSession(
        hashSessionToken(token), transfer.id, Date.now()
    ));
}

function getPublicTransfer(req, res) {
    const folderPath = transferFolderPath(req.params.transferId);
    const transfer = deliveryStore.getTransferAccess(req.params.transferId);
    const storageAvailable = transfer?.storageProvider === "r2"
        ? objectStorage.enabled && transfer.status === "ready"
        : folderPath && fs.existsSync(folderPath);
    if (!transfer || !storageAvailable) {
        res.status(404).json({ error: "Transferencia no encontrada" });
        return null;
    }
    const photographerSession = getSessionFromRequest(req);
    if (Date.parse(transfer.expiresAt) <= Date.now()
        && photographerSession?.userId !== transfer.ownerId) {
        res.status(410).json({ error: "Esta transferencia ha caducado" });
        return null;
    }
    if (!hasTransferAccess(req, transfer)) {
        res.status(401).json({
            error: "Introduce la contraseña para descargar los archivos",
            requiresPassword: true
        });
        return null;
    }
    return { folderPath, transfer };
}

function parseBoolean(value, fallback = true) {
    if (value === undefined || value === null || value === "") return fallback;
    return value === true || value === "true" || value === "1";
}

function normalizeWebUrl(value, fieldName) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) return { value: "" };
    if (trimmed.length > 240) {
        return { error: `${fieldName} no puede superar 240 caracteres` };
    }

    try {
        const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
            ? trimmed
            : `https://${trimmed}`;
        const url = new URL(candidate);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error();
        return { value: url.href };
    } catch {
        return { error: `${fieldName} debe ser un enlace válido` };
    }
}

function validateSocialLinks(rawValue, legacyUrls) {
    let links = rawValue;
    if (typeof links === "string") {
        try {
            links = links.trim() ? JSON.parse(links) : [];
        } catch {
            return { error: "La lista de enlaces no es válida" };
        }
    }
    if (links === undefined || links === null) {
        links = [
            ["Web", legacyUrls.websiteUrl],
            ["Instagram", legacyUrls.instagramUrl],
            ["Facebook", legacyUrls.facebookUrl],
            ["TikTok", legacyUrls.tiktokUrl]
        ].filter(([, url]) => Boolean(url)).map(([label, url]) => ({ label, url }));
    }
    if (!Array.isArray(links)) return { error: "La lista de enlaces no es válida" };
    if (links.length > 30) {
        return { error: "Puedes añadir hasta 30 enlaces por galería" };
    }

    const normalizedLinks = [];
    for (const item of links) {
        const label = typeof item?.label === "string" ? item.label.trim() : "";
        const rawUrl = typeof item?.url === "string" ? item.url.trim() : "";
        if (!label && !rawUrl) continue;
        if (!label) return { error: "Cada enlace necesita un nombre" };
        if (label.length > 40) {
            return { error: "El nombre de cada enlace no puede superar 40 caracteres" };
        }
        const normalized = normalizeWebUrl(rawUrl, `El enlace «${label}»`);
        if (normalized.error) return normalized;
        normalizedLinks.push({ label, url: normalized.value });
    }
    return { value: normalizedLinks };
}

function validateBrandSettings(input) {
    const brandName = typeof input.brandName === "string"
        ? input.brandName.trim()
        : "";
    if (brandName.length > 80) {
        return { error: "El nombre de marca no puede superar 80 caracteres" };
    }

    const accentColor = input.accentColor || "#c9aa70";
    const backgroundColor = input.backgroundColor || "#ffffff";
    if (!/^#[0-9a-f]{6}$/i.test(accentColor)
        || !/^#[0-9a-f]{6}$/i.test(backgroundColor)) {
        return { error: "Los colores seleccionados no son válidos" };
    }

    const urlFields = [
        ["websiteUrl", "La web"],
        ["instagramUrl", "Instagram"],
        ["facebookUrl", "Facebook"],
        ["tiktokUrl", "TikTok"]
    ];
    const urls = {};
    for (const [key, label] of urlFields) {
        const normalized = normalizeWebUrl(input[key], label);
        if (normalized.error) return normalized;
        urls[key] = normalized.value;
    }
    const socialLinks = validateSocialLinks(input.socialLinks, urls);
    if (socialLinks.error) return socialLinks;

    const galleryStyle = ["masonry", "grid", "editorial"]
        .includes(input.galleryStyle)
        ? input.galleryStyle
        : "masonry";
    const logoScale = Math.max(50, Math.min(160, Number(input.logoScale ?? 100)));
    const logoPositionX = Math.max(0, Math.min(100, Number(input.logoPositionX ?? 50)));
    const logoPositionY = Math.max(0, Math.min(100, Number(input.logoPositionY ?? 50)));
    if (![logoScale, logoPositionX, logoPositionY].every(Number.isFinite)) {
        return { error: "El encuadre de la imagen de marca no es válido" };
    }

    return {
        value: {
            brandName,
            accentColor: accentColor.toLowerCase(),
            backgroundColor: backgroundColor.toLowerCase(),
            galleryStyle,
            logoScale: Math.round(logoScale),
            logoPositionX: Math.round(logoPositionX),
            logoPositionY: Math.round(logoPositionY),
            socialLinks: socialLinks.value,
            ...urls
        }
    };
}

function maximumGalleryExpiry(days, now = Date.now()) {
    const maximum = new Date(now);
    maximum.setUTCDate(maximum.getUTCDate() + Number(days));
    maximum.setUTCHours(23, 59, 59, 999);
    return maximum;
}

function validateDeliverySettings(input, options = {}) {
    const clientName = input.clientName?.trim();
    const clientEmail = normalizeEmail(input.clientEmail);
    const message = input.message?.trim() || "";
    const password = input.password || "";
    let expiresAt = input.expiresAt || null;
    const now = Number(options.now) || Date.now();
    const maxExpiryDays = Number(options.maxExpiryDays) > 0
        ? Number(options.maxExpiryDays)
        : null;

    if (!clientName) return { error: "El nombre del cliente es obligatorio" };
    if (clientName.length > 80) {
        return { error: "El nombre del cliente no puede superar 80 caracteres" };
    }
    if (clientEmail && !validEmail(clientEmail)) {
        return { error: "El correo del cliente no es válido" };
    }
    if (message.length > 300) {
        return { error: "El mensaje no puede superar 300 caracteres" };
    }
    if (password && (password.length < 4 || password.length > 128)) {
        return { error: "La contraseña de la galería debe tener entre 4 y 128 caracteres" };
    }
    if (expiresAt) {
        const timestamp = Date.parse(expiresAt);
        if (Number.isNaN(timestamp) || timestamp <= now) {
            return { error: "La fecha de caducidad debe estar en el futuro" };
        }
        if (maxExpiryDays && timestamp > maximumGalleryExpiry(maxExpiryDays, now).getTime()) {
            return { error: `El plan gratuito permite galerías de hasta ${maxExpiryDays} días` };
        }
        expiresAt = new Date(timestamp).toISOString();
    } else if (maxExpiryDays) {
        expiresAt = maximumGalleryExpiry(maxExpiryDays, now).toISOString();
    }

    const brandValidation = validateBrandSettings(input);
    if (brandValidation.error) return brandValidation;

    const coverStyle = ["immersive", "split", "frame", "minimal", "none"]
        .includes(input.coverStyle)
        ? input.coverStyle
        : "immersive";
    const coverPositionX = Math.max(0, Math.min(100,
        Number(input.coverPositionX ?? 50)
    ));
    const coverPositionY = Math.max(0, Math.min(100,
        Number(input.coverPositionY ?? 50)
    ));
    if (!Number.isFinite(coverPositionX) || !Number.isFinite(coverPositionY)) {
        return { error: "El punto focal de la portada no es válido" };
    }
    const selectionLimit = Math.max(0, Math.min(
        MAX_PHOTOS_PER_DELIVERY,
        Number(input.selectionLimit ?? 0)
    ));
    if (!Number.isFinite(selectionLimit)) {
        return { error: "El límite de selección no es válido" };
    }
    const legacyViewingDefault = input.status
        ? input.status === "published"
        : true;
    const viewingEnabled = parseBoolean(
        input.viewingEnabled,
        legacyViewingDefault
    );
    const allowOriginalDownload = parseBoolean(
        input.allowOriginalDownload,
        parseBoolean(input.allowIndividualDownload)
    );
    const allowWebDownload = parseBoolean(
        input.allowWebDownload,
        parseBoolean(input.allowZipDownload)
    );

    return {
        value: {
            clientName,
            clientEmail,
            status: viewingEnabled ? "published" : "archived",
            viewingEnabled,
            message,
            password,
            expiresAt,
            allowIndividualDownload: allowOriginalDownload,
            allowZipDownload: allowWebDownload,
            allowOriginalDownload,
            allowWebDownload,
            favoritesEnabled: parseBoolean(input.favoritesEnabled),
            selectionLimit: Math.round(selectionLimit),
            coverFilename: typeof input.coverFilename === "string"
                && input.coverFilename
                ? input.coverFilename
                : null,
            coverStyle,
            coverPositionX: Math.round(coverPositionX),
            coverPositionY: Math.round(coverPositionY),
            ...brandValidation.value
        }
    };
}

const TEMPLATE_SETTING_KEYS = [
    "message", "expiresAt", "viewingEnabled", "allowOriginalDownload",
    "allowWebDownload", "favoritesEnabled", "selectionLimit", "brandName",
    "accentColor", "backgroundColor", "galleryStyle", "coverStyle",
    "coverPositionX", "coverPositionY", "logoScale", "logoPositionX",
    "logoPositionY", "socialLinks"
];

function sanitizeTemplateSettings(input) {
    const source = input && typeof input === "object" ? input : {};
    return Object.fromEntries(TEMPLATE_SETTING_KEYS
        .filter((key) => source[key] !== undefined)
        .map((key) => [key, source[key]]));
}

function planLimits(plan) {
    return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

function economicPlanLimits(plan) {
    return economicConfig.plans[plan] || economicConfig.plans.free;
}

function effectivePlan(plan, planStatus = "active") {
    if (plan === "free") return "free";
    return ["active", "trialing", "past_due"].includes(planStatus)
        ? plan
        : "free";
}

function deliveryStorageBytes(delivery) {
    const folderPath = galleryFolderPath(delivery.id);
    if (!folderPath || !fs.existsSync(folderPath)) return 0;
    return listGalleryFileRecords(folderPath)
        .reduce((total, file) => total + file.size, 0);
}

function accountUsage(userId, plan = "free", planStatus = "active") {
    const deliveries = deliveryStore.listDeliveries(userId);
    const transfers = deliveryStore.listTransfers(userId);
    const entitledPlan = effectivePlan(plan, planStatus);
    const limits = planLimits(entitledPlan);
    const economicLimits = economicPlanLimits(entitledPlan);
    const economicUsage = deliveryStore.getEconomicUsage(
        userId, monthKey(), new Date().toISOString()
    );
    return {
        plan: entitledPlan,
        galleryCount: deliveries.length,
        reservedGalleryCount:
            deliveryStore.countActiveTransferConversions(userId),
        totalGalleryCount: deliveries.length,
        galleryLimit: limits.galleries,
        transferCount: transfers.length,
        transferStorageBytes: transfers.reduce(
            (total, transfer) => total + transfer.totalBytes, 0
        ),
        transferStorageLimitBytes: limits.transferStorageBytes,
        transferMaxBytes: economicLimits.transferMaxBytes,
        galleryLifetimeDays: limits.galleryLifetimeDays,
        monthlyUploadBytes: Number(economicUsage.counters.uploaded_bytes || 0),
        monthlyReservedUploadBytes: Number(
            economicUsage.counters.reserved_upload_bytes || 0
        ),
        monthlyUploadLimitBytes: economicLimits.monthlyUploadBytes,
        activeUploads: economicUsage.activeUploads,
        concurrentUploadLimit: economicLimits.concurrentUploads,
        zipMaxBytes: economicLimits.zipMaxBytes,
        monthlyZipJobs: Number(economicUsage.counters.zip_jobs_started || 0),
        monthlyZipJobLimit: economicLimits.monthlyZipJobs,
        monthlyZipBytes: Number(economicUsage.counters.zip_generated_bytes || 0),
        monthlyZipLimitBytes: economicLimits.monthlyZipBytes,
        transfersAcceptingNew: economicConfig.acceptNewTransfers,
        zipEnabled: economicConfig.zipEnabled,
        storageBytes: deliveries.reduce(
            (total, delivery) => total + deliveryStorageBytes(delivery), 0
        ),
        reservedGalleryStorageBytes:
            deliveryStore.getReservedTransferConversionBytes(userId),
        storageLimitBytes: limits.storageBytes
    };
}

function transferAdmissionLimits(plan, guest = false) {
    const limits = economicPlanLimits(plan);
    return {
        transferMaxBytes: guest
            ? Math.min(limits.transferMaxBytes, economicConfig.guestTransferMaxBytes)
            : limits.transferMaxBytes,
        accountStorageBytes: limits.transferStorageBytes,
        accountMonthlyUploadBytes: limits.monthlyUploadBytes,
        accountConcurrentUploads: limits.concurrentUploads,
        globalStorageBytes: guest
            ? Math.min(economicConfig.globalTransferStorageBytes,
                economicConfig.guestGlobalStorageBytes)
            : economicConfig.globalTransferStorageBytes,
        globalMonthlyUploadBytes: guest
            ? Math.min(economicConfig.globalMonthlyUploadBytes,
                economicConfig.guestGlobalMonthlyUploadBytes)
            : economicConfig.globalMonthlyUploadBytes,
        globalConcurrentUploads: economicConfig.globalConcurrentUploads,
        globalMonthlyDownloadBytes: economicConfig.globalMonthlyDownloadBytes,
        globalMonthlyErrorLimit: economicConfig.globalMonthlyErrorLimit
    };
}

function zipAdmissionLimits(plan) {
    const limits = economicPlanLimits(plan);
    return {
        accountZipMaxBytes: limits.zipMaxBytes,
        accountMonthlyZipJobs: limits.monthlyZipJobs,
        accountMonthlyZipBytes: limits.monthlyZipBytes,
        accountConcurrentZips: economicConfig.accountConcurrentZips,
        globalMonthlyZipJobs: economicConfig.globalMonthlyZipJobs,
        globalMonthlyZipBytes: economicConfig.globalMonthlyZipBytes,
        globalConcurrentZips: economicConfig.globalConcurrentZips,
        globalMonthlyErrorLimit: economicConfig.globalMonthlyErrorLimit
    };
}

function quotaMessage(code) {
    return ({
        PLAN_TRANSFER_SIZE_LIMIT: "Esta transferencia supera el tamaño máximo de tu plan",
        PLAN_TRANSFER_STORAGE_LIMIT: "Esta transferencia supera el espacio temporal de tu plan",
        PLAN_MONTHLY_UPLOAD_LIMIT: "Has alcanzado la cuota mensual de transferencias de tu plan",
        ACCOUNT_UPLOAD_CONCURRENCY_LIMIT: "Ya tienes otra subida en curso. Termínala o cancélala antes de continuar",
        GLOBAL_TRANSFER_STORAGE_LIMIT: "Las nuevas transferencias están pausadas temporalmente por capacidad",
        GLOBAL_MONTHLY_UPLOAD_LIMIT: "Las nuevas transferencias están pausadas temporalmente por consumo mensual",
        GLOBAL_UPLOAD_CONCURRENCY_LIMIT: "Hay demasiadas subidas simultáneas. Inténtalo de nuevo en unos minutos",
        GLOBAL_DOWNLOAD_THRESHOLD: "Las nuevas operaciones costosas están pausadas temporalmente",
        GLOBAL_ERROR_THRESHOLD: "Las nuevas operaciones están pausadas mientras revisamos una incidencia",
        PLAN_ZIP_SIZE_LIMIT: "Este paquete es demasiado grande para generarlo como ZIP. Descarga los archivos individualmente",
        PLAN_MONTHLY_ZIP_JOB_LIMIT: "Has alcanzado el límite mensual de paquetes ZIP",
        PLAN_MONTHLY_ZIP_BYTES_LIMIT: "Has alcanzado la cuota mensual de datos procesados en ZIP",
        ACCOUNT_ZIP_CONCURRENCY_LIMIT: "Ya se está preparando otro ZIP para esta cuenta",
        GLOBAL_MONTHLY_ZIP_JOB_LIMIT: "La generación de ZIP está pausada temporalmente",
        GLOBAL_MONTHLY_ZIP_BYTES_LIMIT: "La generación de ZIP está pausada por el umbral mensual",
        GLOBAL_ZIP_CONCURRENCY_LIMIT: "Hay otros paquetes preparándose. Inténtalo de nuevo en unos minutos"
    })[code] || "Esta operación está temporalmente limitada";
}

function recordUsage(ownerId, metric, value) {
    try {
        deliveryStore.recordUsageMetric(ownerId, metric, value);
    } catch (error) {
        console.error("No se pudo registrar una métrica económica", error);
    }
}

function operationsAuthorized(req) {
    const expected = process.env.PHOCLOUD_OPERATIONS_TOKEN;
    const supplied = req.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!expected || !supplied) return false;
    const expectedHash = createHash("sha256").update(expected).digest();
    const suppliedHash = createHash("sha256").update(supplied).digest();
    return timingSafeEqual(expectedHash, suppliedHash);
}

function currentGalleryStorageBytes() {
    if (!fs.existsSync(uploadsDirectory)) return 0;
    return fs.readdirSync(uploadsDirectory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .reduce((total, entry) => total + deliveryStorageBytes({ id: entry.name }), 0);
}

function ownerPlan(ownerId) {
    const account = userForCurrentBillingEnvironment(deliveryStore.getUserById(ownerId));
    return effectivePlan(account?.plan || "free", account?.planStatus);
}

function transferZipObjectName(transfer) {
    return `Straclase-${safeDownloadName(transfer.title)}.zip`;
}

function lazyObjectStream(objectKey) {
    return Readable.from((async function* readObject() {
        const source = await objectStorage.getObjectStream(objectKey);
        for await (const chunk of source) yield chunk;
    })());
}

function startTransferZipBuild(transfer, files) {
    if (activeZipBuilds.has(transfer.id)) return activeZipBuilds.get(transfer.id);
    const plan = ownerPlan(transfer.ownerId);
    const release = zipConcurrency.tryAcquire(transfer.ownerId, {
        globalLimit: economicConfig.globalConcurrentZips,
        accountLimit: economicConfig.accountConcurrentZips
    });
    if (!release) return null;

    const operation = (async () => {
        const objectKey = objectStorage.zipKey(transfer.id);
        let writtenBytes = 0;
        const counter = new Transform({
            transform(chunk, encoding, callback) {
                writtenBytes += chunk.length;
                callback(null, chunk);
            }
        });
        const body = new PassThrough();
        const archive = new ZipArchive({ store: true });
        const upload = objectStorage.uploadStream({
            key: objectKey,
            stream: body,
            contentType: "application/zip",
            filename: transferZipObjectName(transfer)
        });
        archive.pipe(counter).pipe(body);
        try {
            for (const file of files) {
                archive.append(lazyObjectStream(file.objectKey), { name: file.name });
            }
            await archive.finalize();
            await upload;
            deliveryStore.completeTransferZip(
                transfer.id, writtenBytes, new Date().toISOString()
            );
        } catch (error) {
            archive.abort();
            body.destroy(error);
            await objectStorage.deleteKeys([objectKey]).catch(() => {});
            deliveryStore.failTransferZip(
                transfer.id, "ZIP_BUILD_FAILED", new Date().toISOString()
            );
            recordUsage(transfer.ownerId, "errors", 1);
            console.error(`[ZIP ${transfer.id}]`, error);
        } finally {
            release();
            activeZipBuilds.delete(transfer.id);
        }
    })();
    activeZipBuilds.set(transfer.id, operation);
    return operation;
}

function prepareTransferZip(transfer) {
    if (!economicConfig.zipEnabled) {
        return { ok: false, code: "ZIP_PAUSED", status: 503 };
    }
    const plan = ownerPlan(transfer.ownerId);
    const planLimit = economicPlanLimits(plan);
    if (transfer.totalBytes > planLimit.zipMaxBytes) {
        return { ok: false, code: "PLAN_ZIP_SIZE_LIMIT", status: 403 };
    }
    if (transfer.storageProvider !== "r2") {
        return { ok: true, state: "local" };
    }
    const files = deliveryStore.listTransferFiles(transfer.id)
        .filter((file) => file.status === "ready");
    if (!files.length || files.some((file) => !file.objectKey)) {
        return { ok: false, code: "ZIP_SOURCE_NOT_READY", status: 409 };
    }
    const now = new Date();
    const reservation = deliveryStore.reserveTransferZip({
        transferId: transfer.id,
        ownerId: transfer.ownerId,
        objectKey: objectStorage.zipKey(transfer.id),
        expectedBytes: transfer.totalBytes,
        period: monthKey(now),
        nowIso: now.toISOString(),
        staleBeforeIso: new Date(now.getTime() - economicConfig.zipLeaseMs).toISOString(),
        limits: zipAdmissionLimits(plan)
    });
    if (!reservation.ok) {
        return { ok: false, code: reservation.code, status: 429 };
    }
    if (reservation.status === "ready") {
        return { ok: true, state: "ready", job: reservation.job };
    }
    if (!activeZipBuilds.has(transfer.id)) {
        const started = startTransferZipBuild(transfer, files);
        if (!started) {
            deliveryStore.failTransferZip(
                transfer.id, "ZIP_CONCURRENCY_LIMIT", new Date().toISOString()
            );
            return { ok: false, code: "GLOBAL_ZIP_CONCURRENCY_LIMIT", status: 429 };
        }
    }
    return { ok: true, state: "building" };
}

function reserveEphemeralZip(ownerId, expectedBytes) {
    if (!economicConfig.zipEnabled) {
        return { ok: false, code: "ZIP_PAUSED", status: 503 };
    }
    const result = deliveryStore.reserveEphemeralZip({
        ownerId,
        expectedBytes,
        period: monthKey(),
        nowIso: new Date().toISOString(),
        limits: zipAdmissionLimits(ownerPlan(ownerId))
    });
    return result.ok ? result : { ...result, status: 429 };
}

function acquireUploadSlot(res, ownerId, plan) {
    const release = uploadConcurrency.tryAcquire(ownerId, {
        globalLimit: economicConfig.globalConcurrentUploads,
        accountLimit: economicPlanLimits(plan).concurrentUploads
    });
    if (!release) return false;
    let released = false;
    const releaseOnce = () => {
        if (released) return;
        released = true;
        release();
    };
    res.once("finish", releaseOnce);
    res.once("close", releaseOnce);
    return true;
}

function publicBaseUrl(req) {
    return (process.env.PHOCLOUD_PUBLIC_URL
        || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}

function safeDownloadName(clientName) {
    const normalizedName = (clientName || "galeria")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 70);

    return normalizedName || "galeria";
}

function webPhotoName(filename) {
    return `${path.parse(filename).name}-web.jpg`;
}

function isSupportedImageBuffer(header) {
    if (header.length < 10) return false;
    const ascii = header.toString("ascii");
    const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    const isPng = header.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    const isGif = ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a");
    const isWebp = ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
    const isoBrand = ascii.slice(8, 12);
    const isModernPhoto = ascii.slice(4, 8) === "ftyp"
        && ["avif", "avis", "heic", "heix", "hevc", "hevx", "mif1", "msf1"]
            .includes(isoBrand);

    return isJpeg || isPng || isGif || isWebp || isModernPhoto;
}

function isSupportedImageFile(filePath) {
    const handle = fs.openSync(filePath, "r");
    const header = Buffer.alloc(24);
    let bytesRead;

    try {
        bytesRead = fs.readSync(handle, header, 0, header.length, 0);
    } finally {
        fs.closeSync(handle);
    }

    return isSupportedImageBuffer(header.subarray(0, bytesRead));
}

function isSupportedVideoFile(filePath) {
    const handle = fs.openSync(filePath, "r");
    const header = Buffer.alloc(32);
    let bytesRead;
    try {
        bytesRead = fs.readSync(handle, header, 0, header.length, 0);
    } finally {
        fs.closeSync(handle);
    }
    const bytes = header.subarray(0, bytesRead);
    return isSupportedVideoBuffer(bytes);
}

function isSupportedVideoBuffer(bytes) {
    const isWebm = bytes.length >= 4
        && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    const isIsoVideo = bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp";
    return isWebm || isIsoVideo;
}

function uploadedFilesAreMedia(files) {
    return files.every((file) => isVideoFilename(file.filename)
        ? isSupportedVideoFile(file.path)
        : isSupportedImageFile(file.path));
}

function uploadedFilesRespectSizeLimits(files) {
    return files.every((file) => file.size <= (
        isVideoFilename(file.filename) ? MAX_VIDEO_SIZE_BYTES : MAX_PHOTO_SIZE_BYTES
    ));
}

function profileLogoPath(userId) {
    return path.join(brandingDirectory, String(userId), "logo.png");
}

function galleryHasLogo(folderPath) {
    return fs.existsSync(galleryLogoPath(folderPath));
}

function cookieOptions() {
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
        path: "/",
        maxAge: SESSION_DURATION_MS
    };
}

function googleOAuthCookieOptions() {
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
        path: "/auth/google",
        maxAge: GOOGLE_OAUTH_MAX_AGE_MS
    };
}

function googleRedirectUri(req) {
    return `${publicBaseUrl(req)}/auth/google/callback`;
}

function googleErrorRedirect(res, message) {
    res.redirect(302, `/login?oauthError=${encodeURIComponent(message)}`);
}

function analyticsDistinctId(userId) {
    return createHash("sha256")
        .update(`straclase-account:${userId}`)
        .digest("hex").slice(0, 32);
}

function isAnalyticsAdmin(user) {
    return Boolean(user?.email)
        && analyticsAdminEmails.has(user.email.trim().toLowerCase());
}

function safeAnalyticsPath(value) {
    const aliases = { "/send": "/enviar", "/app/": "/app" };
    const path = aliases[value] || value;
    return new Set(["/", "/enviar", "/login", "/app"]).has(path)
        ? path
        : "/other";
}

function safeTrafficSource(value) {
    const source = typeof value === "string" ? value.trim() : "";
    return source && /^[\p{L}\p{N} ._-]{1,100}$/u.test(source)
        ? source
        : "Directo";
}

function getSessionFromRequest(req) {
    const token = readCookie(
        req.headers.cookie,
        SESSION_COOKIE_NAME
    );

    if (!token) return null;

    return deliveryStore.getSession(
        hashSessionToken(token),
        Date.now()
    );
}

function startSession(res, userId) {
    const now = Date.now();
    const session = createSessionToken();

    deliveryStore.createSession({
        tokenHash: session.tokenHash,
        userId,
        createdAt: now,
        expiresAt: now + SESSION_DURATION_MS
    });

    res.cookie(
        SESSION_COOKIE_NAME,
        session.token,
        cookieOptions()
    );
}

function requirePageAuth(req, res, next) {
    const session = getSessionFromRequest(req);

    if (!session) {
        return res.redirect(302, "/login");
    }

    req.auth = session;
    next();
}

function requireAuth(req, res, next) {
    const session = getSessionFromRequest(req);

    if (!session) {
        return res.status(401).json({ error: "Inicia sesión para continuar" });
    }

    req.auth = session;
    next();
}

function guestUploadOwner(req) {
    const token = readCookie(req.headers.cookie, GUEST_UPLOAD_COOKIE_NAME);
    if (!token) return null;
    return deliveryStore.getGuestUploadSession(hashSessionToken(token), Date.now());
}

function allowTransferCreator(req, res, next) {
    const session = getSessionFromRequest(req);
    if (session) {
        req.auth = session;
        req.guestTransfer = false;
        return next();
    }
    if (!economicConfig.guestTransfersEnabled) {
        return res.status(503).json({
            error: "Los envíos sin cuenta están pausados temporalmente",
            code: "GUEST_TRANSFERS_PAUSED"
        });
    }
    const currentGuest = guestUploadOwner(req);
    if (currentGuest) {
        req.auth = { userId: currentGuest.userId };
        req.guestTransfer = true;
        return next();
    }
    const now = Date.now();
    const token = createSessionToken();
    const password = createPasswordRecord(`${uuidv4()}${uuidv4()}`);
    const userId = deliveryStore.createGuestUser({
        username: `guest_${uuidv4()}`,
        passwordHash: password.passwordHash,
        passwordSalt: password.passwordSalt,
        createdAt: new Date(now).toISOString()
    });
    deliveryStore.createGuestUploadSession({
        tokenHash: token.tokenHash,
        userId,
        createdAt: now,
        expiresAt: now + GUEST_UPLOAD_SESSION_DURATION_MS
    });
    res.cookie(GUEST_UPLOAD_COOKIE_NAME, token.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
        path: "/",
        maxAge: GUEST_UPLOAD_SESSION_DURATION_MS
    });
    req.auth = { userId };
    req.guestTransfer = true;
    next();
}

function requireTransferUploadOwner(req, res, next) {
    const session = getSessionFromRequest(req);
    const guest = session ? null : guestUploadOwner(req);
    const userId = session?.userId || guest?.userId;
    const transfer = userId
        ? deliveryStore.getOwnedTransfer(req.params.transferId, userId)
        : null;
    if (!transfer) {
        return res.status(401).json({ error: "No tienes acceso a esta subida" });
    }
    req.auth = session || { userId };
    req.guestTransfer = !session;
    req.ownedTransfer = transfer;
    next();
}

function requireSameOrigin(req, res, next) {
    const origin = req.get("Origin");

    if (!origin) {
        return isProduction
            ? res.status(403).json({ error: "Falta el origen de la solicitud" })
            : next();
    }

    const expectedOrigin = process.env.PHOCLOUD_PUBLIC_URL
        ? new URL(process.env.PHOCLOUD_PUBLIC_URL).origin
        : `${req.protocol}://${req.get("host")}`;

    if (origin !== expectedOrigin) {
        return res.status(403).json({ error: "Origen de solicitud no permitido" });
    }

    next();
}

function isLocalRequest(req) {
    return req.ip === "127.0.0.1"
        || req.ip === "::1"
        || req.ip === "::ffff:127.0.0.1";
}

function validatePassword(password) {
    if (typeof password !== "string"
        || password.length < 10
        || password.length > 128) {
        return "La contraseña debe tener entre 10 y 128 caracteres";
    }

    return null;
}

function normalizeEmail(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validEmail(email) {
    return email.length <= 254
        && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function transferSenderEmailIsVerified(req, email, now = Date.now()) {
    if (!req.guestTransfer) {
        const user = deliveryStore.getUserById(req.auth.userId);
        if (Boolean(user?.emailVerifiedAt)
            && normalizeEmail(user.email) === email) {
            return true;
        }
    }
    const verification = deliveryStore.getTransferSenderVerification(
        req.auth.userId, email
    );
    return Boolean(
        verification?.verifiedAt
        && Number(verification.expiresAt) > now
    );
}

function transferSenderEmail(req, value) {
    const requested = normalizeEmail(value);
    if (requested || req.guestTransfer) return requested;
    return normalizeEmail(
        deliveryStore.getUserById(req.auth.userId)?.email
    );
}

function validateRegistration({ displayName, email, password }) {
    const passwordError = validatePassword(password);
    if (passwordError) return passwordError;
    if (typeof displayName !== "string"
        || displayName.trim().length < 2
        || displayName.trim().length > 80) {
        return "El nombre debe tener entre 2 y 80 caracteres";
    }
    if (!validEmail(email)) return "Escribe un correo electrónico válido";
    return null;
}

function internalUsername() {
    return `account_${uuidv4()}`;
}

async function issueAccountLink(req, user, purpose) {
    const now = Date.now();
    const token = createSessionToken();
    const expiresAt = now + (purpose === "verify_email"
        ? ACCOUNT_TOKEN_DURATION_MS
        : RESET_TOKEN_DURATION_MS);
    deliveryStore.createAccountToken({
        tokenHash: token.tokenHash,
        userId: user.id,
        purpose,
        createdAt: now,
        expiresAt
    });
    const route = purpose === "verify_email" ? "verify" : "reset";
    const link = `${publicBaseUrl(req)}/login?mode=${route}&token=${encodeURIComponent(token.token)}`;
    const result = await sendAccountLink({
        to: user.email,
        displayName: user.displayName || user.email || "Usuario",
        purpose,
        link
    });
    return {
        delivered: result.delivered,
        devLink: process.env.NODE_ENV === "production" ? null : result.devLink
    };
}

function isLoginRateLimited(ip) {
    const now = Date.now();
    const attempt = loginAttempts.get(ip);

    if (!attempt || attempt.resetAt <= now) {
        loginAttempts.delete(ip);
        return false;
    }

    return attempt.count >= 5;
}

function recordLoginFailure(ip) {
    const now = Date.now();
    const current = loginAttempts.get(ip);

    if (!current || current.resetAt <= now) {
        loginAttempts.set(ip, {
            count: 1,
            resetAt: now + 15 * 60 * 1000
        });
        return;
    }

    current.count += 1;
}

function isGalleryRateLimited(key) {
    const now = Date.now();
    const attempt = galleryAttempts.get(key);

    if (!attempt || attempt.resetAt <= now) {
        galleryAttempts.delete(key);
        return false;
    }

    return attempt.count >= 8;
}

function recordGalleryFailure(key) {
    const now = Date.now();
    const current = galleryAttempts.get(key);

    if (!current || current.resetAt <= now) {
        galleryAttempts.set(key, {
            count: 1,
            resetAt: now + 15 * 60 * 1000
        });
        return;
    }

    current.count += 1;
}

function limitSensitiveAction(req, res, next) {
    const now = Date.now();
    const key = `${req.ip}:${req.path}`;
    const current = sensitiveActionAttempts.get(key);
    if (!current || current.resetAt <= now) {
        sensitiveActionAttempts.set(key, {
            count: 1,
            resetAt: now + 15 * 60 * 1000
        });
        return next();
    }
    if (current.count >= 10) {
        res.set("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
        return res.status(429).json({
            error: "Demasiadas solicitudes. Espera unos minutos."
        });
    }
    current.count += 1;
    next();
}

function limitAnalyticsEvent(req, res, next) {
    const now = Date.now();
    const current = analyticsAttempts.get(req.ip);
    if (!current || current.resetAt <= now) {
        analyticsAttempts.set(req.ip, { count: 1, resetAt: now + 60_000 });
        return next();
    }
    if (current.count >= 120) return res.status(429).end();
    current.count += 1;
    next();
}

const supportedImageMimeTypes = new Set([
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "image/avif", "image/heic", "image/heif"
]);
const supportedVideoMimeTypes = new Set([
    "video/mp4", "video/quicktime", "video/x-m4v", "video/webm"
]);
const supportedLogoMimeTypes = new Set([
    "image/jpeg", "image/png", "image/gif"
]);

const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        const folderPath = galleryFolderPath(req.folderId);

        if (!folderPath) {
            return callback(new Error("Identificador de entrega no válido"));
        }

        const destination = file.fieldname === "logo"
            ? path.join(folderPath, BRAND_FOLDER)
            : folderPath;
        fs.mkdirSync(destination, { recursive: true });
        callback(null, destination);
    },
    filename: (req, file, callback) => {
        const folderPath = galleryFolderPath(req.folderId);
        const parsed = path.parse(path.basename(file.originalname));
        const extensionsByMimeType = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/gif": ".gif",
            "image/webp": ".webp",
            "image/avif": ".avif",
            "image/heic": ".heic",
            "image/heif": ".heif",
            "video/mp4": ".mp4",
            "video/quicktime": ".mov",
            "video/x-m4v": ".m4v",
            "video/webm": ".webm"
        };
        const safeBase = parsed.name
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 140) || "fotografia";
        const safeExtension = extensionsByMimeType[file.mimetype] || ".jpg";
        if (file.fieldname === "logo") {
            return callback(null, `logo-upload${safeExtension}`);
        }
        let filename = `${safeBase}${safeExtension}`;
        let copyNumber = 2;

        const existingNames = new Set(
            folderPath && fs.existsSync(folderPath)
                ? listGalleryFiles(folderPath)
                : []
        );
        while (folderPath && (
            existingNames.has(filename)
            || fs.existsSync(path.join(folderPath, filename))
        )) {
            filename = `${safeBase}-${copyNumber}${safeExtension}`;
            copyNumber += 1;
        }

        callback(null, filename);
    }
});

const upload = multer({
    storage,
    limits: {
        files: MAX_PHOTOS_PER_DELIVERY + 1,
        fileSize: MAX_VIDEO_SIZE_BYTES
    },
    fileFilter: (req, file, callback) => {
        if (file.fieldname === "logo"
            && !supportedLogoMimeTypes.has(file.mimetype)) {
            return callback(new Error(
                "La imagen de marca debe ser JPG, PNG o GIF"
            ));
        }
        if (!supportedImageMimeTypes.has(file.mimetype)
            && !supportedVideoMimeTypes.has(file.mimetype)) {
            return callback(new Error("Solo se pueden subir fotografías o vídeos compatibles"));
        }

        callback(null, true);
    }
});

const brandLogoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1, fileSize: MAX_LOGO_SIZE_BYTES },
    fileFilter: (req, file, callback) => {
        if (!supportedLogoMimeTypes.has(file.mimetype)) {
            return callback(new Error("La imagen de marca debe ser JPG, PNG o GIF"));
        }
        callback(null, true);
    }
});

const blockedTransferExtensions = new Set([
    ".exe", ".msi", ".msp", ".com", ".scr", ".bat", ".cmd",
    ".ps1", ".vbs", ".js", ".jar", ".apk", ".app", ".dmg"
]);

function safeTransferFilename(value, usedNames = new Set()) {
    const parsed = path.parse(path.basename(typeof value === "string" ? value : ""));
    const safeBase = parsed.name
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
        .replace(/\s+/g, " ").trim().slice(0, 150) || "archivo";
    const safeExtension = parsed.ext
        .replace(/[^a-zA-Z0-9.]/g, "").slice(0, 16).toLowerCase();
    let filename = `${safeBase}${safeExtension}`;
    let copyNumber = 2;
    while (usedNames.has(filename.toLocaleLowerCase("es"))) {
        filename = `${safeBase}-${copyNumber}${safeExtension}`;
        copyNumber += 1;
    }
    usedNames.add(filename.toLocaleLowerCase("es"));
    return filename;
}

function transferFilesForConversion(transfer) {
    if (transfer.storageProvider === "r2") {
        return deliveryStore.listTransferFiles(transfer.id)
            .filter((file) => file.status === "ready")
            .map((file) => ({
                sourceId: file.id,
                name: file.name,
                size: Number(file.size),
                mimeType: file.mimeType || mimeTypeForGalleryFile(file.name),
                objectKey: file.objectKey,
                localPath: null
            }));
    }
    const folderPath = transferFolderPath(transfer.id);
    if (!folderPath || !fs.existsSync(folderPath)) return [];
    return listTransferFiles(folderPath).map((file) => ({
        sourceId: file.name,
        name: file.name,
        size: Number(file.size),
        mimeType: mimeTypeForGalleryFile(file.name),
        objectKey: null,
        localPath: transferFilePath(transfer.id, file.name)
    }));
}

function classifyTransferFilesForGallery(transfer) {
    const compatible = [];
    const excluded = [];
    for (const file of transferFilesForConversion(transfer)) {
        const mimeType = mimeTypeForGalleryFile(file.name);
        const isVideo = isVideoFilename(file.name);
        const supported = mimeType !== "application/octet-stream";
        const sizeLimit = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_PHOTO_SIZE_BYTES;
        if (!supported) {
            excluded.push({ sourceId: file.sourceId, name: file.name,
                reason: "Formato no compatible con galerías" });
        } else if (file.size > sizeLimit) {
            excluded.push({ sourceId: file.sourceId, name: file.name,
                reason: `Supera el límite de ${isVideo ? "500 MB por vídeo" : "50 MB por foto"}` });
        } else {
            compatible.push({
                ...file,
                mimeType,
                mediaType: isVideo ? "video" : "image"
            });
        }
    }
    return { compatible, excluded };
}

function publicConversionJob(job, req) {
    return {
        id: job.id,
        transferId: job.transferId,
        deliveryId: job.deliveryId,
        status: job.status,
        expectedBytes: job.expectedBytes,
        copiedBytes: job.copiedBytes,
        progress: job.expectedBytes > 0
            ? Math.min(100, Math.round(job.copiedBytes / job.expectedBytes * 100))
            : (job.status === "ready" ? 100 : 0),
        errorCode: job.errorCode,
        galleryLink: job.status === "ready"
            ? `${publicBaseUrl(req)}/s/${job.deliveryId}`
            : null
    };
}

function conversionFailureCode(error) {
    const known = new Set([
        "TRANSFER_STORAGE_UNAVAILABLE", "TRANSFER_SOURCE_MISSING",
        "INVALID_MEDIA_CONTENT"
    ]);
    if (known.has(error?.message)) return error.message;
    if (["AccessDenied", "NoSuchKey", "SlowDown"].includes(error?.name)) {
        return `R2_${String(error.name).toUpperCase()}`;
    }
    return "CONVERSION_FAILED";
}

async function streamToFile(stream, targetPath) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    await pipeline(stream, fs.createWriteStream(targetPath, { flags: "wx" }));
}

async function copyConversionFile(job, transfer, file, folderPath, remoteRecords) {
    const destinationPath = path.join(folderPath, file.destinationName);
    const isVideo = file.mediaType === "video";
    let remoteKey = null;

    if (transfer.storageProvider === "r2") {
        if (!objectStorage.enabled) throw new Error("TRANSFER_STORAGE_UNAVAILABLE");
        const header = await objectStorage.getObjectPrefix(file.objectKey, 64);
        const validMedia = isVideo
            ? isSupportedVideoBuffer(header)
            : isSupportedImageBuffer(header);
        if (!validMedia) throw new Error("INVALID_MEDIA_CONTENT");
        if (galleryStorage.enabled) {
            try {
                remoteKey = await galleryStorage.copyObject({
                    sourceBucket: objectStorage.bucket,
                    sourceKey: file.objectKey,
                    deliveryId: job.deliveryId,
                    filename: file.destinationName,
                    contentType: file.mimeType
                });
            } catch (copyError) {
                console.warn(
                    `Copia interna R2 no disponible para ${file.name}; se usará streaming`,
                    copyError.message
                );
                remoteKey = await galleryStorage.uploadStream({
                    deliveryId: job.deliveryId,
                    filename: file.destinationName,
                    stream: await objectStorage.getObjectStream(file.objectKey),
                    contentType: file.mimeType
                });
            }
            if (!isVideo) {
                await streamToFile(
                    await objectStorage.getObjectStream(file.objectKey),
                    destinationPath
                );
                await createPreview(folderPath, file.destinationName);
                fs.rmSync(destinationPath, { force: true });
            }
        } else {
            await streamToFile(
                await objectStorage.getObjectStream(file.objectKey),
                destinationPath
            );
            if (!isVideo) await createPreview(folderPath, file.destinationName);
        }
    } else {
        const sourcePath = transferFilePath(transfer.id, file.name);
        if (!sourcePath || !fs.existsSync(sourcePath)) {
            throw new Error("TRANSFER_SOURCE_MISSING");
        }
        fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
        const validMedia = isVideo
            ? isSupportedVideoFile(destinationPath)
            : isSupportedImageFile(destinationPath);
        if (!validMedia) throw new Error("INVALID_MEDIA_CONTENT");
        if (!isVideo) await createPreview(folderPath, file.destinationName);
        if (galleryStorage.enabled) {
            remoteKey = await galleryStorage.uploadFile({
                deliveryId: job.deliveryId,
                filename: file.destinationName,
                filePath: destinationPath,
                contentType: file.mimeType,
                size: file.size
            });
            fs.rmSync(destinationPath, { force: true });
        }
    }

    if (remoteKey) {
        remoteRecords.push({
            name: file.destinationName,
            objectKey: remoteKey,
            size: file.size,
            mimeType: file.mimeType
        });
    }
}

async function runTransferConversion(jobId) {
    if (activeConversionBuilds.has(jobId)) return activeConversionBuilds.get(jobId);
    const task = (async () => {
        const initial = deliveryStore.getTransferConversion(jobId);
        if (!initial) return;
        if (deliveryStore.getDelivery(initial.deliveryId)) {
            if (!deliveryStore.getSelectionSettings(initial.deliveryId)) {
                deliveryStore.saveSelectionSettings({
                    deliveryId: initial.deliveryId,
                    selectionLimit: initial.settings.selectionLimit || 0,
                    status: "open",
                    clientName: "",
                    clientEmail: "",
                    submittedAt: null,
                    updatedAt: new Date().toISOString()
                });
            }
            deliveryStore.completeTransferConversion(jobId, new Date().toISOString());
            return;
        }
        if (!deliveryStore.claimTransferConversion(jobId, new Date().toISOString())) return;

        const job = deliveryStore.getTransferConversion(jobId);
        const transfer = deliveryStore.getTransfer(job.transferId);
        const folderPath = galleryFolderPath(job.deliveryId);
        const remoteRecords = [];
        try {
            if (!transfer || transfer.status !== "ready") {
                throw new Error("TRANSFER_SOURCE_MISSING");
            }
            fs.rmSync(folderPath, { recursive: true, force: true });
            fs.mkdirSync(folderPath, { recursive: true });

            const defaultLogoPath = profileLogoPath(job.ownerId);
            if (fs.existsSync(defaultLogoPath)) {
                fs.mkdirSync(path.dirname(galleryLogoPath(folderPath)), {
                    recursive: true
                });
                fs.copyFileSync(defaultLogoPath, galleryLogoPath(folderPath));
            }

            let copiedBytes = 0;
            for (const file of job.selectedFiles) {
                await copyConversionFile(job, transfer, file, folderPath, remoteRecords);
                copiedBytes += file.size;
                deliveryStore.updateTransferConversionProgress(
                    job.id, copiedBytes, new Date().toISOString()
                );
            }
            if (galleryStorage.enabled) writeGalleryManifest(folderPath, remoteRecords);

            const now = new Date().toISOString();
            deliveryStore.createDelivery({
                id: job.deliveryId,
                ownerId: job.ownerId,
                ...job.settings,
                passwordHash: null,
                passwordSalt: null,
                createdAt: now,
                publishedAt: job.settings.status === "published" ? now : null,
                updatedAt: now,
                photoCount: job.selectedFiles.length
            });
            deliveryStore.saveSelectionSettings({
                deliveryId: job.deliveryId,
                selectionLimit: job.settings.selectionLimit || 0,
                status: "open",
                clientName: "",
                clientEmail: "",
                submittedAt: null,
                updatedAt: now
            });
            deliveryStore.completeTransferConversion(job.id, now);
            recordUsage(job.ownerId, "gallery_converted_bytes", job.expectedBytes);
            recordUsage(job.ownerId, "gallery_conversions", 1);
        } catch (error) {
            console.error(`No se pudo convertir la transferencia ${job.transferId}`, error);
            if (galleryStorage.enabled) {
                await galleryStorage.deleteKeys(job.selectedFiles.map((file) => (
                    galleryStorage.objectKey(job.deliveryId, file.destinationName)
                ))).catch(() => {});
            }
            if (!deliveryStore.getDelivery(job.deliveryId) && folderPath) {
                fs.rmSync(folderPath, { recursive: true, force: true });
            }
            deliveryStore.failTransferConversion(
                job.id, conversionFailureCode(error), new Date().toISOString()
            );
            recordUsage(job.ownerId, "errors", 1);
        }
    })().finally(() => activeConversionBuilds.delete(jobId));
    activeConversionBuilds.set(jobId, task);
    return task;
}

function resumeTransferConversions() {
    for (const job of deliveryStore.listRecoverableTransferConversions()) {
        runTransferConversion(job.id).catch(console.error);
    }
}

const transferStorage = multer.diskStorage({
    destination: (req, file, callback) => {
        const folderPath = transferFolderPath(req.transferId);
        if (!folderPath) return callback(new Error("Identificador de transferencia no válido"));
        fs.mkdirSync(folderPath, { recursive: true });
        callback(null, folderPath);
    },
    filename: (req, file, callback) => {
        const folderPath = transferFolderPath(req.transferId);
        const parsed = path.parse(path.basename(file.originalname));
        const safeBase = parsed.name
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
            .replace(/\s+/g, " ").trim().slice(0, 150) || "archivo";
        const safeExtension = parsed.ext
            .replace(/[^a-zA-Z0-9.]/g, "").slice(0, 16).toLowerCase();
        let filename = `${safeBase}${safeExtension}`;
        let copyNumber = 2;
        while (folderPath && fs.existsSync(path.join(folderPath, filename))) {
            filename = `${safeBase}-${copyNumber}${safeExtension}`;
            copyNumber += 1;
        }
        callback(null, filename);
    }
});
const transferUpload = multer({
    storage: transferStorage,
    limits: { files: MAX_TRANSFER_FILES, fileSize: MAX_TRANSFER_FILE_SIZE_BYTES },
    fileFilter: (req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();
        if (blockedTransferExtensions.has(extension)) {
            return callback(new Error(`El tipo de archivo ${extension} no está permitido por seguridad`));
        }
        callback(null, true);
    }
});

app.get("/healthz", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({
        status: "ok",
        service: "straclase",
        version: (
            process.env.RAILWAY_GIT_COMMIT_SHA
            || process.env.SOURCE_VERSION
            || "local"
        ).slice(0, 12)
    });
});

app.get("/readyz", async (req, res) => {
    try {
        fs.accessSync(uploadsDirectory, fs.constants.R_OK | fs.constants.W_OK);
        fs.accessSync(path.dirname(databasePath), fs.constants.R_OK | fs.constants.W_OK);
        deliveryStore.hasUsers();
        if (objectStorage.enabled) {
            await Promise.race([
                objectStorage.healthcheck(),
                new Promise((_, reject) => setTimeout(
                    () => reject(new Error("R2 no respondió a tiempo")), 5000
                ))
            ]);
        }
        if (galleryStorage.enabled) {
            await Promise.race([
                galleryStorage.healthcheck(),
                new Promise((_, reject) => setTimeout(
                    () => reject(new Error("R2 de galerías no respondió a tiempo")), 5000
                ))
            ]);
        }
        res.set("Cache-Control", "no-store");
        res.json({
            status: "ready",
            transferStorage: objectStorage.provider,
            galleryStorage: galleryStorage.provider,
            automaticBackups: automaticBackups.status().enabled
        });
    } catch (error) {
        console.error(`[${req.requestId}] Readiness error`, error);
        res.status(503).json({ status: "not_ready" });
    }
});

app.get("/operations/economics", (req, res) => {
    if (!process.env.PHOCLOUD_OPERATIONS_TOKEN) return res.status(404).end();
    if (!operationsAuthorized(req)) {
        return res.status(401).json({ error: "No autorizado" });
    }
    const period = monthKey();
    const usage = deliveryStore.getEconomicUsage(null, period, new Date().toISOString());
    const galleryStoredBytes = currentGalleryStorageBytes();
    res.set("Cache-Control", "no-store");
    res.json({
        period,
        estimates: {
            uploadedBytes: Number(usage.counters.uploaded_bytes || 0)
                + Number(usage.counters.gallery_uploaded_bytes || 0),
            transferUploadedBytes: Number(usage.counters.uploaded_bytes || 0),
            galleryUploadedBytes: Number(usage.counters.gallery_uploaded_bytes || 0),
            galleryConvertedBytes: Number(
                usage.counters.gallery_converted_bytes || 0
            ),
            galleryConversions: Number(
                usage.counters.gallery_conversions || 0
            ),
            reservedUploadBytes: Number(usage.counters.reserved_upload_bytes || 0),
            downloadedBytes: Number(usage.counters.downloaded_bytes || 0),
            zipGeneratedBytes: Number(usage.counters.zip_generated_bytes || 0),
            zipJobsStarted: Number(usage.counters.zip_jobs_started || 0),
            errors: Number(usage.counters.errors || 0),
            transferStoredBytes: usage.activeTransferBytes,
            zipStoredBytes: usage.readyZipBytes,
            galleryStoredBytes,
            totalStoredBytes: usage.activeTransferBytes
                + usage.readyZipBytes + galleryStoredBytes
        },
        active: {
            transfers: usage.activeTransferCount,
            uploads: usage.activeUploads,
            localUploadWorkers: uploadConcurrency.snapshot().globalActive,
            readyZips: usage.readyZipCount,
            zipWorkers: zipConcurrency.snapshot().globalActive,
            conversionWorkers: activeConversionBuilds.size
        },
        controls: {
            acceptingNewTransfers: economicConfig.acceptNewTransfers,
            zipEnabled: economicConfig.zipEnabled,
            globalMonthlyUploadBytes: economicConfig.globalMonthlyUploadBytes,
            globalTransferStorageBytes: economicConfig.globalTransferStorageBytes,
            globalMonthlyDownloadBytes: economicConfig.globalMonthlyDownloadBytes,
            globalMonthlyZipBytes: economicConfig.globalMonthlyZipBytes,
            globalMonthlyZipJobs: economicConfig.globalMonthlyZipJobs,
            globalMonthlyErrorLimit: economicConfig.globalMonthlyErrorLimit,
            globalConcurrentUploads: economicConfig.globalConcurrentUploads,
            globalConcurrentZips: economicConfig.globalConcurrentZips,
            conversionEnabled: economicConfig.conversionEnabled,
            globalConcurrentConversions:
                economicConfig.globalConcurrentConversions
        },
        note: "Contadores internos estimados; compáralos con Railway y Cloudflare, cuya factura es autoritativa."
    });
});

app.get("/robots.txt", (req, res) => {
    res.type("text/plain").send([
        "User-agent: *",
        "Disallow: /",
        ""
    ].join("\n"));
});

app.get("/.well-known/security.txt", (req, res) => {
    const email = configuredSecurityEmail(process.env);
    if (!email) {
        return res.status(404).type("text/plain").send("Not found\n");
    }
    res.type("text/plain").send([
        `Contact: mailto:${email}`,
        `Canonical: ${publicBaseUrl(req)}/.well-known/security.txt`,
        "Preferred-Languages: es, en",
        ""
    ].join("\n"));
});

app.get("/legal.css", (req, res) => {
    res.sendFile(path.join(publicDirectory, "legal.css"));
});

function sendLegalPage(res, filename) {
    const template = fs.readFileSync(path.join(publicDirectory, filename), "utf8");
    try {
        const html = renderLegalTemplate(template, process.env);
        res.set("Cache-Control", "no-store");
        res.type("html").send(html);
    } catch (error) {
        console.error("Página legal bloqueada por configuración incompleta", error.message);
        res.status(503).set("Cache-Control", "no-store").type("html").send(
            "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><meta name=\"robots\" content=\"noindex,nofollow\"><title>Información legal no disponible</title><link rel=\"stylesheet\" href=\"/legal.css\"></head><body><article><h1>Información legal no disponible</h1><p>La instalación todavía no tiene una configuración legal publicable. No se muestran datos provisionales ni de ejemplo.</p><a href=\"/login\">Volver</a></article></body></html>"
        );
    }
}

app.get("/privacidad", (req, res) => {
    sendLegalPage(res, "privacy.html");
});

app.get("/terminos", (req, res) => {
    sendLegalPage(res, "terms.html");
});

app.get("/privacy.html", (req, res) => res.redirect(301, "/privacidad"));
app.get("/terms.html", (req, res) => res.redirect(301, "/terminos"));

app.get("/login", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(frontendDirectory, "login.html"));
});

app.get(["/", "/enviar", "/send"], (req, res) => {
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(publicDirectory, "send.html"));
});

app.get("/guest-transfer-capabilities", (req, res) => {
    const limits = economicPlanLimits("free");
    res.set("Cache-Control", "no-store");
    res.json({
        enabled: economicConfig.acceptNewTransfers
            && economicConfig.guestTransfersEnabled,
        requiresAccount: false,
        uploadMode: objectStorage.enabled ? "multipart" : "local",
        acceptingNewTransfers: economicConfig.acceptNewTransfers,
        retentionHours: 24,
        maxFiles: MAX_TRANSFER_FILES,
        maxFileSize: Math.min(MAX_TRANSFER_FILE_SIZE_BYTES, limits.transferMaxBytes,
            economicConfig.guestTransferMaxBytes),
        maxTotalSize: Math.min(limits.transferMaxBytes,
            economicConfig.guestTransferMaxBytes),
        message: economicConfig.acceptNewTransfers
            && economicConfig.guestTransfersEnabled
            ? "Puedes enviar sin crear una cuenta. El enlace caducará en 24 horas."
            : "Las nuevas transferencias están pausadas temporalmente."
    });
});

app.post("/transfer-sender-verification/request", requireSameOrigin,
    limitSensitiveAction, allowTransferCreator, async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!validEmail(email)) {
        return res.status(400).json({ error: "Escribe un correo electrónico válido" });
    }
    const now = Date.now();
    if (transferSenderEmailIsVerified(req, email, now)) {
        return res.json({ verified: true, email });
    }
    const previous = deliveryStore.getTransferSenderVerification(
        req.auth.userId, email
    );
    if (previous && !previous.verifiedAt
        && Number(previous.createdAt) + TRANSFER_SENDER_CODE_RESEND_DELAY_MS > now) {
        const retryAfter = Math.ceil(
            (Number(previous.createdAt) + TRANSFER_SENDER_CODE_RESEND_DELAY_MS - now)
            / 1000
        );
        res.set("Retry-After", String(retryAfter));
        return res.status(429).json({
            error: `Espera ${retryAfter} segundos antes de solicitar otro código`
        });
    }
    const code = String(randomInt(100000, 1000000));
    const codeRecord = createPasswordRecord(code);
    try {
        const mail = await sendTransferSenderCode({ to: email, code });
        deliveryStore.saveTransferSenderVerification({
            ownerId: req.auth.userId,
            email,
            codeHash: codeRecord.passwordHash,
            codeSalt: codeRecord.passwordSalt,
            createdAt: now,
            expiresAt: now + TRANSFER_SENDER_CODE_DURATION_MS
        });
        res.json({
            verified: false,
            delivered: mail.delivered,
            expiresInSeconds: TRANSFER_SENDER_CODE_DURATION_MS / 1000,
            devCode: isProduction ? null : code
        });
    } catch (error) {
        console.error(error);
        res.status(502).json({
            error: "No se pudo enviar el código de verificación"
        });
    }
});

app.post("/transfer-sender-verification/verify", requireSameOrigin,
    limitSensitiveAction, allowTransferCreator, (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const code = typeof req.body?.code === "string"
        ? req.body.code.trim()
        : "";
    if (!validEmail(email) || !/^\d{6}$/.test(code)) {
        return res.status(400).json({
            error: "Escribe el correo y el código de 6 dígitos"
        });
    }
    const now = Date.now();
    if (transferSenderEmailIsVerified(req, email, now)) {
        return res.json({ verified: true, email });
    }
    const verification = deliveryStore.getTransferSenderVerification(
        req.auth.userId, email
    );
    if (!verification || Number(verification.expiresAt) <= now) {
        return res.status(410).json({
            error: "El código ha caducado. Solicita uno nuevo."
        });
    }
    if (Number(verification.attempts) >= TRANSFER_SENDER_CODE_MAX_ATTEMPTS) {
        return res.status(429).json({
            error: "Demasiados intentos. Solicita un código nuevo."
        });
    }
    if (!verifyPassword(code, verification.codeSalt, verification.codeHash)) {
        deliveryStore.recordTransferSenderVerificationFailure(
            req.auth.userId, email, now, TRANSFER_SENDER_CODE_MAX_ATTEMPTS
        );
        const remaining = Math.max(
            0,
            TRANSFER_SENDER_CODE_MAX_ATTEMPTS
                - Number(verification.attempts) - 1
        );
        return res.status(401).json({
            error: remaining
                ? `Código incorrecto. Te quedan ${remaining} intentos.`
                : "Código incorrecto. Solicita uno nuevo."
        });
    }
    const verified = deliveryStore.markTransferSenderVerified({
        ownerId: req.auth.userId,
        email,
        verifiedAt: now,
        expiresAt: now + TRANSFER_SENDER_VERIFIED_DURATION_MS,
        now,
        maxAttempts: TRANSFER_SENDER_CODE_MAX_ATTEMPTS
    });
    if (!verified) {
        return res.status(409).json({
            error: "No se pudo confirmar el código. Solicita uno nuevo."
        });
    }
    res.json({
        verified: true,
        email,
        rememberedDays: TRANSFER_SENDER_VERIFIED_DURATION_MS / 86400000
    });
});

app.get("/login.css", (req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(frontendDirectory, "login.css"));
});

app.get("/theme.js", (req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(frontendDirectory, "theme.js"));
});

app.get("/login.js", (req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(frontendDirectory, "login.js"));
});

app.get("/auth/status", (req, res) => {
    res.set("Cache-Control", "no-store");
    const session = getSessionFromRequest(req);

    res.json({
        authenticated: Boolean(session),
        googleAuthEnabled: googleAuth.configured,
        setupRequired: !isProduction
            && !deliveryStore.hasUsers()
            && isLocalRequest(req),
        registrationOpen: true,
        user: session ? {
            email: session.email,
            displayName: session.displayName || session.email,
            analyticsDistinctId: analyticsDistinctId(session.userId),
            plan: session.plan,
            planStatus: session.planStatus
        } : null
    });
});

app.get("/auth/google", (req, res) => {
    if (!googleAuth.configured) {
        return googleErrorRedirect(
            res,
            "El acceso con Google todavía no está configurado"
        );
    }
    if (getSessionFromRequest(req)) {
        return res.redirect(302, safeNextPath(req.query?.next));
    }
    try {
        const authorization = googleAuth.authorization({
            redirectUri: googleRedirectUri(req),
            next: req.query?.next
        });
        res.cookie(
            GOOGLE_OAUTH_COOKIE_NAME,
            authorization.cookie,
            googleOAuthCookieOptions()
        );
        res.redirect(302, authorization.url);
    } catch (error) {
        console.error("Google OAuth start error", error.message);
        googleErrorRedirect(res, "No se pudo iniciar el acceso con Google");
    }
});

app.get("/auth/google/callback", async (req, res) => {
    const oauthCookie = readCookie(
        req.headers.cookie,
        GOOGLE_OAUTH_COOKIE_NAME
    );
    res.clearCookie(GOOGLE_OAUTH_COOKIE_NAME, {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
        path: "/auth/google"
    });
    if (req.query?.error) {
        return googleErrorRedirect(
            res,
            "El acceso con Google se canceló antes de completarse"
        );
    }
    try {
        const identity = await googleAuth.authenticate({
            redirectUri: googleRedirectUri(req),
            code: req.query?.code,
            state: req.query?.state,
            cookie: oauthCookie
        });
        if (!validEmail(identity.email)) {
            throw new Error("Google no devolvió un correo válido");
        }

        let registrationCompleted = false;
        let user = deliveryStore.getUserByIdentity(
            "google",
            identity.subject
        );
        if (user?.authDisabled) {
            throw new Error("Esta cuenta de Straclase no está disponible");
        }

        if (!user) {
            const existing = deliveryStore.getUserByEmail(identity.email);
            if (existing?.authDisabled) {
                throw new Error("Esta cuenta de Straclase no está disponible");
            }
            if (existing) {
                const googleControlsMailbox = identity.email.endsWith("@gmail.com")
                    || Boolean(identity.hostedDomain);
                if (!googleControlsMailbox) {
                    throw new Error(
                        "Este correo ya existe. Entra con tu contraseña para proteger la cuenta"
                    );
                }
                user = existing;
                if (!user.emailVerifiedAt) {
                    deliveryStore.markEmailVerified(
                        user.id,
                        new Date().toISOString()
                    );
                    registrationCompleted = true;
                }
            } else {
                const now = new Date().toISOString();
                const randomPassword = createPasswordRecord(
                    randomBytes(48).toString("base64url")
                );
                const displayName = identity.displayName
                    || identity.email.split("@", 1)[0]
                    || "Usuario";
                try {
                    const userId = deliveryStore.createUser({
                        username: internalUsername(),
                        email: identity.email,
                        displayName,
                        emailVerifiedAt: now,
                        termsAcceptedAt: now,
                        ...randomPassword,
                        createdAt: now
                    });
                    user = deliveryStore.getUserById(userId);
                    registrationCompleted = true;
                } catch (error) {
                    user = deliveryStore.getUserByEmail(identity.email);
                    if (!user) throw error;
                }
            }

            if (!deliveryStore.linkUserIdentity(
                "google",
                identity.subject,
                user.id,
                new Date().toISOString()
            )) {
                throw new Error(
                    "No se pudo vincular esta cuenta de Google de forma segura"
                );
            }
        }

        deliveryStore.deleteExpiredSessions(Date.now());
        startSession(res, user.id);
        const nextUrl = new URL(identity.next, "http://straclase.local");
        nextUrl.searchParams.set(
            "analyticsAuth",
            registrationCompleted ? "signup" : "login"
        );
        res.redirect(302, `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    } catch (error) {
        console.error("Google OAuth callback error", error.message);
        googleErrorRedirect(
            res,
            error.message.includes("contraseña")
                ? error.message
                : "No se pudo verificar el acceso con Google. Inténtalo de nuevo"
        );
    }
});

app.post("/auth/setup", requireSameOrigin, (req, res) => {
    if (isProduction) {
        return res.status(404).json({ error: "Ruta no disponible" });
    }
    if (deliveryStore.hasUsers()) {
        return res.status(409).json({ error: "La cuenta ya está configurada" });
    }

    if (!isLocalRequest(req)) {
        return res.status(403).json({
            error: "La primera cuenta solo puede crearse desde este ordenador"
        });
    }

    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const validationError = !validEmail(email)
        ? "Escribe un correo electrónico válido"
        : validatePassword(password);

    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const passwordRecord = createPasswordRecord(password);

    try {
        const userId = deliveryStore.createUser({
            username: internalUsername(),
            email,
            displayName: email.split("@", 1)[0],
            emailVerifiedAt: new Date().toISOString(),
            termsAcceptedAt: new Date().toISOString(),
            ...passwordRecord,
            createdAt: new Date().toISOString()
        });

        startSession(res, userId);
        res.status(201).json({ email });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "No se pudo crear la cuenta" });
    }
});

app.post("/auth/register", requireSameOrigin, limitSensitiveAction, async (req, res) => {
    const displayName = req.body?.displayName?.trim();
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    if (req.body?.acceptTerms !== true) {
        return res.status(400).json({
            error: "Debes aceptar los términos y la política de privacidad"
        });
    }
    const validationError = validateRegistration({
        displayName, email, password
    });
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }
    const existingUser = deliveryStore.getUserByEmail(email);
    if (existingUser && !existingUser.authDisabled && existingUser.emailVerifiedAt) {
        return res.status(409).json({ error: "Ese correo ya está registrado" });
    }

    try {
        const passwordRecord = createPasswordRecord(password);
        const termsAcceptedAt = new Date().toISOString();
        const userId = existingUser
            ? existingUser.id
            : deliveryStore.createUser({
                username: internalUsername(),
                email,
                displayName,
                ...passwordRecord,
                plan: "free",
                planStatus: "active",
                termsAcceptedAt,
                createdAt: new Date().toISOString()
            });
        if (existingUser) {
            deliveryStore.deleteUserSessions(userId);
            const prepared = deliveryStore.prepareUserRegistration(userId, {
                username: internalUsername(),
                displayName,
                ...passwordRecord,
                termsAcceptedAt
            });
            if (!prepared) throw new Error("No se pudo preparar de nuevo la cuenta");
        }
        const user = deliveryStore.getUserById(userId);
        let mail;
        try {
            mail = await issueAccountLink(req, user, "verify_email");
        } catch (mailError) {
            console.error("No se pudo enviar la verificación de cuenta", mailError);
            return res.status(502).json({
                error: "La cuenta está preparada, pero no pudimos enviar el correo de verificación. Vuelve a pulsar Crear cuenta en unos minutos.",
                code: "VERIFICATION_EMAIL_FAILED"
            });
        }
        if (isProduction && !mail.delivered) {
            return res.status(503).json({
                error: "El correo de verificación no está disponible temporalmente. Vuelve a intentarlo en unos minutos.",
                code: "EMAIL_NOT_CONFIGURED"
            });
        }
        res.status(201).json({
            message: mail.delivered
                ? "Revisa tu correo para activar la cuenta"
                : "Cuenta creada. Usa el enlace de verificación local",
            verificationRequired: true,
            devLink: mail.devLink
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "No se pudo crear la cuenta" });
    }
});

app.post("/auth/verify-email", requireSameOrigin, (req, res) => {
    const token = req.body?.token;
    if (typeof token !== "string") {
        return res.status(400).json({ error: "Enlace de verificación no válido" });
    }
    const tokenHash = hashSessionToken(token);
    const record = deliveryStore.getAccountToken(
        tokenHash, "verify_email", Date.now()
    );
    if (!record) {
        return res.status(400).json({
            error: "El enlace ha caducado o ya se utilizó"
        });
    }
    deliveryStore.markEmailVerified(record.userId, new Date().toISOString());
    deliveryStore.deleteAccountToken(tokenHash);
    startSession(res, record.userId);
    res.json({
        message: "Correo confirmado. Tu sesión ya está iniciada.",
        authenticated: true,
        analyticsDistinctId: analyticsDistinctId(record.userId)
    });
});

app.post("/auth/resend-verification", requireSameOrigin, limitSensitiveAction, async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const user = validEmail(email) ? deliveryStore.getUserByEmail(email) : null;
    let devLink = null;
    if (user && !user.authDisabled && !user.emailVerifiedAt) {
        try {
            devLink = (await issueAccountLink(req, user, "verify_email")).devLink;
        } catch (error) {
            console.error(error);
        }
    }
    res.json({
        message: "Si la cuenta existe, recibirás un nuevo enlace.",
        devLink
    });
});

app.post("/auth/forgot-password", requireSameOrigin, limitSensitiveAction, async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const user = validEmail(email) ? deliveryStore.getUserByEmail(email) : null;
    let devLink = null;
    if (user && !user.authDisabled) {
        try {
            devLink = (await issueAccountLink(req, user, "reset_password")).devLink;
        } catch (error) {
            console.error(error);
        }
    }
    res.json({
        message: "Si la cuenta existe, recibirás instrucciones para recuperar el acceso.",
        devLink
    });
});

app.post("/auth/reset-password", requireSameOrigin, (req, res) => {
    const token = req.body?.token;
    const password = req.body?.password;
    if (typeof token !== "string"
        || typeof password !== "string"
        || password.length < 10
        || password.length > 128) {
        return res.status(400).json({
            error: "La nueva contraseña debe tener entre 10 y 128 caracteres"
        });
    }
    const tokenHash = hashSessionToken(token);
    const record = deliveryStore.getAccountToken(
        tokenHash, "reset_password", Date.now()
    );
    if (!record) {
        return res.status(400).json({
            error: "El enlace ha caducado o ya se utilizó"
        });
    }
    const passwordRecord = createPasswordRecord(password);
    deliveryStore.updateUserPassword(
        record.userId,
        passwordRecord.passwordHash,
        passwordRecord.passwordSalt
    );
    deliveryStore.deleteUserSessions(record.userId);
    deliveryStore.deleteAccountToken(tokenHash);
    res.json({ message: "Contraseña actualizada. Ya puedes iniciar sesión." });
});

app.post("/auth/login", requireSameOrigin, (req, res) => {
    if (isLoginRateLimited(req.ip)) {
        return res.status(429).json({
            error: "Demasiados intentos. Espera 15 minutos."
        });
    }

    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!validEmail(email) || typeof password !== "string") {
        recordLoginFailure(req.ip);
        return res.status(401).json({ error: "Correo o contraseña incorrectos" });
    }

    const user = deliveryStore.getUserByEmail(email);
    const passwordIsValid = user && !user.authDisabled && verifyPassword(
        password,
        user.passwordSalt,
        user.passwordHash
    );

    if (!passwordIsValid) {
        recordLoginFailure(req.ip);
        return res.status(401).json({ error: "Correo o contraseña incorrectos" });
    }
    if (user.email && !user.emailVerifiedAt) {
        return res.status(403).json({
            error: "Confirma tu correo antes de iniciar sesión",
            verificationRequired: true,
            email: user.email
        });
    }

    loginAttempts.delete(req.ip);
    deliveryStore.deleteExpiredSessions(Date.now());
    startSession(res, user.id);

    const billingUser = userForCurrentBillingEnvironment(user);
    res.json({
        email: billingUser.email,
        plan: billingUser.plan,
        analyticsDistinctId: analyticsDistinctId(user.id)
    });
});

app.post("/auth/logout", requireSameOrigin, (req, res) => {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE_NAME);

    if (token) {
        deliveryStore.deleteSession(hashSessionToken(token));
    }

    res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
        path: "/"
    });
    res.status(204).end();
});

app.use(express.static(publicDirectory));

app.get("/analytics/vendor.js", (req, res) => {
    res.set("Cache-Control", "public, max-age=604800, immutable");
    res.sendFile(path.join(
        rootDirectory, "node_modules", "posthog-js", "dist", "array.no-external.js"
    ));
});

app.get("/analytics/config", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({
        enabled: Boolean(posthogProjectApiKey),
        projectApiKey: posthogProjectApiKey || null,
        host: posthogHost,
        region: posthogHost.startsWith("https://eu.") ? "EU" : "US"
    });
});

app.post(
    "/analytics/event",
    requireSameOrigin,
    limitAnalyticsEvent,
    (req, res) => {
        const eventName = req.body?.eventName;
        const visitorId = req.body?.visitorId;
        const dedupeKey = req.body?.dedupeKey;
        const allowedEvents = new Set([
            "$pageview", "signup_started", "signup_completed", "login_completed"
        ]);
        if (!allowedEvents.has(eventName)
            || typeof visitorId !== "string"
            || !/^[a-zA-Z0-9_-]{16,80}$/.test(visitorId)
            || typeof dedupeKey !== "string"
            || !/^[a-zA-Z0-9_-]{16,80}$/.test(dedupeKey)) {
            return res.status(400).json({ error: "Evento no válido" });
        }
        const session = getSessionFromRequest(req);
        deliveryStore.recordAnalyticsEvent({
            eventName,
            visitorId,
            userId: session?.userId || null,
            pagePath: safeAnalyticsPath(req.body?.pagePath),
            trafficSource: safeTrafficSource(req.body?.trafficSource),
            dedupeKey,
            createdAt: Date.now()
        });
        res.status(202).end();
    }
);

app.get("/analytics/summary", requireAuth, (req, res) => {
    const user = deliveryStore.getUserById(req.auth.userId);
    if (!isAnalyticsAdmin(user)) {
        return res.status(403).json({ error: "Estadísticas solo disponibles para administración" });
    }
    const now = new Date();
    const since = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6
    ));
    const summary = deliveryStore.getAnalyticsSummary({
        sinceMs: since.getTime(),
        sinceIso: since.toISOString()
    });
    const visitors = Number(summary.events.visitors || 0);
    const completedRegistrations = Number(summary.users.completedRegistrations || 0);
    const consentedSignupCompletions = Number(summary.events.signupCompleted || 0);
    res.set("Cache-Control", "no-store");
    res.json({
        periodDays: 7,
        posthogConfigured: Boolean(posthogProjectApiKey),
        totals: {
            totalUsers: Number(summary.users.totalUsers || 0),
            completedUsers: Number(summary.users.completedUsers || 0),
            newUsers: Number(summary.users.newUsers || 0),
            completedRegistrations,
            visitors,
            pageviews: Number(summary.events.pageviews || 0),
            activeUsers: Number(summary.events.activeUsers || 0),
            signupStarted: Number(summary.events.signupStarted || 0),
            signupCompleted: consentedSignupCompletions,
            logins: Number(summary.events.logins || 0),
            conversionRate: visitors
                ? Math.round(consentedSignupCompletions / visitors * 1000) / 10
                : null
        },
        eventSeries: summary.eventSeries,
        userSeries: summary.userSeries,
        sources: summary.sources
    });
});

app.get(["/app", "/app/", "/index.html"], requirePageAuth, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(frontendDirectory, "index.html"));
});

app.get("/style.css", requirePageAuth, (req, res) => {
    res.sendFile(path.join(frontendDirectory, "style.css"));
});

app.get("/script.js", requirePageAuth, (req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(frontendDirectory, "script.js"));
});

app.get("/account", requireAuth, (req, res) => {
    const storedUser = deliveryStore.getUserById(req.auth.userId);
    if (!storedUser) {
        return res.status(404).json({ error: "Cuenta no encontrada" });
    }
    const user = userForCurrentBillingEnvironment(storedUser);
    res.set("Cache-Control", "no-store");
    res.json({
        account: {
            email: user.email,
            displayName: user.displayName || user.email,
            analyticsAdmin: isAnalyticsAdmin(user),
            analyticsDistinctId: analyticsDistinctId(user.id),
            emailVerified: !user.email || Boolean(user.emailVerifiedAt),
            plan: user.plan,
            planStatus: user.planStatus,
            emailDeliveryConfigured: emailConfigured(),
            billing: {
                ...billing.publicConfiguration(),
                portalAvailable: billing.configured
                    && Boolean(user.stripeCustomerId),
                currentPeriodEnd: user.stripeCurrentPeriodEnd
            },
            backups: automaticBackups.status(),
            usage: accountUsage(user.id, user.plan, user.planStatus)
        }
    });
});

app.post("/billing/checkout-session", requireAuth, requireSameOrigin, limitSensitiveAction, async (req, res) => {
    const storedUser = deliveryStore.getUserById(req.auth.userId);
    const plan = req.body?.plan;
    if (!storedUser) {
        return res.status(404).json({ error: "Cuenta no encontrada" });
    }
    const user = userForCurrentBillingEnvironment(storedUser);
    if (!billing.configured) {
        return res.status(503).json({
            error: "Los planes de pago todavía no están disponibles",
            code: "BILLING_NOT_CONFIGURED"
        });
    }
    if (!["professional", "studio"].includes(plan)) {
        return res.status(400).json({ error: "Selecciona un plan válido" });
    }
    if (user.stripeSubscriptionId) {
        return res.status(409).json({
            error: "Ya tienes una suscripción. Gestiona el cambio desde Stripe.",
            code: "SUBSCRIPTION_ALREADY_EXISTS"
        });
    }
    if (effectivePlan(user.plan, user.planStatus) === plan) {
        return res.status(409).json({
            error: "Ya tienes este plan. Puedes gestionarlo desde tu cuenta."
        });
    }
    try {
        const session = await billing.createCheckoutSession({
            user,
            plan,
            baseUrl: publicBaseUrl(req)
        });
        if (storedUser.stripeEnvironment
            && storedUser.stripeEnvironment !== billingEnvironment) {
            deliveryStore.clearUserStripeBillingForEnvironment(
                storedUser.id, storedUser.stripeEnvironment
            );
        }
        res.json({ url: session.url });
    } catch (error) {
        console.error(`[${req.requestId}] Stripe Checkout error`, error);
        const failure = billing.checkoutFailure(error);
        res.status(error.code === "INVALID_PLAN" ? 400 : 502).json({
            error: failure.message,
            code: failure.code
        });
    }
});

app.post("/billing/portal-session", requireAuth, requireSameOrigin, limitSensitiveAction, async (req, res) => {
    const storedUser = deliveryStore.getUserById(req.auth.userId);
    if (!storedUser) {
        return res.status(404).json({ error: "Cuenta no encontrada" });
    }
    const user = userForCurrentBillingEnvironment(storedUser);
    if (!billing.configured) {
        return res.status(503).json({
            error: "La gestión de pagos todavía no está disponible",
            code: "BILLING_NOT_CONFIGURED"
        });
    }
    try {
        const session = await billing.createPortalSession({
            customerId: user.stripeCustomerId,
            baseUrl: publicBaseUrl(req)
        });
        res.json({ url: session.url });
    } catch (error) {
        const missingCustomer = error.code === "CUSTOMER_NOT_FOUND";
        if (!missingCustomer) {
            console.error(`[${req.requestId}] Stripe portal error`, error);
        }
        res.status(missingCustomer ? 409 : 502).json({
            error: missingCustomer
                ? "Todavía no tienes una suscripción que gestionar"
                : "No se pudo abrir la gestión de pagos"
        });
    }
});

app.get("/brand", requireAuth, (req, res) => {
    const profile = deliveryStore.getBrandProfile(req.auth.userId);
    const logoPath = profileLogoPath(req.auth.userId);
    res.json({
        profile: {
            ...profile,
            hasLogo: fs.existsSync(logoPath),
            logoUrl: fs.existsSync(logoPath) ? "/brand/logo" : null
        }
    });
});

app.get("/brand/logo", requireAuth, (req, res) => {
    const logoPath = profileLogoPath(req.auth.userId);
    if (!fs.existsSync(logoPath)) {
        return res.status(404).json({ error: "Imagen de marca no encontrada" });
    }
    res.set("Cache-Control", "private, max-age=300");
    res.sendFile(logoPath, { dotfiles: "allow" });
});

app.put("/brand", requireAuth, requireSameOrigin, (req, res) => {
    brandLogoUpload.single("logo")(req, res, async (error) => {
        if (error) return res.status(400).json({ error: error.message });

        const validation = validateBrandSettings(req.body || {});
        if (validation.error) {
            return res.status(400).json({ error: validation.error });
        }
        if (req.file && !isSupportedImageBuffer(req.file.buffer)) {
            return res.status(400).json({
                error: "El archivo no contiene una imagen de marca válida"
            });
        }

        const logoPath = profileLogoPath(req.auth.userId);
        try {
            if (parseBoolean(req.body.removeLogo, false)) {
                fs.rmSync(logoPath, { force: true });
            } else if (req.file) {
                await createLogo(req.file.buffer, logoPath);
            }

            const profile = deliveryStore.upsertBrandProfile({
                userId: req.auth.userId,
                ...validation.value,
                updatedAt: new Date().toISOString()
            });
            res.json({
                profile: {
                    ...profile,
                    hasLogo: fs.existsSync(logoPath),
                    logoUrl: fs.existsSync(logoPath)
                        ? `/brand/logo?v=${Date.now()}`
                        : null
                }
            });
        } catch (processingError) {
            console.error(processingError);
            res.status(400).json({
                error: "No se pudo procesar la imagen de marca"
            });
        }
    });
});

app.get("/transfers", requireAuth, (req, res) => {
    const baseUrl = publicBaseUrl(req);
    const transfers = deliveryStore.listTransfers(req.auth.userId).map((transfer) => {
        const conversion = deliveryStore.getLatestTransferConversion(
            transfer.id, req.auth.userId
        );
        return {
            ...transfer,
            expired: Date.parse(transfer.expiresAt) <= Date.now(),
            link: `${baseUrl}/t/${transfer.id}`,
            conversion: conversion ? publicConversionJob(conversion, req) : null
        };
    });
    res.set("Cache-Control", "no-store");
    res.json({ transfers });
});

app.get("/galleries/capabilities", requireAuth, (req, res) => {
    const account = userForCurrentBillingEnvironment(
        deliveryStore.getUserById(req.auth.userId)
    );
    const plan = effectivePlan(account?.plan || "free", account?.planStatus);
    const usage = accountUsage(req.auth.userId, account?.plan || "free",
        account?.planStatus);
    res.set("Cache-Control", "no-store");
    res.json({
        maxFiles: MAX_PHOTOS_PER_DELIVERY,
        maxImageSize: MAX_PHOTO_SIZE_BYTES,
        maxVideoSize: MAX_VIDEO_SIZE_BYTES,
        maxTotalSize: MAX_DELIVERY_SIZE_BYTES,
        galleryLimit: usage.galleryLimit,
        galleryCount: usage.galleryCount,
        storageLimitBytes: usage.storageLimitBytes,
        storageBytes: usage.storageBytes,
        maxLifetimeDays: planLimits(plan).galleryLifetimeDays,
        conversionEnabled: economicConfig.conversionEnabled
    });
});

app.get("/transfers/capabilities", requireAuth, (req, res) => {
    const account = userForCurrentBillingEnvironment(
        deliveryStore.getUserById(req.auth.userId)
    );
    const plan = effectivePlan(account?.plan || "free", account?.planStatus);
    const limits = economicPlanLimits(plan);
    res.set("Cache-Control", "no-store");
    res.json({
        acceptingNewTransfers: economicConfig.acceptNewTransfers,
        zipEnabled: economicConfig.zipEnabled,
        uploadMode: objectStorage.enabled ? "multipart" : "local",
        partSize: objectStorage.partSize,
        maxFiles: MAX_TRANSFER_FILES,
        maxFileSize: Math.min(MAX_TRANSFER_FILE_SIZE_BYTES, limits.transferMaxBytes),
        maxTotalSize: limits.transferMaxBytes,
        technicalMaxTotalSize: MAX_TRANSFER_SIZE_BYTES,
        monthlyUploadLimitBytes: limits.monthlyUploadBytes,
        transferStorageLimitBytes: limits.transferStorageBytes,
        concurrentUploadLimit: limits.concurrentUploads,
        zipMaxBytes: limits.zipMaxBytes
    });
});

app.post("/transfers/:transferId/claim", requireAuth, requireSameOrigin,
    limitSensitiveAction, (req, res) => {
        const transferId = req.params.transferId;
        const alreadyOwned = deliveryStore.getOwnedTransfer(
            transferId, req.auth.userId
        );
        if (alreadyOwned) {
            return res.json({ claimed: true, transferId, alreadyOwned: true });
        }
        const guest = guestUploadOwner(req);
        if (!guest) {
            return res.status(403).json({
                error: "Abre este enlace desde el mismo navegador donde creaste la transferencia",
                code: "GUEST_TRANSFER_SESSION_REQUIRED"
            });
        }
        const account = userForCurrentBillingEnvironment(
            deliveryStore.getUserById(req.auth.userId)
        );
        const plan = effectivePlan(account?.plan || "free", account?.planStatus);
        const result = deliveryStore.claimGuestTransfer({
            id: transferId,
            guestOwnerId: guest.userId,
            newOwnerId: req.auth.userId,
            limits: transferAdmissionLimits(plan, false),
            nowIso: new Date().toISOString()
        });
        if (!result.ok) {
            const status = result.code === "TRANSFER_EXPIRED" ? 410
                : result.code === "TRANSFER_NOT_READY" ? 409
                    : result.code === "GUEST_TRANSFER_NOT_OWNED" ? 404 : 403;
            const message = ({
                TRANSFER_EXPIRED: "La transferencia ha caducado",
                TRANSFER_NOT_READY: "Completa la subida antes de convertirla",
                GUEST_TRANSFER_NOT_OWNED:
                    "Esta transferencia no pertenece a este navegador"
            })[result.code] || quotaMessage(result.code);
            return res.status(status).json({ error: message, code: result.code });
        }
        deliveryStore.deleteOrphanGuestUsers();
        res.json({ claimed: true, transferId });
    });

app.get("/transfers/:transferId/conversion-options", requireAuth, (req, res) => {
    const transfer = deliveryStore.getOwnedTransfer(
        req.params.transferId, req.auth.userId
    );
    if (!transfer) return res.status(404).json({ error: "Transferencia no encontrada" });
    if (transfer.status !== "ready") {
        return res.status(409).json({ error: "Completa la subida antes de convertirla" });
    }
    if (Date.parse(transfer.expiresAt) <= Date.now()) {
        return res.status(410).json({ error: "La transferencia ha caducado" });
    }
    const files = classifyTransferFilesForGallery(transfer);
    const account = userForCurrentBillingEnvironment(
        deliveryStore.getUserById(req.auth.userId)
    );
    res.set("Cache-Control", "no-store");
    res.json({
        transfer: {
            id: transfer.id,
            title: transfer.title,
            message: transfer.message.slice(0, 300)
        },
        compatible: files.compatible.map((file) => ({
            sourceId: file.sourceId,
            name: file.name,
            size: file.size,
            mediaType: file.mediaType
        })),
        excluded: files.excluded,
        usage: accountUsage(req.auth.userId, account?.plan || "free",
            account?.planStatus),
        conversionEnabled: economicConfig.conversionEnabled
    });
});

app.post("/transfers/:transferId/conversions", requireAuth, requireSameOrigin,
    limitSensitiveAction, (req, res) => {
        if (!economicConfig.conversionEnabled) {
            return res.status(503).json({
                error: "Las conversiones están pausadas temporalmente",
                code: "CONVERSIONS_PAUSED"
            });
        }
        const transfer = deliveryStore.getOwnedTransfer(
            req.params.transferId, req.auth.userId
        );
        if (!transfer) return res.status(404).json({ error: "Transferencia no encontrada" });
        if (transfer.status !== "ready") {
            return res.status(409).json({ error: "Completa la subida antes de convertirla" });
        }
        if (Date.parse(transfer.expiresAt) <= Date.now()) {
            return res.status(410).json({ error: "La transferencia ha caducado" });
        }
        const idempotencyKey = typeof req.body?.idempotencyKey === "string"
            ? req.body.idempotencyKey.trim() : "";
        if (!/^[a-zA-Z0-9_-]{12,120}$/.test(idempotencyKey)) {
            return res.status(400).json({ error: "Identificador de operación no válido" });
        }
        const requestedIds = Array.isArray(req.body?.selectedFileIds)
            ? [...new Set(req.body.selectedFileIds.filter(
                (value) => typeof value === "string"
            ))] : [];
        if (!requestedIds.length || requestedIds.length > MAX_PHOTOS_PER_DELIVERY) {
            return res.status(400).json({
                error: `Selecciona entre 1 y ${MAX_PHOTOS_PER_DELIVERY} archivos compatibles`
            });
        }
        const classified = classifyTransferFilesForGallery(transfer);
        const compatibleById = new Map(
            classified.compatible.map((file) => [file.sourceId, file])
        );
        if (requestedIds.some((id) => !compatibleById.has(id))) {
            return res.status(400).json({
                error: "La selección contiene archivos no compatibles o que ya no existen"
            });
        }
        const usedNames = new Set();
        const selectedFiles = requestedIds.map((id) => {
            const file = compatibleById.get(id);
            return {
                sourceId: file.sourceId,
                name: file.name,
                size: file.size,
                mimeType: file.mimeType,
                objectKey: file.objectKey,
                mediaType: file.mediaType,
                destinationName: safeTransferFilename(file.name, usedNames)
            };
        });
        const expectedBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
        if (expectedBytes > MAX_DELIVERY_SIZE_BYTES) {
            return res.status(400).json({ error: "La galería no puede superar 10 GB" });
        }

        const account = userForCurrentBillingEnvironment(
            deliveryStore.getUserById(req.auth.userId)
        );
        const plan = effectivePlan(account?.plan || "free", account?.planStatus);
        const profile = deliveryStore.getBrandProfile(req.auth.userId);
        const validation = validateDeliverySettings({
            ...profile,
            clientName: req.body?.clientName || req.body?.title || transfer.title,
            clientEmail: req.body?.clientEmail || "",
            message: typeof req.body?.message === "string"
                ? req.body.message
                : transfer.message.slice(0, 300),
            viewingEnabled: true,
            allowOriginalDownload: true,
            allowWebDownload: true,
            favoritesEnabled: true,
            selectionLimit: 0
        }, { maxExpiryDays: planLimits(plan).galleryLifetimeDays });
        if (validation.error) {
            return res.status(400).json({ error: validation.error });
        }
        const requestedCoverId = typeof req.body?.coverFileId === "string"
            ? req.body.coverFileId : "";
        const coverFile = selectedFiles.find((file) => (
            file.sourceId === requestedCoverId && file.mediaType === "image"
        )) || selectedFiles.find((file) => file.mediaType === "image");
        const settings = { ...validation.value, coverFilename: coverFile?.destinationName || null };
        delete settings.password;
        const usage = accountUsage(
            req.auth.userId, account?.plan || "free", account?.planStatus
        );
        const now = new Date().toISOString();
        let reservation;
        try {
            reservation = deliveryStore.reserveTransferConversion({
                job: {
                    id: uuidv4(),
                    ownerId: req.auth.userId,
                    transferId: transfer.id,
                    idempotencyKey,
                    deliveryId: uuidv4(),
                    selectedFiles,
                    settings,
                    expectedBytes,
                    createdAt: now
                },
                limits: {
                    galleryLimit: usage.galleryLimit,
                    galleryStorageBytes: usage.storageBytes,
                    galleryStorageLimitBytes: usage.storageLimitBytes,
                    accountConcurrentConversions:
                        economicConfig.accountConcurrentConversions,
                    globalConcurrentConversions:
                        economicConfig.globalConcurrentConversions
                }
            });
        } catch (error) {
            console.error(error);
            recordUsage(req.auth.userId, "errors", 1);
            return res.status(500).json({ error: "No se pudo reservar la conversión" });
        }
        if (!reservation.ok) {
            const messages = {
                PLAN_GALLERY_LIMIT: `Ya tienes ${usage.galleryLimit} galerías. Elimina una antes de crear otra.`,
                PLAN_STORAGE_LIMIT: "La conversión supera el almacenamiento de tu plan",
                ACCOUNT_CONVERSION_CONCURRENCY_LIMIT: "Ya tienes una conversión en curso",
                GLOBAL_CONVERSION_CONCURRENCY_LIMIT: "Hay otras conversiones en curso. Inténtalo en unos minutos"
            };
            return res.status(reservation.code.includes("CONCURRENCY") ? 429 : 403)
                .json({ error: messages[reservation.code], code: reservation.code });
        }
        if (reservation.job.transferId !== transfer.id) {
            return res.status(409).json({
                error: "Este identificador de operación ya se utilizó en otra transferencia",
                code: "IDEMPOTENCY_KEY_REUSED"
            });
        }
        if (!["ready", "building"].includes(reservation.job.status)) {
            setImmediate(() => runTransferConversion(reservation.job.id).catch(console.error));
        }
        res.status(reservation.job.status === "ready" ? 200 : 202).json({
            conversion: publicConversionJob(reservation.job, req),
            idempotentReplay: reservation.existing
        });
    });

app.get("/transfers/:transferId/conversions/:jobId", requireAuth, (req, res) => {
    const job = deliveryStore.getOwnedTransferConversion(
        req.params.jobId, req.auth.userId
    );
    if (!job || job.transferId !== req.params.transferId) {
        return res.status(404).json({ error: "Conversión no encontrada" });
    }
    res.set("Cache-Control", "no-store");
    res.json({ conversion: publicConversionJob(job, req) });
});

app.post("/transfers/:transferId/conversions/:jobId/retry", requireAuth,
    requireSameOrigin, limitSensitiveAction, (req, res) => {
        const job = deliveryStore.getOwnedTransferConversion(
            req.params.jobId, req.auth.userId
        );
        const transfer = deliveryStore.getOwnedTransfer(
            req.params.transferId, req.auth.userId
        );
        if (!job || job.transferId !== req.params.transferId || !transfer) {
            return res.status(404).json({ error: "Conversión no encontrada" });
        }
        if (job.status !== "failed") {
            return res.status(409).json({ error: "Esta conversión no necesita reintentarse" });
        }
        if (Date.parse(transfer.expiresAt) <= Date.now()) {
            return res.status(410).json({
                error: "La transferencia caducó y ya no puede reintentarse"
            });
        }
        const account = userForCurrentBillingEnvironment(
            deliveryStore.getUserById(req.auth.userId)
        );
        const usage = accountUsage(
            req.auth.userId, account?.plan || "free", account?.planStatus
        );
        const retried = deliveryStore.retryTransferConversion({
            id: job.id,
            ownerId: req.auth.userId,
            updatedAt: new Date().toISOString(),
            limits: {
                galleryLimit: usage.galleryLimit,
                galleryStorageBytes: usage.storageBytes,
                galleryStorageLimitBytes: usage.storageLimitBytes,
                accountConcurrentConversions:
                    economicConfig.accountConcurrentConversions,
                globalConcurrentConversions:
                    economicConfig.globalConcurrentConversions
            }
        });
        if (!retried.ok) {
            return res.status(retried.code.includes("CONCURRENCY") ? 429 : 403)
                .json({
                    error: retried.code === "PLAN_GALLERY_LIMIT"
                        ? "No tienes espacio para otra galería"
                        : "No se puede reintentar mientras haya otra conversión o se supere la cuota",
                    code: retried.code
                });
        }
        setImmediate(() => runTransferConversion(job.id).catch(console.error));
        res.status(202).json({
            conversion: publicConversionJob(
                retried.job, req
            )
        });
    });

app.post("/transfers/multipart", requireSameOrigin, limitSensitiveAction, allowTransferCreator, (req, res) => {
    if (!economicConfig.acceptNewTransfers) {
        return res.status(503).json({
            error: "Las nuevas transferencias están pausadas temporalmente",
            code: "TRANSFERS_PAUSED"
        });
    }
    if (!objectStorage.enabled) {
        return res.status(409).json({ error: "La subida por partes no está configurada" });
    }
    const rawFiles = Array.isArray(req.body?.files) ? req.body.files : [];
    if (!rawFiles.length) return res.status(400).json({ error: "Selecciona al menos un archivo" });
    if (rawFiles.length > MAX_TRANSFER_FILES) {
        return res.status(400).json({ error: `Cada transferencia admite como máximo ${MAX_TRANSFER_FILES} archivos` });
    }

    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    const recipientEmail = normalizeEmail(req.body.recipientEmail);
    const senderEmail = transferSenderEmail(req, req.body.senderEmail);
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!title || title.length > 100) return res.status(400).json({ error: "Escribe un título de hasta 100 caracteres" });
    if (message.length > 500) return res.status(400).json({ error: "El mensaje no puede superar 500 caracteres" });
    if (recipientEmail && !validEmail(recipientEmail)) {
        return res.status(400).json({ error: "El correo del destinatario no es válido" });
    }
    if (recipientEmail && !validEmail(senderEmail)) {
        return res.status(400).json({ error: "Añade un correo válido del remitente" });
    }
    if (recipientEmail && !transferSenderEmailIsVerified(req, senderEmail)) {
        return res.status(403).json({
            error: "Confirma tu correo antes de enviar la transferencia",
            code: "SENDER_EMAIL_VERIFICATION_REQUIRED"
        });
    }
    if (password && (password.length < 4 || password.length > 128)) {
        return res.status(400).json({ error: "La contraseña debe tener entre 4 y 128 caracteres" });
    }

    const usedNames = new Set();
    const files = [];
    for (const item of rawFiles) {
        const size = Number(item?.size);
        if (!Number.isSafeInteger(size) || size < 0 || size > MAX_TRANSFER_FILE_SIZE_BYTES) {
            return res.status(400).json({ error: "Uno de los archivos tiene un tamaño no válido" });
        }
        const name = safeTransferFilename(item?.name, usedNames);
        const extension = path.extname(name).toLowerCase();
        if (blockedTransferExtensions.has(extension)) {
            return res.status(400).json({ error: `El tipo de archivo ${extension} no está permitido por seguridad` });
        }
        files.push({
            id: uuidv4(),
            name,
            size,
            mimeType: typeof item?.type === "string"
                ? item.type.slice(0, 150) || "application/octet-stream"
                : "application/octet-stream"
        });
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    const account = userForCurrentBillingEnvironment(
        deliveryStore.getUserById(req.auth.userId)
    );
    const plan = effectivePlan(account?.plan || "free", account?.planStatus);

    const transferId = uuidv4();
    const now = Date.now();
    const createdAt = new Date(now).toISOString();
    const passwordRecord = password
        ? createPasswordRecord(password)
        : { passwordHash: null, passwordSalt: null };
    try {
        const reservation = deliveryStore.reserveTransferUpload({
            transfer: {
                id: transferId,
                ownerId: req.auth.userId,
                title,
                message,
                recipientEmail,
                senderEmail,
                createdAt,
                expiresAt: new Date(now + economicConfig.uploadLeaseMs).toISOString(),
                passwordHash: passwordRecord.passwordHash,
                passwordSalt: passwordRecord.passwordSalt,
                fileCount: files.length,
                totalBytes,
                status: "uploading",
                storageProvider: "r2"
            },
            files: files.map((file) => ({ ...file, createdAt })),
            limits: transferAdmissionLimits(plan, req.guestTransfer),
            nowIso: createdAt,
            period: monthKey(createdAt)
        });
        if (!reservation.ok) {
            return res.status(reservation.code.includes("CONCURRENCY") ? 429 : 403).json({
                error: quotaMessage(reservation.code),
                code: reservation.code,
                usage: accountUsage(
                    req.auth.userId, account?.plan || "free", account?.planStatus
                )
            });
        }
    } catch (error) {
        console.error(error);
        recordUsage(req.auth.userId, "errors", 1);
        return res.status(500).json({ error: "No se pudo preparar la transferencia" });
    }
    res.status(201).json({
        transferId,
        files,
        partSize: objectStorage.partSize,
        totalBytes
    });
});

app.post("/transfers/:transferId/files/:fileId/start", requireSameOrigin, requireTransferUploadOwner, async (req, res) => {
    if (!objectStorage.enabled) return res.status(409).json({ error: "R2 no está configurado" });
    const transfer = deliveryStore.getOwnedTransfer(req.params.transferId, req.auth.userId);
    const file = deliveryStore.getOwnedTransferFile(
        req.params.fileId, req.params.transferId, req.auth.userId
    );
    if (!transfer || !file || transfer.storageProvider !== "r2") {
        return res.status(404).json({ error: "Archivo no encontrado" });
    }
    if (file.status === "ready") return res.json({ ready: true });
    if (file.status === "uploading" && file.objectKey && file.multipartUploadId) {
        return res.json({
            fileId: file.id,
            partSize: objectStorage.partSize,
            partCount: Math.max(1, Math.ceil(file.size / objectStorage.partSize))
        });
    }
    try {
        const upload = await objectStorage.startMultipart({
            transferId: transfer.id,
            fileId: file.id,
            contentType: file.mimeType,
            filename: file.name
        });
        deliveryStore.markTransferFileStarted(
            file.id, transfer.id, upload.key, upload.uploadId
        );
        deliveryStore.touchTransferUpload(
            transfer.id, req.auth.userId,
            new Date(Date.now() + economicConfig.uploadLeaseMs).toISOString()
        );
        res.status(201).json({
            fileId: file.id,
            partSize: objectStorage.partSize,
            partCount: Math.max(1, Math.ceil(file.size / objectStorage.partSize))
        });
    } catch (error) {
        console.error(error);
        recordUsage(req.auth.userId, "errors", 1);
        res.status(502).json({ error: "No se pudo iniciar la subida del archivo" });
    }
});

app.post("/transfers/:transferId/files/:fileId/parts", requireSameOrigin, requireTransferUploadOwner, async (req, res) => {
    if (!objectStorage.enabled) return res.status(409).json({ error: "R2 no está configurado" });
    const file = deliveryStore.getOwnedTransferFile(
        req.params.fileId, req.params.transferId, req.auth.userId
    );
    if (!file || file.status !== "uploading" || !file.multipartUploadId) {
        return res.status(404).json({ error: "Subida no encontrada" });
    }
    const partNumbers = Array.isArray(req.body?.partNumbers)
        ? [...new Set(req.body.partNumbers.map(Number))]
        : [];
    const partCount = Math.max(1, Math.ceil(file.size / objectStorage.partSize));
    if (!partNumbers.length || partNumbers.length > 12
        || partNumbers.some((number) => !Number.isInteger(number)
            || number < 1 || number > partCount)) {
        return res.status(400).json({ error: "Bloques de subida no válidos" });
    }
    try {
        const urls = await Promise.all(partNumbers.map(async (partNumber) => ({
            partNumber,
            url: await objectStorage.signPart({
                key: file.objectKey,
                uploadId: file.multipartUploadId,
                partNumber
            })
        })));
        deliveryStore.touchTransferUpload(
            req.params.transferId, req.auth.userId,
            new Date(Date.now() + economicConfig.uploadLeaseMs).toISOString()
        );
        res.json({ urls });
    } catch (error) {
        console.error(error);
        const transfer = deliveryStore.getOwnedTransfer(
            req.params.transferId, req.auth.userId
        );
        recordUsage(transfer?.ownerId || req.auth.userId, "errors", 1);
        res.status(502).json({ error: "No se pudieron autorizar los bloques" });
    }
});

app.post("/transfers/:transferId/files/:fileId/complete", requireSameOrigin, requireTransferUploadOwner, async (req, res) => {
    if (!objectStorage.enabled) return res.status(409).json({ error: "R2 no está configurado" });
    const file = deliveryStore.getOwnedTransferFile(
        req.params.fileId, req.params.transferId, req.auth.userId
    );
    if (!file || file.status !== "uploading" || !file.multipartUploadId) {
        return res.status(404).json({ error: "Subida no encontrada" });
    }
    try {
        const parts = await objectStorage.listParts({
            key: file.objectKey,
            uploadId: file.multipartUploadId
        });
        const expectedParts = Math.max(1, Math.ceil(file.size / objectStorage.partSize));
        if (parts.length !== expectedParts
            || parts.some((part, index) => part.partNumber !== index + 1)) {
            return res.status(409).json({ error: "Aún faltan bloques por subir" });
        }
        await objectStorage.completeMultipart({
            key: file.objectKey,
            uploadId: file.multipartUploadId,
            parts
        });
        deliveryStore.markTransferFileReady(file.id, file.transferId);
        deliveryStore.touchTransferUpload(
            file.transferId, req.auth.userId,
            new Date(Date.now() + economicConfig.uploadLeaseMs).toISOString()
        );
        res.json({ ready: true });
    } catch (error) {
        console.error(error);
        recordUsage(req.auth.userId, "errors", 1);
        res.status(502).json({ error: "No se pudo completar el archivo" });
    }
});

app.post("/transfers/:transferId/complete", requireSameOrigin, requireTransferUploadOwner, (req, res) => {
    const transfer = deliveryStore.getOwnedTransfer(req.params.transferId, req.auth.userId);
    if (!transfer || transfer.storageProvider !== "r2") {
        return res.status(404).json({ error: "Transferencia no encontrada" });
    }
    if (deliveryStore.transferHasPendingFiles(transfer.id)) {
        return res.status(409).json({ error: "Aún quedan archivos por completar" });
    }
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    if (transfer.status !== "ready") {
        deliveryStore.finalizeTransferUpload(
            transfer.id, req.auth.userId, expiresAt, new Date().toISOString()
        );
    }
    res.json({
        transferId: transfer.id,
        fileCount: transfer.fileCount,
        totalBytes: transfer.totalBytes,
        link: `${publicBaseUrl(req)}/t/${transfer.id}`
    });
});

app.post("/transfers", requireSameOrigin, limitSensitiveAction, allowTransferCreator, (req, res) => {
    if (!economicConfig.acceptNewTransfers) {
        return res.status(503).json({
            error: "Las nuevas transferencias están pausadas temporalmente",
            code: "TRANSFERS_PAUSED"
        });
    }
    const transferPlan = ownerPlan(req.auth.userId);
    if (!acquireUploadSlot(res, req.auth.userId, transferPlan)) {
        return res.status(429).json({
            error: quotaMessage("GLOBAL_UPLOAD_CONCURRENCY_LIMIT"),
            code: "GLOBAL_UPLOAD_CONCURRENCY_LIMIT"
        });
    }
    const transferId = uuidv4();
    req.transferId = transferId;
    transferUpload.array("files", MAX_TRANSFER_FILES)(req, res, (error) => {
        const folderPath = transferFolderPath(transferId);
        const fail = (status, message, extra = {}) => {
            if (folderPath && fs.existsSync(folderPath)) {
                fs.rmSync(folderPath, { recursive: true, force: true });
            }
            return res.status(status).json({ error: message, ...extra });
        };
        if (error) return fail(400, error.message);
        if (!req.files?.length) return fail(400, "Selecciona al menos un archivo");

        const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
        const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
        const recipientEmail = normalizeEmail(req.body.recipientEmail);
        const senderEmail = transferSenderEmail(req, req.body.senderEmail);
        const password = typeof req.body.password === "string" ? req.body.password : "";
        if (!title || title.length > 100) return fail(400, "Escribe un título de hasta 100 caracteres");
        if (message.length > 500) return fail(400, "El mensaje no puede superar 500 caracteres");
        if (recipientEmail && !validEmail(recipientEmail)) return fail(400, "El correo del destinatario no es válido");
        if (recipientEmail && !validEmail(senderEmail)) {
            return fail(400, "Añade un correo válido del remitente");
        }
        if (recipientEmail && !transferSenderEmailIsVerified(req, senderEmail)) {
            return fail(403, "Confirma tu correo antes de enviar la transferencia", {
                code: "SENDER_EMAIL_VERIFICATION_REQUIRED"
            });
        }
        if (password && (password.length < 4 || password.length > 128)) {
            return fail(400, "La contraseña debe tener entre 4 y 128 caracteres");
        }

        const now = Date.now();
        const expiresAtMs = now + 24 * 60 * 60 * 1000;

        const totalBytes = req.files.reduce((total, file) => total + file.size, 0);
        const account = userForCurrentBillingEnvironment(
            deliveryStore.getUserById(req.auth.userId)
        );
        const plan = effectivePlan(account?.plan || "free", account?.planStatus);

        const passwordRecord = password
            ? createPasswordRecord(password)
            : { passwordHash: null, passwordSalt: null };
        const createdAt = new Date(now).toISOString();
        try {
            const reservation = deliveryStore.reserveTransferUpload({
                transfer: {
                    id: transferId,
                    ownerId: req.auth.userId,
                    title,
                    message,
                    recipientEmail,
                    senderEmail,
                    createdAt,
                    expiresAt: new Date(expiresAtMs).toISOString(),
                    passwordHash: passwordRecord.passwordHash,
                    passwordSalt: passwordRecord.passwordSalt,
                    fileCount: req.files.length,
                    totalBytes,
                    status: "ready",
                    storageProvider: "local"
                },
                limits: transferAdmissionLimits(plan, req.guestTransfer),
                nowIso: createdAt,
                period: monthKey(createdAt)
            });
            if (!reservation.ok) {
                return fail(reservation.code.includes("CONCURRENCY") ? 429 : 403,
                    quotaMessage(reservation.code), {
                        code: reservation.code,
                        usage: accountUsage(
                            req.auth.userId, account?.plan || "free", account?.planStatus
                        )
                    });
            }
        } catch (databaseError) {
            console.error(databaseError);
            recordUsage(req.auth.userId, "errors", 1);
            return fail(500, "No se pudo guardar la transferencia");
        }
        res.status(201).json({
            transferId,
            fileCount: req.files.length,
            totalBytes,
            link: `${publicBaseUrl(req)}/t/${transferId}`
        });
    });
});

app.delete("/transfers/:transferId", requireSameOrigin, requireTransferUploadOwner, async (req, res) => {
    const transfer = deliveryStore.getOwnedTransfer(req.params.transferId, req.auth.userId);
    if (!transfer) return res.status(404).json({ error: "Transferencia no encontrada" });
    if (deliveryStore.hasActiveTransferConversion(transfer.id)) {
        return res.status(409).json({
            error: "Espera a que termine la conversión antes de borrar esta transferencia"
        });
    }
    try {
        await removeTransferStorage(transfer);
        deliveryStore.deleteTransfer(transfer.id, req.auth.userId);
        res.json({ message: "Transferencia eliminada" });
    } catch (error) {
        console.error(error);
        res.status(502).json({ error: "No se pudieron eliminar todos los archivos" });
    }
});

app.post("/transfers/:transferId/send", requireSameOrigin,
    requireTransferUploadOwner, limitSensitiveAction, async (req, res) => {
    const transfer = deliveryStore.getOwnedTransfer(
        req.params.transferId, req.auth.userId
    );
    if (!transfer) return res.status(404).json({ error: "Transferencia no encontrada" });
    if (transfer.status !== "ready") {
        return res.status(409).json({ error: "Espera a que termine la subida antes de enviar el correo" });
    }
    if (Date.parse(transfer.expiresAt) <= Date.now()) {
        return res.status(410).json({ error: "La transferencia ha caducado" });
    }
    const recipientEmail = normalizeEmail(req.body?.email || transfer.recipientEmail);
    if (!validEmail(recipientEmail)) {
        return res.status(400).json({ error: "Añade un correo válido del destinatario" });
    }
    if (req.guestTransfer
        && recipientEmail !== normalizeEmail(transfer.recipientEmail)) {
        return res.status(403).json({
            error: "El correo debe coincidir con el destinatario indicado al crear la transferencia"
        });
    }
    const senderEmail = normalizeEmail(transfer.senderEmail)
        || (req.guestTransfer
            ? ""
            : normalizeEmail(
                deliveryStore.getUserById(req.auth.userId)?.email
            ));
    if (req.guestTransfer
        && (!validEmail(senderEmail)
            || !transferSenderEmailIsVerified(req, senderEmail))) {
        return res.status(403).json({
            error: "Confirma el correo del remitente antes de enviar",
            code: "SENDER_EMAIL_VERIFICATION_REQUIRED"
        });
    }
    try {
        const profile = req.guestTransfer
            ? null
            : deliveryStore.getBrandProfile(req.auth.userId);
        const mail = await sendTransferDelivery({
            to: recipientEmail,
            senderName: profile?.brandName || senderEmail || "Straclase",
            replyTo: senderEmail || undefined,
            title: transfer.title,
            message: transfer.message,
            link: `${publicBaseUrl(req)}/t/${transfer.id}`,
            protectedTransfer: transfer.hasPassword,
            expiresAt: transfer.expiresAt
        });
        res.json({
            delivered: mail.delivered,
            message: mail.delivered
                ? `Transferencia enviada a ${recipientEmail}`
                : "El correo real aún no está configurado. El enlace está listo para copiar.",
            devLink: isProduction ? null : mail.devLink
        });
    } catch (error) {
        console.error(error);
        res.status(502).json({ error: "No se pudo enviar el correo" });
    }
});

app.get("/templates", requireAuth, (req, res) => {
    res.json({ templates: deliveryStore.listTemplates(req.auth.userId) });
});

app.post("/templates", requireAuth, requireSameOrigin, (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name || name.length > 60) {
        return res.status(400).json({ error: "El nombre de la plantilla debe tener entre 1 y 60 caracteres" });
    }
    if (deliveryStore.listTemplates(req.auth.userId).length >= 20) {
        return res.status(403).json({ error: "Puedes guardar como máximo 20 plantillas" });
    }
    const settings = sanitizeTemplateSettings(req.body?.settings);
    const now = new Date().toISOString();
    const id = deliveryStore.createTemplate(
        req.auth.userId, name, settings, now
    );
    res.status(201).json({
        template: deliveryStore.getTemplate(id, req.auth.userId)
    });
});

app.delete("/templates/:templateId", requireAuth, requireSameOrigin, (req, res) => {
    const id = Number(req.params.templateId);
    if (!Number.isInteger(id)
        || !deliveryStore.deleteTemplate(id, req.auth.userId)) {
        return res.status(404).json({ error: "Plantilla no encontrada" });
    }
    res.status(204).end();
});

app.get("/deliveries", requireAuth, (req, res) => {
    const deliveries = deliveryStore.listDeliveries(req.auth.userId).map((delivery) => {
        const selection = deliveryStore.getSelectionSettings(delivery.id);
        return {
            ...delivery,
            favoriteCount: deliveryStore.listFavorites(delivery.id).length,
            selection,
            latestActivity: deliveryStore.listActivity(delivery.id, 1)[0] || null,
            link: `/s/${delivery.id}`
        };
    });

    res.json({ deliveries });
});

app.get("/deliveries/:folderId", requireAuth, (req, res) => {
    const folderPath = galleryFolderPath(req.params.folderId);
    const delivery = deliveryStore.getOwnedDelivery(
        req.params.folderId, req.auth.userId
    );

    if (!folderPath || !delivery || !fs.existsSync(folderPath)) {
        return res.status(404).json({ error: "Entrega no encontrada" });
    }

    const account = userForCurrentBillingEnvironment(
        deliveryStore.getUserById(req.auth.userId)
    );
    const plan = effectivePlan(account?.plan || "free", account?.planStatus);
    res.json({
        policy: {
            plan,
            galleryLifetimeDays: planLimits(plan).galleryLifetimeDays
        },
        delivery: {
            ...delivery,
            selection: deliveryStore.getSelectionSettings(delivery.id),
            selectionComments: deliveryStore.listFavoriteComments(delivery.id),
            activity: deliveryStore.listActivity(delivery.id),
            sections: deliveryStore.listSections(delivery.id),
            mediaSections: deliveryStore.listMediaSections(delivery.id),
            hasLogo: galleryHasLogo(folderPath),
            logoUrl: galleryHasLogo(folderPath)
                ? `/gallery/${delivery.id}/logo`
                : null,
            link: `/s/${delivery.id}`,
            files: listGalleryFiles(folderPath),
            mediaTypes: mediaTypesForFiles(listGalleryFiles(folderPath)),
            favorites: deliveryStore.listFavorites(delivery.id)
                .map((favorite) => favorite.filename)
        }
    });
});

app.post("/deliveries/:folderId/sections", requireAuth, requireSameOrigin, (req, res) => {
    const delivery = deliveryStore.getOwnedDelivery(
        req.params.folderId, req.auth.userId
    );
    if (!delivery) return res.status(404).json({ error: "Entrega no encontrada" });
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const sections = deliveryStore.listSections(delivery.id);
    if (!name || name.length > 60) {
        return res.status(400).json({ error: "El nombre de sección debe tener entre 1 y 60 caracteres" });
    }
    if (sections.length >= 20) {
        return res.status(403).json({ error: "Cada galería admite hasta 20 secciones" });
    }
    const id = deliveryStore.addSection(
        delivery.id, name, sections.length, new Date().toISOString()
    );
    res.status(201).json({
        section: deliveryStore.listSections(delivery.id)
            .find((section) => section.id === id)
    });
});

app.delete("/deliveries/:folderId/sections/:sectionId", requireAuth, requireSameOrigin, (req, res) => {
    const delivery = deliveryStore.getOwnedDelivery(
        req.params.folderId, req.auth.userId
    );
    const sectionId = Number(req.params.sectionId);
    if (!delivery || !Number.isInteger(sectionId)
        || !deliveryStore.deleteSection(sectionId, delivery?.id)) {
        return res.status(404).json({ error: "Sección no encontrada" });
    }
    res.status(204).end();
});

app.put("/deliveries/:folderId/photos/:filename/section", requireAuth, requireSameOrigin, (req, res) => {
    const folderPath = galleryFolderPath(req.params.folderId);
    const delivery = deliveryStore.getOwnedDelivery(
        req.params.folderId, req.auth.userId
    );
    const filename = req.params.filename;
    if (!folderPath || !delivery || !listGalleryFiles(folderPath).includes(filename)) {
        return res.status(404).json({ error: "Fotografía no encontrada" });
    }
    const sectionId = req.body?.sectionId === null || req.body?.sectionId === ""
        ? null
        : Number(req.body?.sectionId);
    if (sectionId !== null && !deliveryStore.listSections(delivery.id)
        .some((section) => section.id === sectionId)) {
        return res.status(400).json({ error: "La sección no pertenece a esta galería" });
    }
    deliveryStore.setMediaSection(delivery.id, filename, sectionId);
    res.json({ filename, sectionId });
});

app.post("/deliveries/:folderId/selection/reopen", requireAuth, requireSameOrigin, (req, res) => {
    const delivery = deliveryStore.getOwnedDelivery(
        req.params.folderId, req.auth.userId
    );
    if (!delivery) return res.status(404).json({ error: "Entrega no encontrada" });
    const current = deliveryStore.getSelectionSettings(delivery.id);
    const selection = deliveryStore.saveSelectionSettings({
        ...current,
        status: "open",
        submittedAt: null,
        updatedAt: new Date().toISOString()
    });
    deliveryStore.logActivity(delivery.id, "selection_reopened");
    res.json({ selection });
});

app.put("/deliveries/:folderId", requireAuth, requireSameOrigin, (req, res) => {
    const current = deliveryStore.getOwnedDeliveryAccess(
        req.params.folderId, req.auth.userId
    );
    if (!current) {
        return res.status(404).json({ error: "Entrega no encontrada" });
    }

    const account = userForCurrentBillingEnvironment(
        deliveryStore.getUserById(req.auth.userId)
    );
    const plan = effectivePlan(account?.plan || "free", account?.planStatus);
    const validation = validateDeliverySettings(req.body || {}, {
        maxExpiryDays: planLimits(plan).galleryLifetimeDays
    });
    if (validation.error) {
        return res.status(400).json({ error: validation.error });
    }

    const settings = validation.value;
    const folderPath = galleryFolderPath(current.id);
    const files = folderPath && fs.existsSync(folderPath)
        ? listGalleryFiles(folderPath)
        : [];
    if (settings.coverFilename && !files.includes(settings.coverFilename)) {
        return res.status(400).json({
            error: "La fotografía de portada no pertenece a esta entrega"
        });
    }
    let passwordHash = current.passwordHash;
    let passwordSalt = current.passwordSalt;
    let passwordChanged = false;

    if (parseBoolean(req.body.removePassword, false)) {
        passwordHash = null;
        passwordSalt = null;
        passwordChanged = current.hasPassword;
    } else if (settings.password) {
        const passwordRecord = createPasswordRecord(settings.password);
        passwordHash = passwordRecord.passwordHash;
        passwordSalt = passwordRecord.passwordSalt;
        passwordChanged = true;
    }

    const updatedAt = new Date().toISOString();
    deliveryStore.updateDelivery({
        id: current.id,
        ...settings,
        passwordHash,
        passwordSalt,
        publishedAt: settings.status === "published"
            ? current.publishedAt || updatedAt
            : current.publishedAt,
        lastSentAt: current.lastSentAt,
        updatedAt
    });
    const currentSelection = deliveryStore.getSelectionSettings(current.id);
    deliveryStore.saveSelectionSettings({
        ...currentSelection,
        deliveryId: current.id,
        selectionLimit: settings.selectionLimit,
        updatedAt
    });

    if (passwordChanged) {
        deliveryStore.deleteGallerySessions(current.id);
    }

    res.json({ delivery: deliveryStore.getDelivery(current.id) });
});

app.post("/deliveries/:folderId/send", requireAuth, requireSameOrigin, async (req, res) => {
    const delivery = deliveryStore.getOwnedDeliveryAccess(
        req.params.folderId, req.auth.userId
    );
    if (!delivery) {
        return res.status(404).json({ error: "Entrega no encontrada" });
    }
    if (delivery.status !== "published") {
        return res.status(409).json({
            error: "Activa la visualización antes de enviar la galería"
        });
    }

    const clientEmail = normalizeEmail(req.body?.email || delivery.clientEmail);
    if (!validEmail(clientEmail)) {
        return res.status(400).json({ error: "Escribe un correo válido del cliente" });
    }

    try {
        const link = `${publicBaseUrl(req)}/s/${delivery.id}`;
        const mail = await sendGalleryDelivery({
            to: clientEmail,
            clientName: delivery.clientName,
            photographerName: delivery.brandName || "Tu fotógrafo",
            galleryName: delivery.clientName,
            link,
            protectedGallery: delivery.hasPassword
        });
        const now = new Date().toISOString();
        deliveryStore.updateDelivery({
            ...delivery,
            clientEmail,
            lastSentAt: mail.delivered ? now : delivery.lastSentAt,
            updatedAt: now
        });
        res.json({
            message: mail.delivered
                ? `Galería enviada a ${clientEmail}`
                : "El correo real aún no está configurado. El enlace está listo para copiar.",
            delivered: mail.delivered,
            devLink: isProduction ? null : mail.devLink
        });
    } catch (error) {
        console.error(`[${req.requestId}] Gallery email error`, error);
        res.status(502).json({
            error: "No se pudo enviar el correo. Inténtalo de nuevo más tarde."
        });
    }
});

app.post("/deliveries/:folderId/logo", requireAuth, requireSameOrigin, (req, res) => {
    const folderPath = galleryFolderPath(req.params.folderId);
    const delivery = deliveryStore.getOwnedDelivery(
        req.params.folderId, req.auth.userId
    );
    if (!folderPath || !delivery || !fs.existsSync(folderPath)) {
        return res.status(404).json({ error: "Entrega no encontrada" });
    }

    brandLogoUpload.single("logo")(req, res, async (error) => {
        if (error) return res.status(400).json({ error: error.message });
        if (!req.file || !isSupportedImageBuffer(req.file.buffer)) {
            return res.status(400).json({
                error: "Selecciona una imagen de marca válida"
            });
        }
        try {
            await createLogo(req.file.buffer, galleryLogoPath(folderPath));
            res.status(201).json({
                logoUrl: `/gallery/${delivery.id}/logo?v=${Date.now()}`
            });
        } catch (processingError) {
            console.error(processingError);
            res.status(400).json({ error: "No se pudo procesar la imagen de marca" });
        }
    });
});

app.delete("/deliveries/:folderId/logo", requireAuth, requireSameOrigin, (req, res) => {
    const folderPath = galleryFolderPath(req.params.folderId);
    if (!folderPath || !deliveryStore.getOwnedDelivery(
        req.params.folderId, req.auth.userId
    )) {
        return res.status(404).json({ error: "Entrega no encontrada" });
    }
    fs.rmSync(galleryLogoPath(folderPath), { force: true });
    res.status(204).end();
});

app.post("/deliveries/:folderId/photos", requireAuth, requireSameOrigin, (req, res) => {
    const delivery = deliveryStore.getOwnedDelivery(
        req.params.folderId, req.auth.userId
    );
    const folderPath = galleryFolderPath(req.params.folderId);

    if (!delivery || !folderPath || !fs.existsSync(folderPath)) {
        return res.status(404).json({ error: "Entrega no encontrada" });
    }
    const existingRecords = listGalleryFileRecords(folderPath);
    const remoteGallery = galleryStoredInR2(folderPath);
    const account = userForCurrentBillingEnvironment(
        deliveryStore.getUserById(req.auth.userId)
    );
    const usageBeforeUpload = accountUsage(
        req.auth.userId, account?.plan || "free", account?.planStatus
    );
    const plan = effectivePlan(account?.plan || "free", account?.planStatus);
    if (!acquireUploadSlot(res, req.auth.userId, plan)) {
        return res.status(429).json({
            error: quotaMessage("GLOBAL_UPLOAD_CONCURRENCY_LIMIT"),
            code: "GLOBAL_UPLOAD_CONCURRENCY_LIMIT"
        });
    }

    req.folderId = req.params.folderId;
    upload.array("photos", MAX_PHOTOS_PER_DELIVERY)(req, res, async (error) => {
        if (error) {
            for (const file of req.files || []) fs.rmSync(file.path, { force: true });
            return res.status(400).json({ error: error.message });
        }
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: "Selecciona al menos una fotografía" });
        }
        if (!uploadedFilesAreMedia(req.files) || !uploadedFilesRespectSizeLimits(req.files)) {
            for (const file of req.files) {
                fs.rmSync(file.path, { force: true });
            }
            return res.status(400).json({
                error: "Algún archivo no es compatible o supera su límite (50 MB por foto, 500 MB por vídeo)"
            });
        }

        const files = [
            ...existingRecords.map((file) => file.name),
            ...req.files.map((file) => file.filename)
        ];
        if (files.length > MAX_PHOTOS_PER_DELIVERY) {
            for (const file of req.files) {
                fs.rmSync(file.path, { force: true });
            }
            return res.status(400).json({
                error: `Cada entrega admite como máximo ${MAX_PHOTOS_PER_DELIVERY} fotografías`
            });
        }
        const newBytes = req.files.reduce((sum, file) => sum + file.size, 0);
        const totalSize = existingRecords.reduce(
            (sum, file) => sum + file.size, newBytes
        );
        if (totalSize > MAX_DELIVERY_SIZE_BYTES) {
            for (const file of req.files) {
                fs.rmSync(file.path, { force: true });
            }
            return res.status(400).json({
                error: "La entrega no puede superar 10 GB"
            });
        }
        if (usageBeforeUpload.storageBytes + newBytes
            > usageBeforeUpload.storageLimitBytes) {
            for (const file of req.files) {
                fs.rmSync(file.path, { force: true });
            }
            return res.status(403).json({
                error: "Has alcanzado el almacenamiento de tu plan",
                code: "PLAN_STORAGE_LIMIT"
            });
        }

        try {
            await createPreviews(
                folderPath,
                req.files.map((file) => file.filename)
                    .filter((filename) => !isVideoFilename(filename))
            );
            if (remoteGallery) {
                await persistGalleryFilesToR2(
                    delivery.id, folderPath, req.files, existingRecords
                );
            }
        } catch (processingError) {
            console.error(processingError);
            for (const file of req.files) {
                fs.rmSync(file.path, { force: true });
                removePreview(folderPath, file.filename);
            }
            return res.status(400).json({
                error: "No se pudieron preparar algunas fotografías"
            });
        }

        deliveryStore.updatePhotoCount(
            delivery.id, files.length, new Date().toISOString()
        );
        recordUsage(req.auth.userId, "gallery_uploaded_bytes", newBytes);
        res.status(201).json({
            files: listGalleryFiles(folderPath),
            photoCount: files.length,
            mediaTypes: mediaTypesForFiles(files)
        });
    });
});

app.delete("/deliveries/:folderId/photos/:filename", requireAuth, requireSameOrigin, async (req, res) => {
    const folderPath = galleryFolderPath(req.params.folderId);
    const targetPath = photoPath(req.params.folderId, req.params.filename);
    const delivery = deliveryStore.getOwnedDeliveryAccess(
        req.params.folderId, req.auth.userId
    );
    const record = folderPath && fs.existsSync(folderPath)
        ? galleryFileRecord(folderPath, req.params.filename)
        : null;

    if (!folderPath || !targetPath || !delivery || !record) {
        return res.status(404).json({ error: "Fotografía no encontrada" });
    }

    const records = listGalleryFileRecords(folderPath);
    const files = records.map((file) => file.name);
    if (records.length <= 1) {
        return res.status(409).json({
            error: "Una entrega debe conservar al menos una fotografía"
        });
    }

    try {
        if (record.objectKey) {
            if (!galleryStorage.enabled) {
                return res.status(503).json({
                    error: "El almacenamiento de la galería no está disponible"
                });
            }
            await galleryStorage.deleteKeys([record.objectKey]);
            writeGalleryManifest(
                folderPath,
                records.filter((file) => file.name !== req.params.filename)
            );
        } else {
            fs.rmSync(targetPath);
        }
    } catch (error) {
        console.error(`[${req.requestId}] Gallery file delete error`, error);
        return res.status(502).json({
            error: "No se pudo eliminar la fotografía del almacenamiento"
        });
    }
    removePreview(folderPath, req.params.filename);
    deliveryStore.deleteFavoritesForFile(delivery.id, req.params.filename);
    if (delivery.coverFilename === req.params.filename) {
        deliveryStore.updateDelivery({
            ...delivery,
            coverFilename: files.find((file) => file !== req.params.filename),
            updatedAt: new Date().toISOString()
        });
    }
    deliveryStore.updatePhotoCount(
        delivery.id, files.length - 1, new Date().toISOString()
    );
    res.json({ photoCount: files.length - 1 });
});

app.delete("/deliveries", requireAuth, requireSameOrigin, async (req, res) => {
    const deliveries = deliveryStore.listDeliveries(req.auth.userId);
    try {
        for (const delivery of deliveries) {
            const folderPath = galleryFolderPath(delivery.id);
            if (folderPath && fs.existsSync(folderPath)) {
                await removeGalleryRemoteObjects(folderPath);
            }
        }
        for (const delivery of deliveries) {
            const folderPath = galleryFolderPath(delivery.id);
            if (folderPath && fs.existsSync(folderPath)) {
                fs.rmSync(folderPath, { recursive: true });
            }
        }
    } catch (error) {
        console.error(`[${req.requestId}] Gallery bulk delete error`, error);
        return res.status(502).json({
            error: "No se pudieron eliminar todas las entregas del almacenamiento"
        });
    }

    const deletedCount = deliveryStore.deleteAllDeliveries(req.auth.userId);

    res.json({
        message: "Todas las entregas fueron eliminadas",
        deletedCount
    });
});

app.delete("/deliveries/:folderId", requireAuth, requireSameOrigin, async (req, res) => {
    const folderPath = galleryFolderPath(req.params.folderId);
    const delivery = deliveryStore.getOwnedDelivery(
        req.params.folderId, req.auth.userId
    );

    if (!folderPath || !delivery) {
        return res.status(400).json({ error: "Identificador no válido" });
    }

    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
        deliveryStore.deleteDelivery(req.params.folderId, req.auth.userId);
        return res.status(404).json({ error: "Entrega no encontrada" });
    }

    try {
        await removeGalleryRemoteObjects(folderPath);
        fs.rmSync(folderPath, { recursive: true });
    } catch (error) {
        console.error(`[${req.requestId}] Gallery delete error`, error);
        return res.status(502).json({
            error: "No se pudo eliminar la entrega del almacenamiento"
        });
    }
    deliveryStore.deleteDelivery(req.params.folderId, req.auth.userId);

    res.json({ message: "Entrega eliminada correctamente" });
});

app.post("/upload", requireAuth, requireSameOrigin, limitSensitiveAction, (req, res) => {
    const account = userForCurrentBillingEnvironment(
        deliveryStore.getUserById(req.auth.userId)
    );
    const usageBeforeUpload = accountUsage(
        req.auth.userId, account?.plan || "free", account?.planStatus
    );
    if (usageBeforeUpload.galleryCount + usageBeforeUpload.reservedGalleryCount
        >= usageBeforeUpload.galleryLimit) {
        return res.status(403).json({
            error: `Ya tienes ${usageBeforeUpload.galleryLimit} galerías. Elimina una antes de crear otra.`,
            code: "PLAN_GALLERY_LIMIT",
            usage: usageBeforeUpload
        });
    }
    const plan = effectivePlan(account?.plan || "free", account?.planStatus);
    if (!acquireUploadSlot(res, req.auth.userId, plan)) {
        return res.status(429).json({
            error: quotaMessage("GLOBAL_UPLOAD_CONCURRENCY_LIMIT"),
            code: "GLOBAL_UPLOAD_CONCURRENCY_LIMIT"
        });
    }
    const folderId = uuidv4();
    req.folderId = folderId;

    upload.fields([
        { name: "photos", maxCount: MAX_PHOTOS_PER_DELIVERY },
        { name: "logo", maxCount: 1 }
    ])(req, res, async (error) => {
        const folderPath = galleryFolderPath(folderId);

        if (error) {
            if (folderPath) {
                fs.rmSync(folderPath, { recursive: true, force: true });
            }
            return res.status(400).json({ error: error.message });
        }

        const photos = req.files?.photos || [];
        const logo = req.files?.logo?.[0] || null;

        if (photos.length === 0) {
            fs.rmSync(folderPath, { recursive: true, force: true });
            return res.status(400).json({
                error: "Selecciona al menos una fotografía"
            });
        }
        if (!uploadedFilesAreMedia(photos)
            || !uploadedFilesRespectSizeLimits(photos)
            || (logo && !isSupportedImageFile(logo.path))) {
            fs.rmSync(folderPath, { recursive: true, force: true });
            return res.status(400).json({
                error: "Algún archivo no es compatible o supera su límite (50 MB por foto, 500 MB por vídeo)"
            });
        }

        const profile = deliveryStore.getBrandProfile(req.auth.userId);
        const validation = validateDeliverySettings({
            ...profile,
            ...req.body
        }, {
            maxExpiryDays: planLimits(plan).galleryLifetimeDays
        });
        if (validation.error) {
            fs.rmSync(folderPath, { recursive: true, force: true });
            return res.status(400).json({ error: validation.error });
        }

        const createdAt = new Date().toISOString();
        const settings = validation.value;
        const coverIndex = Math.max(
            0,
            Math.min(Number(req.body.coverIndex) || 0, photos.length - 1)
        );
        const requestedCover = photos[coverIndex];
        const coverFile = requestedCover && !isVideoFilename(requestedCover.filename)
            ? requestedCover
            : photos.find((file) => !isVideoFilename(file.filename));
        settings.coverFilename = coverFile?.filename || null;
        const passwordRecord = settings.password
            ? createPasswordRecord(settings.password)
            : { passwordHash: null, passwordSalt: null };

        const totalSize = photos.reduce((sum, file) => sum + file.size, 0);
        if (totalSize > MAX_DELIVERY_SIZE_BYTES) {
            fs.rmSync(folderPath, { recursive: true, force: true });
            return res.status(400).json({
                error: "La entrega no puede superar 10 GB"
            });
        }
        if (usageBeforeUpload.storageBytes
            + usageBeforeUpload.reservedGalleryStorageBytes + totalSize
            > usageBeforeUpload.storageLimitBytes) {
            fs.rmSync(folderPath, { recursive: true, force: true });
            return res.status(403).json({
                error: "Esta subida supera el almacenamiento de tu plan",
                code: "PLAN_STORAGE_LIMIT",
                usage: usageBeforeUpload
            });
        }

        let remoteRecords = [];
        try {
            await createPreviews(
                folderPath,
                photos.map((file) => file.filename)
                    .filter((filename) => !isVideoFilename(filename))
            );

            if (logo) {
                await createLogo(logo.path, galleryLogoPath(folderPath));
                fs.rmSync(logo.path, { force: true });
            } else {
                const defaultLogoPath = profileLogoPath(req.auth.userId);
                if (fs.existsSync(defaultLogoPath)) {
                    fs.mkdirSync(
                        path.dirname(galleryLogoPath(folderPath)),
                        { recursive: true }
                    );
                    fs.copyFileSync(
                        defaultLogoPath,
                        galleryLogoPath(folderPath)
                    );
                }
            }

            if (galleryStorage.enabled) {
                remoteRecords = await persistGalleryFilesToR2(
                    folderId, folderPath, photos
                );
            }

            const usageAtSave = accountUsage(
                req.auth.userId, account?.plan || "free", account?.planStatus
            );
            if (usageAtSave.galleryCount + usageAtSave.reservedGalleryCount
                >= usageAtSave.galleryLimit) {
                if (remoteRecords.length) {
                    await galleryStorage.deleteKeys(
                        remoteRecords.map((file) => file.objectKey)
                    ).catch(() => {});
                }
                fs.rmSync(folderPath, { recursive: true, force: true });
                return res.status(403).json({
                    error: `Ya tienes ${usageAtSave.galleryLimit} galerías. Elimina una antes de crear otra.`,
                    code: "PLAN_GALLERY_LIMIT",
                    usage: usageAtSave
                });
            }

            deliveryStore.createDelivery({
                id: folderId,
                ownerId: req.auth.userId,
                ...settings,
                ...passwordRecord,
                createdAt,
                publishedAt: settings.status === "published" ? createdAt : null,
                updatedAt: createdAt,
                photoCount: photos.length
            });
            deliveryStore.saveSelectionSettings({
                deliveryId: folderId,
                selectionLimit: settings.selectionLimit,
                status: "open",
                clientName: "",
                clientEmail: "",
                submittedAt: null,
                updatedAt: createdAt
            });
            recordUsage(req.auth.userId, "gallery_uploaded_bytes", totalSize);
        } catch (databaseError) {
            if (remoteRecords.length) {
                await galleryStorage.deleteKeys(
                    remoteRecords.map((file) => file.objectKey)
                ).catch(() => {});
            }
            fs.rmSync(folderPath, { recursive: true, force: true });
            console.error(databaseError);
            recordUsage(req.auth.userId, "errors", 1);
            return res.status(500).json({
                error: "No se pudo guardar la entrega"
            });
        }

        const baseUrl = publicBaseUrl(req);

        res.status(201).json({
            message: "Entrega creada correctamente",
            galleryId: folderId,
            photoCount: photos.length,
            link: `${baseUrl}/s/${folderId}`
        });
    });
});

app.post("/gallery/:folderId/unlock", requireSameOrigin, (req, res) => {
    const delivery = deliveryStore.getDeliveryAccess(req.params.folderId);
    const folderPath = galleryFolderPath(req.params.folderId);

    if (!delivery || !folderPath || !fs.existsSync(folderPath)) {
        return res.status(404).json({ error: "Galería no encontrada" });
    }
    const photographerSession = getSessionFromRequest(req);
    if (delivery.status !== "published"
        && photographerSession?.userId !== delivery.ownerId) {
        return res.status(404).json({ error: "Galería no encontrada" });
    }
    if (isExpired(delivery)) {
        return res.status(410).json({ error: "Esta galería ha caducado" });
    }
    if (!delivery.hasPassword) return res.status(204).end();

    const rateKey = `${req.ip}:${delivery.id}`;
    if (isGalleryRateLimited(rateKey)) {
        return res.status(429).json({
            error: "Demasiados intentos. Espera 15 minutos."
        });
    }

    const password = req.body?.password;
    if (typeof password !== "string"
        || !verifyPassword(password, delivery.passwordSalt, delivery.passwordHash)) {
        recordGalleryFailure(rateKey);
        return res.status(401).json({ error: "Contraseña incorrecta" });
    }

    galleryAttempts.delete(rateKey);
    const now = Date.now();
    const session = createSessionToken();
    deliveryStore.createGallerySession({
        tokenHash: session.tokenHash,
        deliveryId: delivery.id,
        createdAt: now,
        expiresAt: now + GALLERY_SESSION_DURATION_MS
    });
    res.cookie(galleryCookieName(delivery.id), session.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
        path: "/",
        maxAge: GALLERY_SESSION_DURATION_MS
    });
    res.status(204).end();
});

app.get("/gallery/:folderId/download", async (req, res) => {
    const context = getPublicGallery(req, res);
    if (!context) return;
    if (!context.delivery.allowOriginalDownload) {
        return res.status(403).json({
            error: "La descarga en calidad original está desactivada"
        });
    }

    const records = listGalleryFileRecords(context.folderPath);
    const files = records.map((file) => file.name);
    if (!economicConfig.zipEnabled) {
        return res.status(503).json({
            error: "La descarga ZIP está pausada. Puedes descargar las fotografías una a una",
            code: "ZIP_PAUSED"
        });
    }
    const totalBytes = records.reduce((total, file) => total + file.size, 0);
    const release = zipConcurrency.tryAcquire(context.delivery.ownerId, {
        globalLimit: economicConfig.globalConcurrentZips,
        accountLimit: economicConfig.accountConcurrentZips
    });
    if (!release) {
        return res.status(429).json({
            error: quotaMessage("GLOBAL_ZIP_CONCURRENCY_LIMIT"),
            code: "GLOBAL_ZIP_CONCURRENCY_LIMIT"
        });
    }
    const reservation = reserveEphemeralZip(context.delivery.ownerId, totalBytes);
    if (!reservation.ok) {
        release();
        return res.status(reservation.status).json({
            error: quotaMessage(reservation.code), code: reservation.code
        });
    }
    const archiveName = safeDownloadName(context.delivery.clientName);
    deliveryStore.logActivity(context.delivery.id, "download_gallery_original", {
        details: { fileCount: files.length }
    });

    res.attachment(`Straclase-${archiveName}.zip`);

    const archive = new ZipArchive({ store: true });
    let released = false;
    const releaseOnce = () => {
        if (released) return;
        released = true;
        release();
    };
    res.once("close", releaseOnce);
    res.once("finish", releaseOnce);

    archive.on("error", (error) => {
        console.error(error);
        res.destroy(error);
    });

    archive.pipe(res);

    try {
        for (const file of records) {
            if (file.objectKey) {
                if (!galleryStorage.enabled) {
                    throw new Error("R2 de galerías no está disponible");
                }
                archive.append(
                    await galleryStorage.getObjectStream(file.objectKey),
                    { name: file.name }
                );
            } else {
                archive.file(path.join(context.folderPath, file.name), {
                    name: file.name
                });
            }
        }
        await archive.finalize();
        recordUsage(context.delivery.ownerId, "downloaded_bytes", totalBytes);
    } catch (error) {
        console.error(error);
        if (!res.destroyed) res.destroy(error);
    }
});

app.get("/gallery/:folderId/download/web", async (req, res) => {
    const context = getPublicGallery(req, res);
    if (!context) return;
    if (!context.delivery.allowWebDownload) {
        return res.status(403).json({
            error: "La descarga en calidad web está desactivada"
        });
    }
    if (!economicConfig.zipEnabled) {
        return res.status(503).json({
            error: "La descarga ZIP está pausada. Puedes descargar las fotografías una a una",
            code: "ZIP_PAUSED"
        });
    }

    const records = listGalleryFileRecords(context.folderPath)
        .filter((file) => !isVideoFilename(file.name));
    const files = records.map((file) => file.name);
    if (!files.length) {
        return res.status(400).json({
            error: "Esta galería no contiene fotografías para preparar en calidad reducida"
        });
    }
    const failures = galleryStoredInR2(context.folderPath)
        ? files.filter((filename) => !fs.existsSync(
            previewPath(context.folderPath, filename)
        ))
        : await createPreviews(context.folderPath, files);
    if (failures.length) {
        console.error("No se pudieron generar miniaturas para la descarga web", failures);
        return res.status(500).json({
            error: "No se pudo preparar la descarga en calidad reducida"
        });
    }

    const totalBytes = files.reduce((total, file) => (
        total + fs.statSync(previewPath(context.folderPath, file)).size
    ), 0);
    const release = zipConcurrency.tryAcquire(context.delivery.ownerId, {
        globalLimit: economicConfig.globalConcurrentZips,
        accountLimit: economicConfig.accountConcurrentZips
    });
    if (!release) {
        return res.status(429).json({
            error: quotaMessage("GLOBAL_ZIP_CONCURRENCY_LIMIT"),
            code: "GLOBAL_ZIP_CONCURRENCY_LIMIT"
        });
    }
    const reservation = reserveEphemeralZip(context.delivery.ownerId, totalBytes);
    if (!reservation.ok) {
        release();
        return res.status(reservation.status).json({
            error: quotaMessage(reservation.code), code: reservation.code
        });
    }

    const archiveName = safeDownloadName(context.delivery.clientName);
    deliveryStore.logActivity(context.delivery.id, "download_gallery_web", {
        details: { fileCount: files.length }
    });
    res.attachment(`Straclase-${archiveName}-web.zip`);
    const archive = new ZipArchive({ store: true });
    let released = false;
    const releaseOnce = () => {
        if (released) return;
        released = true;
        release();
    };
    res.once("close", releaseOnce);
    res.once("finish", releaseOnce);
    archive.on("error", (error) => {
        console.error(error);
        res.destroy(error);
    });
    archive.pipe(res);
    for (const file of files) {
        archive.file(previewPath(context.folderPath, file), {
            name: webPhotoName(file)
        });
    }
    archive.finalize().catch((error) => {
        console.error(error);
        if (!res.destroyed) res.destroy(error);
    });
    recordUsage(context.delivery.ownerId, "downloaded_bytes", totalBytes);
});

app.get("/gallery/:folderId", (req, res) => {
    const context = getPublicGallery(req, res);
    if (!context) return;
    const files = listGalleryFiles(context.folderPath);
    const favorites = context.delivery.favoritesEnabled
        ? deliveryStore.listFavorites(context.delivery.id)
            .map((favorite) => favorite.filename)
        : [];
    const selection = deliveryStore.getSelectionSettings(context.delivery.id);
    const selectionComments = deliveryStore.listFavoriteComments(
        context.delivery.id
    );
    const photographerSession = getSessionFromRequest(req);
    if (photographerSession?.userId !== context.delivery.ownerId) {
        deliveryStore.logActivity(context.delivery.id, "gallery_view");
    }

    res.json({
        clientName: context.delivery.clientName,
        message: context.delivery.message,
        createdAt: context.delivery.createdAt,
        expiresAt: context.delivery.expiresAt,
        allowOriginalDownload: context.delivery.allowOriginalDownload,
        allowWebDownload: context.delivery.allowWebDownload,
        favoritesEnabled: context.delivery.favoritesEnabled,
        selection,
        selectionComments,
        sections: deliveryStore.listSections(context.delivery.id),
        mediaSections: deliveryStore.listMediaSections(context.delivery.id),
        brandName: context.delivery.brandName,
        accentColor: context.delivery.accentColor,
        backgroundColor: context.delivery.backgroundColor,
        websiteUrl: context.delivery.websiteUrl,
        instagramUrl: context.delivery.instagramUrl,
        facebookUrl: context.delivery.facebookUrl,
        tiktokUrl: context.delivery.tiktokUrl,
        socialLinks: context.delivery.socialLinks,
        galleryStyle: context.delivery.galleryStyle,
        coverFilename: context.delivery.coverFilename
            || files.find((filename) => !isVideoFilename(filename))
            || null,
        coverStyle: context.delivery.coverStyle,
        coverPositionX: context.delivery.coverPositionX,
        coverPositionY: context.delivery.coverPositionY,
        logoScale: context.delivery.logoScale,
        logoPositionX: context.delivery.logoPositionX,
        logoPositionY: context.delivery.logoPositionY,
        logoUrl: galleryHasLogo(context.folderPath)
            ? `/gallery/${context.delivery.id}/logo`
            : null,
        favorites,
        files,
        mediaTypes: mediaTypesForFiles(files)
    });
});

app.get("/gallery/:folderId/logo", (req, res) => {
    const context = getPublicGallery(req, res);
    if (!context) return;
    const logoPath = galleryLogoPath(context.folderPath);
    if (!fs.existsSync(logoPath)) {
        return res.status(404).json({ error: "Imagen de marca no encontrada" });
    }
    res.set("Cache-Control", "private, max-age=3600");
    res.sendFile(logoPath, { dotfiles: "allow" });
});

app.get("/gallery/:folderId/previews/:filename", async (req, res) => {
    const context = getPublicGallery(req, res);
    if (!context) return;
    const sourcePath = photoPath(req.params.folderId, req.params.filename);
    const record = galleryFileRecord(context.folderPath, req.params.filename);
    if (!sourcePath || !record) {
        return res.status(404).json({ error: "Fotografía no encontrada" });
    }
    if (isVideoFilename(req.params.filename)) {
        return res.status(404).json({ error: "Los vídeos no tienen miniatura estática" });
    }

    try {
        let targetPath = previewPath(
            context.folderPath,
            req.params.filename
        );
        if (!fs.existsSync(targetPath) && record.objectKey) {
            if (!galleryStorage.enabled) {
                throw new Error("R2 de galerías no está disponible");
            }
            res.set("Cache-Control", "private, max-age=300");
            return res.redirect(
                await galleryStorage.inlineUrl(record.objectKey, record.name)
            );
        }
        if (!fs.existsSync(targetPath)) {
            targetPath = await createPreview(
                context.folderPath,
                req.params.filename
            );
        }
        res.set("Cache-Control", "private, max-age=86400");
        res.sendFile(targetPath, { dotfiles: "allow" });
    } catch (processingError) {
        console.error(processingError);
        if (record.objectKey && galleryStorage.enabled) {
            res.set("Cache-Control", "private, max-age=300");
            return res.redirect(
                await galleryStorage.inlineUrl(record.objectKey, record.name)
            );
        }
        res.set("Cache-Control", "private, max-age=300");
        res.sendFile(sourcePath, { dotfiles: "allow" });
    }
});

app.get("/gallery/:folderId/photos/:filename", async (req, res) => {
    const context = getPublicGallery(req, res);
    if (!context) return;
    const targetPath = photoPath(req.params.folderId, req.params.filename);
    const record = galleryFileRecord(context.folderPath, req.params.filename);

    if (!targetPath || !record) {
        return res.status(404).json({ error: "Fotografía no encontrada" });
    }

    res.set("Cache-Control", "private, max-age=3600");
    if (record.objectKey) {
        if (!galleryStorage.enabled) {
            return res.status(503).json({
                error: "El almacenamiento de la galería no está disponible"
            });
        }
        recordUsage(context.delivery.ownerId, "downloaded_bytes", record.size);
        return res.redirect(
            await galleryStorage.inlineUrl(record.objectKey, record.name)
        );
    }
    res.sendFile(targetPath, { dotfiles: "allow" });
});

app.get("/gallery/:folderId/photos/:filename/download", async (req, res) => {
    const context = getPublicGallery(req, res);
    if (!context) return;
    if (!context.delivery.allowOriginalDownload) {
        return res.status(403).json({
            error: "La descarga en calidad original está desactivada"
        });
    }

    const targetPath = photoPath(req.params.folderId, req.params.filename);
    const record = galleryFileRecord(context.folderPath, req.params.filename);
    if (!targetPath || !record) {
        return res.status(404).json({ error: "Fotografía no encontrada" });
    }

    deliveryStore.logActivity(context.delivery.id, "download_photo_original", {
        filename: req.params.filename
    });
    if (record.objectKey) {
        if (!galleryStorage.enabled) {
            return res.status(503).json({
                error: "El almacenamiento de la galería no está disponible"
            });
        }
        recordUsage(context.delivery.ownerId, "downloaded_bytes", record.size);
        return res.redirect(
            await galleryStorage.downloadUrl(record.objectKey, record.name)
        );
    }
    recordUsage(context.delivery.ownerId, "downloaded_bytes", fs.statSync(targetPath).size);
    res.download(targetPath, req.params.filename);
});

app.get("/gallery/:folderId/photos/:filename/download/web", async (req, res) => {
    const context = getPublicGallery(req, res);
    if (!context) return;
    if (!context.delivery.allowWebDownload) {
        return res.status(403).json({
            error: "La descarga en calidad web está desactivada"
        });
    }
    const sourcePath = photoPath(req.params.folderId, req.params.filename);
    const record = galleryFileRecord(context.folderPath, req.params.filename);
    if (!sourcePath || !record) {
        return res.status(404).json({ error: "Fotografía no encontrada" });
    }
    if (isVideoFilename(req.params.filename)) {
        return res.status(400).json({
            error: "La calidad reducida solo está disponible para fotografías"
        });
    }
    try {
        const targetPath = record.objectKey
            ? previewPath(context.folderPath, req.params.filename)
            : await createPreview(context.folderPath, req.params.filename);
        if (!fs.existsSync(targetPath)) {
            throw new Error("La calidad reducida no está disponible");
        }
        deliveryStore.logActivity(context.delivery.id, "download_photo_web", {
            filename: req.params.filename
        });
        recordUsage(context.delivery.ownerId, "downloaded_bytes", fs.statSync(targetPath).size);
        res.download(
            targetPath,
            webPhotoName(req.params.filename),
            { dotfiles: "allow" }
        );
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "No se pudo preparar la calidad reducida" });
    }
});

app.post("/gallery/:folderId/favorites", requireSameOrigin, (req, res) => {
    const context = getPublicGallery(req, res);
    if (!context) return;
    if (!context.delivery.favoritesEnabled) {
        return res.status(403).json({ error: "La selección está desactivada" });
    }
    const selection = deliveryStore.getSelectionSettings(context.delivery.id);
    if (selection.status === "submitted") {
        return res.status(409).json({ error: "La selección final ya fue enviada" });
    }

    const filename = req.body?.filename;
    const targetPath = photoPath(req.params.folderId, filename);
    if (!targetPath || !galleryFileRecord(context.folderPath, filename)) {
        return res.status(404).json({ error: "Fotografía no encontrada" });
    }
    const currentFavorites = deliveryStore.listFavorites(context.delivery.id);
    if (selection.selectionLimit > 0
        && currentFavorites.length >= selection.selectionLimit) {
        return res.status(409).json({
            error: `Puedes seleccionar un máximo de ${selection.selectionLimit} fotografías`,
            code: "SELECTION_LIMIT_REACHED"
        });
    }

    deliveryStore.addFavorite(
        context.delivery.id, filename, new Date().toISOString()
    );
    deliveryStore.logActivity(context.delivery.id, "favorite_added", { filename });
    res.status(201).json({ favorite: true });
});

app.delete("/gallery/:folderId/favorites/:filename", requireSameOrigin, (req, res) => {
    const context = getPublicGallery(req, res);
    if (!context) return;
    if (!context.delivery.favoritesEnabled) {
        return res.status(403).json({ error: "La selección está desactivada" });
    }
    const selection = deliveryStore.getSelectionSettings(context.delivery.id);
    if (selection.status === "submitted") {
        return res.status(409).json({ error: "La selección final ya fue enviada" });
    }

    deliveryStore.deleteFavorite(context.delivery.id, req.params.filename);
    deliveryStore.logActivity(context.delivery.id, "favorite_removed", {
        filename: req.params.filename
    });
    res.json({ favorite: false });
});

app.put("/gallery/:folderId/favorites/:filename/comment", requireSameOrigin, (req, res) => {
    const context = getPublicGallery(req, res);
    if (!context) return;
    const selection = deliveryStore.getSelectionSettings(context.delivery.id);
    if (selection.status === "submitted") {
        return res.status(409).json({ error: "La selección final ya fue enviada" });
    }
    const filename = req.params.filename;
    if (!deliveryStore.listFavorites(context.delivery.id)
        .some((favorite) => favorite.filename === filename)) {
        return res.status(400).json({ error: "Selecciona la fotografía antes de comentarla" });
    }
    const comment = typeof req.body?.comment === "string"
        ? req.body.comment.trim()
        : "";
    if (comment.length > 500) {
        return res.status(400).json({ error: "El comentario no puede superar 500 caracteres" });
    }
    const now = new Date().toISOString();
    deliveryStore.saveFavoriteComment(
        context.delivery.id, filename, comment, now
    );
    deliveryStore.logActivity(context.delivery.id, "selection_comment", {
        filename
    });
    res.json({ filename, comment, updatedAt: now });
});

app.post("/gallery/:folderId/selection/submit", requireSameOrigin, (req, res) => {
    const context = getPublicGallery(req, res);
    if (!context) return;
    const current = deliveryStore.getSelectionSettings(context.delivery.id);
    if (current.status === "submitted") {
        return res.status(409).json({ error: "La selección ya fue enviada" });
    }
    const favorites = deliveryStore.listFavorites(context.delivery.id);
    if (!favorites.length) {
        return res.status(400).json({ error: "Selecciona al menos una fotografía" });
    }
    const clientName = typeof req.body?.clientName === "string"
        ? req.body.clientName.trim()
        : "";
    const clientEmail = normalizeEmail(req.body?.clientEmail);
    if (!clientName || clientName.length > 80) {
        return res.status(400).json({ error: "Escribe tu nombre" });
    }
    if (clientEmail && !validEmail(clientEmail)) {
        return res.status(400).json({ error: "El correo no es válido" });
    }
    const now = new Date().toISOString();
    const selection = deliveryStore.saveSelectionSettings({
        ...current,
        status: "submitted",
        clientName,
        clientEmail,
        submittedAt: now,
        updatedAt: now
    });
    deliveryStore.logActivity(context.delivery.id, "selection_submitted", {
        details: { count: favorites.length, clientName }
    });
    res.json({ selection, count: favorites.length });
});

app.post("/transfer/:transferId/unlock", requireSameOrigin, (req, res) => {
    const transfer = deliveryStore.getTransferAccess(req.params.transferId);
    const folderPath = transferFolderPath(req.params.transferId);
    const storageAvailable = transfer?.storageProvider === "r2"
        ? objectStorage.enabled && transfer.status === "ready"
        : folderPath && fs.existsSync(folderPath);
    if (!transfer || !storageAvailable) {
        return res.status(404).json({ error: "Transferencia no encontrada" });
    }
    if (Date.parse(transfer.expiresAt) <= Date.now()) {
        return res.status(410).json({ error: "Esta transferencia ha caducado" });
    }
    if (!transfer.hasPassword) return res.status(204).end();
    const rateKey = `transfer:${req.ip}:${transfer.id}`;
    if (isGalleryRateLimited(rateKey)) {
        return res.status(429).json({ error: "Demasiados intentos. Espera 15 minutos." });
    }
    if (typeof req.body?.password !== "string"
        || !verifyPassword(req.body.password, transfer.passwordSalt, transfer.passwordHash)) {
        recordGalleryFailure(rateKey);
        return res.status(401).json({ error: "Contraseña incorrecta" });
    }
    galleryAttempts.delete(rateKey);
    const now = Date.now();
    const session = createSessionToken();
    deliveryStore.createTransferSession({
        tokenHash: session.tokenHash,
        transferId: transfer.id,
        createdAt: now,
        expiresAt: now + GALLERY_SESSION_DURATION_MS
    });
    res.cookie(transferCookieName(transfer.id), session.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
        path: "/",
        maxAge: GALLERY_SESSION_DURATION_MS
    });
    res.status(204).end();
});

app.get("/transfer/:transferId", (req, res) => {
    const context = getPublicTransfer(req, res);
    if (!context) return;
    const files = context.transfer.storageProvider === "r2"
        ? deliveryStore.listTransferFiles(context.transfer.id)
            .filter((file) => file.status === "ready")
            .map((file) => ({ id: file.id, name: file.name, size: file.size }))
        : listTransferFiles(context.folderPath);
    const profile = deliveryStore.getBrandProfile(context.transfer.ownerId);
    const logoPath = profileLogoPath(context.transfer.ownerId);
    res.set("Cache-Control", "no-store");
    res.json({
        id: context.transfer.id,
        title: context.transfer.title,
        message: context.transfer.message,
        createdAt: context.transfer.createdAt,
        expiresAt: context.transfer.expiresAt,
        fileCount: context.transfer.fileCount,
        totalBytes: context.transfer.totalBytes,
        files,
        brandName: profile.brandName || "Straclase",
        accentColor: profile.accentColor || "#c9aa70",
        backgroundColor: profile.backgroundColor || "#ffffff",
        hasLogo: fs.existsSync(logoPath),
        logoUrl: fs.existsSync(logoPath)
            ? `/transfer/${context.transfer.id}/logo`
            : null
    });
});

app.get("/transfer/:transferId/logo", (req, res) => {
    const context = getPublicTransfer(req, res);
    if (!context) return;
    const logoPath = profileLogoPath(context.transfer.ownerId);
    if (!fs.existsSync(logoPath)) return res.status(404).end();
    res.set("Cache-Control", "private, max-age=3600");
    res.sendFile(logoPath);
});

app.get("/transfer/:transferId/files/:filename/download", async (req, res) => {
    const context = getPublicTransfer(req, res);
    if (!context) return;
    if (context.transfer.storageProvider === "r2") {
        const file = deliveryStore.listTransferFiles(context.transfer.id)
            .find((item) => item.id === req.params.filename && item.status === "ready");
        if (!file) return res.status(404).json({ error: "Archivo no encontrado" });
        try {
            const url = await objectStorage.downloadUrl(file.objectKey, file.name);
            deliveryStore.recordTransferDownload(
                context.transfer.id, new Date().toISOString()
            );
            recordUsage(context.transfer.ownerId, "downloaded_bytes", file.size);
            res.set("Cache-Control", "private, no-store");
            return res.redirect(302, url);
        } catch (error) {
            console.error(error);
            return res.status(502).json({ error: "No se pudo preparar la descarga" });
        }
    }
    const targetPath = transferFilePath(req.params.transferId, req.params.filename);
    if (!targetPath || !fs.existsSync(targetPath)) {
        return res.status(404).json({ error: "Archivo no encontrado" });
    }
    deliveryStore.recordTransferDownload(
        context.transfer.id, new Date().toISOString()
    );
    const localSize = fs.statSync(targetPath).size;
    recordUsage(context.transfer.ownerId, "downloaded_bytes", localSize);
    res.set("Cache-Control", "private, no-store");
    res.download(targetPath, req.params.filename);
});

async function transferZipStatusResponse(context, res, { start = false } = {}) {
    let result;
    if (context.transfer.storageProvider === "r2" && !start) {
        const job = deliveryStore.getTransferZipJob(context.transfer.id);
        if (!job) {
            return res.status(404).json({
                error: "El ZIP todavía no se ha solicitado", code: "ZIP_NOT_STARTED"
            });
        }
        if (job.status === "failed") {
            return res.status(409).json({
                error: "No se pudo preparar el ZIP. Pulsa de nuevo para reintentarlo",
                code: job.errorCode || "ZIP_BUILD_FAILED"
            });
        }
        result = job.status === "ready"
            ? { ok: true, state: "ready", job }
            : prepareTransferZip(context.transfer);
    } else {
        result = prepareTransferZip(context.transfer);
    }
    if (!result.ok) {
        return res.status(result.status).json({
            error: quotaMessage(result.code), code: result.code
        });
    }
    if (result.state === "local") {
        return res.json({ status: "ready", url: `/transfer/${context.transfer.id}/download` });
    }
    if (result.state !== "ready") {
        return res.status(202).json({ status: "building" });
    }
    try {
        const url = await objectStorage.downloadUrl(
            result.job.objectKey, transferZipObjectName(context.transfer)
        );
        deliveryStore.recordTransferDownload(context.transfer.id, new Date().toISOString());
        recordUsage(context.transfer.ownerId, "downloaded_bytes", result.job.size);
        return res.json({ status: "ready", url, size: result.job.size });
    } catch (error) {
        console.error(error);
        recordUsage(context.transfer.ownerId, "errors", 1);
        return res.status(502).json({ error: "No se pudo preparar la descarga" });
    }
}

app.post("/transfer/:transferId/zip", requireSameOrigin, async (req, res) => {
    const context = getPublicTransfer(req, res);
    if (!context) return;
    return transferZipStatusResponse(context, res, { start: true });
});

app.get("/transfer/:transferId/zip", async (req, res) => {
    const context = getPublicTransfer(req, res);
    if (!context) return;
    return transferZipStatusResponse(context, res);
});

app.get("/transfer/:transferId/download", async (req, res) => {
    const context = getPublicTransfer(req, res);
    if (!context) return;
    if (!economicConfig.zipEnabled) {
        return res.status(503).json({
            error: "La descarga ZIP está pausada. Puedes descargar los archivos individualmente",
            code: "ZIP_PAUSED"
        });
    }
    if (context.transfer.storageProvider === "r2") {
        const result = prepareTransferZip(context.transfer);
        if (!result.ok) {
            return res.status(result.status).json({
                error: quotaMessage(result.code), code: result.code
            });
        }
        if (result.state !== "ready") {
            return res.status(202).json({
                status: "building",
                error: "El ZIP se está preparando"
            });
        }
        try {
            const url = await objectStorage.downloadUrl(
                result.job.objectKey, transferZipObjectName(context.transfer)
            );
            deliveryStore.recordTransferDownload(context.transfer.id, new Date().toISOString());
            recordUsage(context.transfer.ownerId, "downloaded_bytes", result.job.size);
            res.set("Cache-Control", "private, no-store");
            return res.redirect(302, url);
        } catch (error) {
            console.error(error);
            recordUsage(context.transfer.ownerId, "errors", 1);
            return res.status(502).json({ error: "No se pudo preparar la descarga" });
        }
    }
    const files = context.transfer.storageProvider === "r2"
        ? deliveryStore.listTransferFiles(context.transfer.id)
            .filter((file) => file.status === "ready")
        : listTransferFiles(context.folderPath);
    if (!files.length) return res.status(404).json({ error: "No hay archivos" });
    const planLimit = economicPlanLimits(ownerPlan(context.transfer.ownerId));
    if (context.transfer.totalBytes > planLimit.zipMaxBytes) {
        return res.status(403).json({
            error: quotaMessage("PLAN_ZIP_SIZE_LIMIT"), code: "PLAN_ZIP_SIZE_LIMIT"
        });
    }
    const release = zipConcurrency.tryAcquire(context.transfer.ownerId, {
        globalLimit: economicConfig.globalConcurrentZips,
        accountLimit: economicConfig.accountConcurrentZips
    });
    if (!release) {
        return res.status(429).json({
            error: quotaMessage("GLOBAL_ZIP_CONCURRENCY_LIMIT"),
            code: "GLOBAL_ZIP_CONCURRENCY_LIMIT"
        });
    }
    const reservation = reserveEphemeralZip(
        context.transfer.ownerId, context.transfer.totalBytes
    );
    if (!reservation.ok) {
        release();
        return res.status(reservation.status).json({
            error: quotaMessage(reservation.code), code: reservation.code
        });
    }
    deliveryStore.recordTransferDownload(
        context.transfer.id, new Date().toISOString()
    );
    res.attachment(`Straclase-${safeDownloadName(context.transfer.title)}.zip`);
    const archive = new ZipArchive({ store: true });
    let released = false;
    const releaseOnce = () => {
        if (released) return;
        released = true;
        release();
    };
    res.once("close", releaseOnce);
    res.once("finish", releaseOnce);
    archive.on("error", (error) => {
        console.error(error);
        if (!res.destroyed) res.destroy(error);
    });
    archive.pipe(res);
    try {
        for (const file of files) {
            if (context.transfer.storageProvider === "r2") {
                const stream = await objectStorage.getObjectStream(file.objectKey);
                archive.append(stream, { name: file.name });
            } else {
                archive.file(path.join(context.folderPath, file.name), { name: file.name });
            }
        }
    } catch (error) {
        console.error(error);
        return res.destroy(error);
    }
    archive.finalize().catch((error) => {
        console.error(error);
        if (!res.destroyed) res.destroy(error);
    });
    recordUsage(context.transfer.ownerId, "downloaded_bytes", context.transfer.totalBytes);
});

app.get("/t/:transferId", (req, res) => {
    const folderPath = transferFolderPath(req.params.transferId);
    const transfer = deliveryStore.getTransfer(req.params.transferId);
    const storageAvailable = transfer?.storageProvider === "r2"
        ? objectStorage.enabled && transfer.status === "ready"
        : folderPath && fs.existsSync(folderPath);
    if (!transfer || !storageAvailable) {
        return res.status(404).send("Transferencia no encontrada");
    }
    res.sendFile(path.join(publicDirectory, "transfer.html"));
});

app.get("/s/:folderId", (req, res) => {
    const folderPath = galleryFolderPath(req.params.folderId);
    const delivery = deliveryStore.getDelivery(req.params.folderId);

    if (!folderPath || !delivery || !fs.existsSync(folderPath)) {
        return res.status(404).send("Galería no encontrada");
    }
    const photographerSession = getSessionFromRequest(req);
    if (delivery.status !== "published"
        && photographerSession?.userId !== delivery.ownerId) {
        return res.status(404).send("Galería no encontrada");
    }

    res.sendFile(path.join(publicDirectory, "gallery.html"));
});

app.use((req, res) => {
    if (req.accepts("html")) {
        return res.status(404).type("html").send(
            "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><meta name=\"theme-color\" content=\"#171715\"><title>No encontrado · Straclase</title><link rel=\"icon\" href=\"/assets/straclase-favicon.svg\" type=\"image/svg+xml\"><link rel=\"stylesheet\" href=\"/legal.css?v=20260910-1\"></head><body><article><h1>Página no encontrada</h1><p>No hemos encontrado la dirección que buscas.</p><a href=\"/\">Volver a Straclase</a></article></body></html>"
        );
    }
    res.status(404).json({ error: "Ruta no encontrada" });
});

app.use((error, req, res, next) => {
    console.error(`[${req.requestId}]`, error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        error: "Error interno del servidor",
        requestId: req.requestId
    });
});

const server = app.listen(PORT, () => {
    console.log(`Straclase iniciado en ${process.env.PHOCLOUD_PUBLIC_URL || `http://localhost:${PORT}`}`);
    automaticBackups.start();
    migrateLocalGalleriesToR2().catch((error) => {
        console.error("No se pudo completar la migración de galerías a R2", error);
    });
    resumeTransferConversions();
});

server.requestTimeout = Number(process.env.PHOCLOUD_REQUEST_TIMEOUT_MS)
    || 24 * 60 * 60 * 1000;
server.headersTimeout = 60 * 1000;
server.keepAliveTimeout = 5 * 1000;

const cleanupTimer = setInterval(() => {
    const now = Date.now();
    deliveryStore.deleteExpiredSessions(now);
    deliveryStore.deleteExpiredGallerySessions(now);
    deliveryStore.deleteExpiredAccountTokens(now);
    deliveryStore.deleteExpiredTransferSessions(now);
    deliveryStore.deleteExpiredGuestUploadSessions(now);
    deliveryStore.deleteExpiredTransferSenderVerifications(now);
    cleanupExpiredTransfers().catch(console.error);
    deliveryStore.deleteOldAnalyticsEvents(now - 180 * 24 * 60 * 60 * 1000);
    for (const attempts of [
        loginAttempts, galleryAttempts, sensitiveActionAttempts, analyticsAttempts
    ]) {
        for (const [key, value] of attempts) {
            if (value.resetAt <= now) attempts.delete(key);
        }
    }
}, 15 * 60 * 1000);
cleanupTimer.unref();

let shuttingDown = false;

function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(cleanupTimer);
    automaticBackups.stop();

    server.close(() => {
        deliveryStore.close();
        process.exit(0);
    });

    setTimeout(() => {
        server.closeAllConnections();
    }, 1000).unref();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
