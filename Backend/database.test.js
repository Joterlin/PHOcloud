const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
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

test("migra la marca histórica de cuentas y galerías existentes a Straclase", () => {
    const environment = createTestEnvironment();
    let store = createDeliveryStore(environment);
    const ownerId = store.createUser({
        username: "marca-antigua",
        displayName: "The Real Gallery",
        passwordHash: "hash",
        passwordSalt: "salt",
        createdAt: "2026-09-09T10:00:00.000Z"
    });
    store.upsertBrandProfile({
        userId: ownerId,
        brandName: "PHOcloud",
        updatedAt: "2026-09-09T10:00:00.000Z"
    });
    store.createDelivery({
        id: "00000000-0000-4000-8000-000000000003",
        clientName: "Cliente existente",
        brandName: "Real Gallery",
        photoCount: 0,
        createdAt: "2026-09-09T10:00:00.000Z",
        ownerId
    });
    store.close();

    const database = new DatabaseSync(environment.databasePath);
    database.prepare(
        "DELETE FROM app_migrations WHERE name = 'straclase-brand-v1'"
    ).run();
    database.close();

    store = createDeliveryStore(environment);
    try {
        assert.equal(store.getUserById(ownerId).displayName, "Straclase");
        assert.equal(store.getBrandProfile(ownerId).brandName, "Straclase");
        assert.equal(
            store.getDelivery("00000000-0000-4000-8000-000000000003").brandName,
            "Straclase"
        );
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

        const guestId = store.createGuestUser({
            username: "guest_temporal",
            passwordHash: "hash-inaccesible",
            passwordSalt: "salt-inaccesible",
            createdAt: "2026-08-26T09:00:00.000Z"
        });
        store.createGuestUploadSession({
            tokenHash: "token-invitado",
            userId: guestId,
            createdAt: now,
            expiresAt: now + 60_000
        });
        assert.equal(store.hasUsers(), false);
        assert.equal(store.getUserById(guestId).isGuest, 1);
        assert.equal(store.getGuestUploadSession("token-invitado", now).userId, guestId);
        assert.equal(store.deleteOrphanGuestUsers(), 1);
        assert.equal(store.getGuestUploadSession("token-invitado", now), null);

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

        store.saveTransferSenderVerification({
            ownerId: userId,
            email: "remitente@example.com",
            codeHash: "hash-codigo",
            codeSalt: "salt-codigo",
            createdAt: now,
            expiresAt: now + 60_000
        });
        assert.equal(
            store.getTransferSenderVerification(
                userId, "REMITENTE@example.com"
            ).attempts,
            0
        );
        assert.equal(
            store.recordTransferSenderVerificationFailure(
                userId, "remitente@example.com", now, 5
            ),
            1
        );
        assert.equal(
            store.markTransferSenderVerified({
                ownerId: userId,
                email: "remitente@example.com",
                verifiedAt: now,
                expiresAt: now + 30 * 24 * 60 * 60 * 1000,
                now,
                maxAttempts: 5
            }),
            true
        );
        assert.equal(
            store.getTransferSenderVerification(
                userId, "remitente@example.com"
            ).verifiedAt,
            now
        );
    } finally {
        store.close();
        fs.rmSync(environment.root, { recursive: true, force: true });
    }
});

test("reserva conversiones de forma atómica, idempotente y recuperable", () => {
    const environment = createTestEnvironment();
    const store = createDeliveryStore(environment);
    try {
        const ownerId = store.createUser({
            username: "conversiones",
            passwordHash: "hash",
            passwordSalt: "salt",
            createdAt: "2026-09-09T09:00:00.000Z"
        });
        const transferId = "00000000-0000-4000-8000-000000000071";
        store.createTransfer({
            id: transferId,
            ownerId,
            title: "Material",
            createdAt: "2026-09-09T09:00:00.000Z",
            expiresAt: "2026-09-10T09:00:00.000Z",
            fileCount: 1,
            totalBytes: 1024,
            status: "ready",
            storageProvider: "local"
        });
        assert.equal(store.getTransfer(transferId).senderEmail, "");
        const job = {
            id: "00000000-0000-4000-8000-000000000072",
            ownerId,
            transferId,
            idempotencyKey: "conversion-idempotente-001",
            deliveryId: "00000000-0000-4000-8000-000000000073",
            selectedFiles: [{ sourceId: "foto.jpg", name: "foto.jpg", size: 1024 }],
            settings: { clientName: "Cliente" },
            expectedBytes: 1024,
            createdAt: "2026-09-09T09:01:00.000Z"
        };
        const limits = {
            galleryLimit: 3,
            galleryStorageBytes: 0,
            galleryStorageLimitBytes: 10_000,
            accountConcurrentConversions: 1,
            globalConcurrentConversions: 2
        };
        const reserved = store.reserveTransferConversion({ job, limits });
        assert.equal(reserved.ok, true);
        assert.equal(reserved.existing, false);
        assert.equal(store.hasActiveTransferConversion(transferId), true);

        const replay = store.reserveTransferConversion({
            job: { ...job, id: "00000000-0000-4000-8000-000000000074" },
            limits
        });
        assert.equal(replay.ok, true);
        assert.equal(replay.existing, true);
        assert.equal(replay.job.id, job.id);

        const second = store.reserveTransferConversion({
            job: {
                ...job,
                id: "00000000-0000-4000-8000-000000000075",
                idempotencyKey: "conversion-idempotente-002"
            },
            limits
        });
        assert.equal(second.ok, false);
        assert.equal(second.code, "ACCOUNT_CONVERSION_CONCURRENCY_LIMIT");

        assert.equal(store.claimTransferConversion(
            job.id, "2026-09-09T09:02:00.000Z"
        ), true);
        store.updateTransferConversionProgress(
            job.id, 512, "2026-09-09T09:03:00.000Z"
        );
        assert.equal(store.getTransferConversion(job.id).copiedBytes, 512);
        assert.equal(store.resetInterruptedTransferConversions(), 1);
        assert.equal(store.getTransferConversion(job.id).status, "pending");
        assert.equal(store.claimTransferConversion(
            job.id, "2026-09-09T09:04:00.000Z"
        ), true);
        assert.equal(store.completeTransferConversion(
            job.id, "2026-09-09T09:05:00.000Z"
        ), true);
        assert.equal(store.getTransferConversion(job.id).status, "ready");
        assert.equal(store.hasActiveTransferConversion(transferId), false);
        const retryableJob = {
            ...job,
            id: "00000000-0000-4000-8000-000000000076",
            idempotencyKey: "conversion-idempotente-003",
            deliveryId: "00000000-0000-4000-8000-000000000077"
        };
        assert.equal(store.reserveTransferConversion({
            job: retryableJob, limits
        }).ok, true);
        store.claimTransferConversion(
            retryableJob.id, "2026-09-09T09:06:00.000Z"
        );
        store.failTransferConversion(
            retryableJob.id, "R2_TEMPORARY_FAILURE",
            "2026-09-09T09:07:00.000Z"
        );
        const retried = store.retryTransferConversion({
            id: retryableJob.id,
            ownerId,
            updatedAt: "2026-09-09T09:08:00.000Z",
            limits
        });
        assert.equal(retried.ok, true);
        assert.equal(retried.job.status, "pending");
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
        assert.equal(store.touchTransferUpload(
            transferId, ownerId, "2026-09-02T12:00:00.000Z"
        ), true);
        assert.equal(
            store.getTransfer(transferId).expiresAt,
            "2026-09-02T12:00:00.000Z"
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

test("persiste la suscripción y evita procesar dos veces un webhook", () => {
    const environment = createTestEnvironment();
    const store = createDeliveryStore(environment);
    try {
        const userId = store.createUser({
            username: "facturacion",
            email: "billing@example.com",
            passwordHash: "hash",
            passwordSalt: "salt",
            createdAt: "2026-09-02T10:00:00.000Z"
        });
        assert.equal(store.updateUserBilling(userId, {
            customerId: "cus_test",
            subscriptionId: "sub_test",
            environment: "test",
            plan: "professional",
            planStatus: "active",
            currentPeriodEnd: "2026-10-02T10:00:00.000Z"
        }), true);
        const user = store.getUserByStripeCustomerId("cus_test");
        assert.equal(user.id, userId);
        assert.equal(user.plan, "professional");
        assert.equal(user.stripeEnvironment, "test");
        assert.equal(
            store.getUserByStripeSubscriptionId("sub_test").stripeCurrentPeriodEnd,
            "2026-10-02T10:00:00.000Z"
        );
        assert.equal(store.hasStripeEvent("evt_test"), false);
        assert.equal(store.markStripeEventProcessed(
            "evt_test", "checkout.session.completed", "2026-09-02T10:01:00.000Z"
        ), true);
        assert.equal(store.markStripeEventProcessed(
            "evt_test", "checkout.session.completed", "2026-09-02T10:02:00.000Z"
        ), false);
        assert.equal(store.hasStripeEvent("evt_test"), true);
        assert.equal(
            store.clearUserStripeBillingForEnvironment(userId, "live"),
            0
        );
        assert.equal(
            store.clearUserStripeBillingForEnvironment(userId, "test"),
            1
        );
        const migratedUser = store.getUserById(userId);
        assert.equal(migratedUser.plan, "free");
        assert.equal(migratedUser.stripeCustomerId, null);
        assert.equal(migratedUser.stripeSubscriptionId, null);
        assert.equal(migratedUser.stripeEnvironment, null);
    } finally {
        store.close();
        fs.rmSync(environment.root, { recursive: true, force: true });
    }
});

test("retira una sola vez las cuentas antiguas sin perder galerías ni Stripe", () => {
    const environment = createTestEnvironment();
    let store = createDeliveryStore(environment);
    const userId = store.createUser({
        username: "cuenta-antigua",
        email: "cuenta@example.com",
        displayName: "Cuenta Antigua",
        passwordHash: "hash-anterior",
        passwordSalt: "salt-anterior",
        emailVerifiedAt: "2026-09-01T10:00:00.000Z",
        createdAt: "2026-09-01T10:00:00.000Z"
    });
    store.createDelivery({
        id: "00000000-0000-4000-8000-000000000099",
        clientName: "Galería conservada",
        createdAt: "2026-09-01T11:00:00.000Z",
        photoCount: 1,
        ownerId: userId
    });
    store.updateUserBilling(userId, {
        customerId: "cus_preserved",
        subscriptionId: "sub_preserved",
        environment: "test",
        plan: "professional",
        planStatus: "active"
    });
    store.createSession({
        tokenHash: "sesion-anterior",
        userId,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000
    });
    store.close();

    const database = new DatabaseSync(environment.databasePath);
    database.prepare(
        "DELETE FROM application_migrations WHERE name = ?"
    ).run("email-only-auth-reset-v1");
    database.close();

    try {
        store = createDeliveryStore(environment);
        const retired = store.getUserByEmail("cuenta@example.com");
        assert.equal(store.hasUsers(), false);
        assert.equal(Boolean(retired.authDisabled), true);
        assert.equal(retired.emailVerifiedAt, null);
        assert.equal(retired.stripeCustomerId, "cus_preserved");
        assert.equal(retired.stripeSubscriptionId, "sub_preserved");
        assert.equal(store.getSession("sesion-anterior", Date.now()), null);
        assert.equal(store.getDelivery(
            "00000000-0000-4000-8000-000000000099"
        ).clientName, "Galería conservada");

        assert.equal(store.prepareUserRegistration(userId, {
            username: "account_reactivated",
            displayName: "Cuenta Nueva",
            passwordHash: "hash-nuevo",
            passwordSalt: "salt-nuevo",
            termsAcceptedAt: "2026-09-10T06:00:00.000Z"
        }), true);
        const reactivated = store.getUserByEmail("cuenta@example.com");
        assert.equal(store.hasUsers(), true);
        assert.equal(Boolean(reactivated.authDisabled), false);
        assert.equal(reactivated.displayName, "Cuenta Nueva");
        assert.equal(reactivated.stripeSubscriptionId, "sub_preserved");
    } finally {
        store?.close();
        fs.rmSync(environment.root, { recursive: true, force: true });
    }
});
