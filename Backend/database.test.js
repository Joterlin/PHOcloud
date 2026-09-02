const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createDeliveryStore } = require("./database");

function createTestEnvironment() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phocloud-test-"));
    const uploadsDirectory = path.join(root, "uploads");
    const databasePath = path.join(root, "phocloud.db");

    fs.mkdirSync(uploadsDirectory, { recursive: true });

    return { root, uploadsDirectory, databasePath };
}

test("crea, consulta y elimina entregas", () => {
    const environment = createTestEnvironment();
    const store = createDeliveryStore(environment);
    const ownerId = store.createUser({
        username: "propietario",
        passwordHash: "hash",
        passwordSalt: "salt",
        createdAt: "2026-08-26T09:00:00.000Z"
    });
    const delivery = {
        id: "00000000-0000-4000-8000-000000000001",
        clientName: "Cliente de prueba",
        createdAt: "2026-08-26T10:00:00.000Z",
        photoCount: 3,
        ownerId
    };

    try {
        store.createDelivery(delivery);

        assert.deepEqual(
            { ...store.getDelivery(delivery.id) },
            {
                ...delivery,
                message: "",
                expiresAt: null,
                allowIndividualDownload: true,
                allowZipDownload: true,
                allowOriginalDownload: true,
                allowWebDownload: true,
                favoritesEnabled: true,
                brandName: "",
                accentColor: "#c9aa70",
                backgroundColor: "#ffffff",
                websiteUrl: "",
                instagramUrl: "",
                facebookUrl: "",
                tiktokUrl: "",
                socialLinks: [],
                galleryStyle: "masonry",
                coverFilename: null,
                coverStyle: "immersive",
                coverPositionX: 50,
                coverPositionY: 50,
                logoScale: 100,
                logoPositionX: 50,
                logoPositionY: 50,
                clientEmail: "",
                status: "published",
                viewingEnabled: true,
                publishedAt: null,
                lastSentAt: null,
                updatedAt: delivery.createdAt,
                hasPassword: false
            }
        );
        assert.equal(store.listDeliveries(ownerId).length, 1);
        assert.equal(store.deleteDelivery(delivery.id, ownerId + 1), false);
        assert.equal(store.deleteDelivery(delivery.id, ownerId), true);
        assert.equal(store.listDeliveries(ownerId).length, 0);
    } finally {
        store.close();
        fs.rmSync(environment.root, { recursive: true, force: true });
    }
});

test("importa una galería antigua desde metadata.json", () => {
    const environment = createTestEnvironment();
    const galleryId = "00000000-0000-4000-8000-000000000002";
    const galleryPath = path.join(environment.uploadsDirectory, galleryId);

    fs.mkdirSync(galleryPath, { recursive: true });
    fs.writeFileSync(
        path.join(galleryPath, "metadata.json"),
        JSON.stringify({
            clientName: "Cliente antiguo",
            createdAt: "2026-08-20T09:00:00.000Z"
        }),
        "utf8"
    );
    fs.writeFileSync(path.join(galleryPath, "foto-1.jpg"), "prueba", "utf8");

    const store = createDeliveryStore(environment);

    try {
        const delivery = store.getDelivery(galleryId);

        assert.equal(delivery.clientName, "Cliente antiguo");
        assert.equal(delivery.createdAt, "2026-08-20T09:00:00.000Z");
        assert.equal(delivery.photoCount, 1);
    } finally {
        store.close();
        fs.rmSync(environment.root, { recursive: true, force: true });
    }
});

test("guarda usuarios y sesiones con expiración", () => {
    const environment = createTestEnvironment();
    const store = createDeliveryStore(environment);
    const now = Date.now();

    try {
        assert.equal(store.hasUsers(), false);

        const userId = store.createUser({
            username: "fotografo",
            email: "foto@example.com",
            displayName: "Foto Estudio",
            passwordHash: "hash-de-prueba",
            passwordSalt: "salt-de-prueba",
            termsAcceptedAt: "2026-08-26T10:00:00.000Z",
            createdAt: "2026-08-26T10:00:00.000Z"
        });

        assert.equal(store.hasUsers(), true);
        assert.equal(store.getUserByUsername("FOTOGRAFO").id, userId);
        assert.equal(store.getUserByIdentifier("FOTO@example.com").id, userId);
        assert.equal(store.getUserById(userId).plan, "free");
        assert.equal(Boolean(store.getUserById(userId).termsAcceptedAt), true);

        const legacyEmailUsernameId = store.createUser({
            username: "legacy@example.com",
            passwordHash: "hash-antiguo",
            passwordSalt: "salt-antiguo",
            createdAt: "2026-08-26T10:10:00.000Z"
        });
        assert.equal(
            store.getUserByIdentifier("legacy@example.com").id,
            legacyEmailUsernameId
        );

        store.upsertBrandProfile({
            userId,
            brandName: "Estudio Prueba",
            accentColor: "#bb9955",
            backgroundColor: "#101010",
            websiteUrl: "https://example.com/",
            instagramUrl: "https://instagram.com/example",
            facebookUrl: "",
            tiktokUrl: "",
            updatedAt: "2026-08-27T10:00:00.000Z"
        });
        assert.equal(
            store.getBrandProfile(userId).brandName,
            "Estudio Prueba"
        );
        assert.deepEqual(store.getBrandProfile(userId).socialLinks, [
            { label: "Web", url: "https://example.com/" },
            { label: "Instagram", url: "https://instagram.com/example" }
        ]);

        store.createSession({
            tokenHash: "token-vigente",
            userId,
            createdAt: now,
            expiresAt: now + 60_000
        });
        store.createSession({
            tokenHash: "token-expirado",
            userId,
            createdAt: now - 120_000,
            expiresAt: now - 60_000
        });

        assert.equal(store.getSession("token-vigente", now).username, "fotografo");
        assert.equal(store.getSession("token-expirado", now), null);
        assert.equal(store.deleteExpiredSessions(now), 1);
        assert.equal(store.deleteSession("token-vigente"), true);

        store.createAccountToken({
            tokenHash: "token-verificacion",
            userId,
            purpose: "verify_email",
            createdAt: now,
            expiresAt: now + 60_000
        });
        assert.equal(
            store.getAccountToken("token-verificacion", "verify_email", now).userId,
            userId
        );
        store.markEmailVerified(userId, "2026-08-27T12:00:00.000Z");
        assert.equal(Boolean(store.getUserById(userId).emailVerifiedAt), true);
        assert.equal(store.deleteAccountToken("token-verificacion"), true);
    } finally {
        store.close();
        fs.rmSync(environment.root, { recursive: true, force: true });
    }
});

test("guarda privacidad, sesiones de galería y favoritas", () => {
    const environment = createTestEnvironment();
    const store = createDeliveryStore(environment);
    const deliveryId = "00000000-0000-4000-8000-000000000003";
    const now = Date.now();

    try {
        store.createDelivery({
            id: deliveryId,
            clientName: "Cliente privado",
            createdAt: "2026-08-27T10:00:00.000Z",
            updatedAt: "2026-08-27T10:00:00.000Z",
            photoCount: 2,
            message: "Una entrega especial",
            expiresAt: "2026-09-27T10:00:00.000Z",
            passwordHash: "hash-galeria",
            passwordSalt: "salt-galeria",
            allowIndividualDownload: false,
            allowZipDownload: true,
            favoritesEnabled: true,
            clientEmail: "cliente@example.com",
            status: "draft"
        });

        const delivery = store.getDelivery(deliveryId);
        assert.equal(delivery.hasPassword, true);
        assert.equal(delivery.allowIndividualDownload, false);
        assert.equal(delivery.message, "Una entrega especial");
        assert.equal(delivery.clientEmail, "cliente@example.com");
        assert.equal(delivery.status, "draft");

        store.createGallerySession({
            tokenHash: "token-galeria",
            deliveryId,
            createdAt: now,
            expiresAt: now + 60_000
        });
        assert.equal(
            store.getGallerySession("token-galeria", deliveryId, now).deliveryId,
            deliveryId
        );

        assert.equal(
            store.addFavorite(deliveryId, "foto-1.jpg", "2026-08-27T10:05:00.000Z"),
            true
        );
        assert.equal(store.listFavorites(deliveryId)[0].filename, "foto-1.jpg");
        assert.equal(store.deleteFavorite(deliveryId, "foto-1.jpg"), true);

        store.updateDelivery({
            ...store.getDeliveryAccess(deliveryId),
            clientName: "Cliente editado",
            message: "",
            expiresAt: null,
            passwordHash: null,
            passwordSalt: null,
            allowIndividualDownload: true,
            allowZipDownload: false,
            favoritesEnabled: false,
            updatedAt: "2026-08-27T11:00:00.000Z"
        });
        assert.equal(store.getDelivery(deliveryId).clientName, "Cliente editado");
        assert.equal(store.getDelivery(deliveryId).hasPassword, false);
        assert.equal(store.getDelivery(deliveryId).allowZipDownload, false);
    } finally {
        store.close();
        fs.rmSync(environment.root, { recursive: true, force: true });
    }
});

test("controla archivos multipart y publica la transferencia al completarlos", () => {
    const environment = createTestEnvironment();
    const store = createDeliveryStore(environment);
    const transferId = "00000000-0000-4000-8000-000000000010";
    const fileId = "00000000-0000-4000-8000-000000000011";
    try {
        const ownerId = store.createUser({
            username: "multipart",
            passwordHash: "hash",
            passwordSalt: "salt",
            createdAt: "2026-09-01T10:00:00.000Z"
        });
        store.createTransfer({
            id: transferId,
            ownerId,
            title: "Material RAW",
            createdAt: "2026-09-01T10:00:00.000Z",
            expiresAt: "2026-09-02T10:00:00.000Z",
            fileCount: 1,
            totalBytes: 1024,
            status: "uploading",
            storageProvider: "r2"
        });
        store.createTransferFiles([{
            id: fileId,
            transferId,
            name: "sesion.raw",
            size: 1024,
            mimeType: "application/octet-stream",
            createdAt: "2026-09-01T10:00:00.000Z"
        }]);

        assert.equal(store.getTransfer(transferId).status, "uploading");
        assert.equal(store.transferHasPendingFiles(transferId), true);
        assert.equal(
            store.markTransferFileStarted(fileId, transferId, "transfers/key", "upload-id"),
            true
        );
        assert.equal(
            store.getOwnedTransferFile(fileId, transferId, ownerId).multipartUploadId,
            "upload-id"
        );
        assert.equal(store.markTransferFileReady(fileId, transferId), true);
        assert.equal(store.transferHasPendingFiles(transferId), false);
        assert.equal(
            store.markTransferReady(
                transferId, ownerId, "2026-09-02T11:00:00.000Z"
            ),
            true
        );
        assert.equal(store.getTransfer(transferId).status, "ready");
        assert.equal(store.getTransfer(transferId).storageProvider, "r2");
    } finally {
        store.close();
        fs.rmSync(environment.root, { recursive: true, force: true });
    }
});
