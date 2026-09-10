const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createDeliveryStore } = require("./database");

function environment() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phocloud-economic-"));
    const uploadsDirectory = path.join(root, "uploads");
    fs.mkdirSync(uploadsDirectory, { recursive: true });
    return { root, uploadsDirectory, databasePath: path.join(root, "phocloud.db") };
}

function limits(overrides = {}) {
    return {
        transferMaxBytes: 1000,
        accountStorageBytes: 1000,
        accountMonthlyUploadBytes: 1000,
        accountConcurrentUploads: 1,
        globalStorageBytes: 2000,
        globalMonthlyUploadBytes: 2000,
        globalConcurrentUploads: 2,
        globalMonthlyDownloadBytes: 5000,
        globalMonthlyErrorLimit: 100,
        ...overrides
    };
}

function transfer(id, ownerId, bytes, status = "uploading") {
    return {
        id, ownerId, title: "Prueba económica", message: "", recipientEmail: "",
        createdAt: "2026-09-08T10:00:00.000Z",
        expiresAt: "2026-09-08T13:00:00.000Z",
        fileCount: 1, totalBytes: bytes, status, storageProvider: "r2"
    };
}

test("reserva cuota atómicamente, finaliza una vez y libera una cancelación", () => {
    const env = environment();
    const store = createDeliveryStore(env);
    try {
        const ownerId = store.createUser({
            username: "cuotas", passwordHash: "hash", passwordSalt: "salt",
            createdAt: "2026-09-08T09:00:00.000Z"
        });
        const first = transfer("00000000-0000-4000-8000-000000000101", ownerId, 600);
        assert.deepEqual(store.reserveTransferUpload({
            transfer: first, limits: limits(), nowIso: first.createdAt, period: "2026-09"
        }), { ok: true });
        assert.equal(store.reserveTransferUpload({
            transfer: transfer("00000000-0000-4000-8000-000000000102", ownerId, 100),
            limits: limits(), nowIso: first.createdAt, period: "2026-09"
        }).code, "ACCOUNT_UPLOAD_CONCURRENCY_LIMIT");

        assert.equal(store.finalizeTransferUpload(
            first.id, ownerId, "2026-09-09T10:00:00.000Z", "2026-09-08T10:10:00.000Z"
        ), true);
        assert.equal(store.finalizeTransferUpload(
            first.id, ownerId, "2026-09-09T10:00:00.000Z", "2026-09-08T10:11:00.000Z"
        ), true);
        let usage = store.getEconomicUsage(ownerId, "2026-09", "2026-09-08T10:12:00.000Z");
        assert.equal(usage.counters.uploaded_bytes, 600);
        assert.equal(usage.counters.reserved_upload_bytes || 0, 0);

        const second = transfer("00000000-0000-4000-8000-000000000102", ownerId, 500);
        assert.equal(store.reserveTransferUpload({
            transfer: second, limits: limits({ accountStorageBytes: 2000 }),
            nowIso: second.createdAt, period: "2026-09"
        }).code, "PLAN_MONTHLY_UPLOAD_LIMIT");

        const pending = transfer("00000000-0000-4000-8000-000000000103", ownerId, 300);
        assert.equal(store.reserveTransferUpload({
            transfer: pending, limits: limits(), nowIso: pending.createdAt, period: "2026-09"
        }).ok, true);
        assert.equal(store.deleteTransfer(pending.id, ownerId), true);
        usage = store.getEconomicUsage(ownerId, "2026-09", "2026-09-08T10:12:00.000Z");
        assert.equal(usage.counters.reserved_upload_bytes || 0, 0);
    } finally {
        store.close();
        fs.rmSync(env.root, { recursive: true, force: true });
    }
});

test("reclama una transferencia invitada sin duplicar métricas globales", () => {
    const env = environment();
    const store = createDeliveryStore(env);
    try {
        const guestId = store.createGuestUser({
            username: "guest_reclamable", passwordHash: "hash",
            passwordSalt: "salt", createdAt: "2026-09-08T09:00:00.000Z"
        });
        const ownerId = store.createUser({
            username: "cuenta_reclamante", passwordHash: "hash",
            passwordSalt: "salt", createdAt: "2026-09-08T09:00:00.000Z"
        });
        const item = transfer(
            "00000000-0000-4000-8000-000000000109", guestId, 400, "ready"
        );
        assert.equal(store.reserveTransferUpload({
            transfer: item, limits: limits(), nowIso: item.createdAt,
            period: "2026-09"
        }).ok, true);
        const globalBefore = store.getEconomicUsage(
            null, "2026-09", item.createdAt
        ).counters;
        assert.equal(store.claimGuestTransfer({
            id: item.id, guestOwnerId: guestId, newOwnerId: ownerId,
            limits: limits(), nowIso: "2026-09-08T10:05:00.000Z"
        }).ok, true);
        assert.equal(store.getOwnedTransfer(item.id, guestId), null);
        assert.equal(store.getOwnedTransfer(item.id, ownerId).id, item.id);
        assert.equal(
            store.getEconomicUsage(ownerId, "2026-09", item.createdAt)
                .counters.uploaded_bytes,
            400
        );
        assert.deepEqual(
            store.getEconomicUsage(null, "2026-09", item.createdAt).counters,
            globalBefore
        );
    } finally {
        store.close();
        fs.rmSync(env.root, { recursive: true, force: true });
    }
});

test("reserva ZIP, reutiliza el resultado y recupera trabajos obsoletos", () => {
    const env = environment();
    const store = createDeliveryStore(env);
    try {
        const ownerId = store.createUser({
            username: "zip", passwordHash: "hash", passwordSalt: "salt",
            createdAt: "2026-09-08T09:00:00.000Z"
        });
        const item = transfer("00000000-0000-4000-8000-000000000111", ownerId, 400, "ready");
        assert.equal(store.reserveTransferUpload({
            transfer: item, limits: limits(), nowIso: item.createdAt, period: "2026-09"
        }).ok, true);
        const zipLimits = {
            accountZipMaxBytes: 500,
            accountMonthlyZipJobs: 2,
            accountMonthlyZipBytes: 1000,
            accountConcurrentZips: 1,
            globalMonthlyZipJobs: 10,
            globalMonthlyZipBytes: 5000,
            globalConcurrentZips: 2,
            globalMonthlyErrorLimit: 100
        };
        const reservation = store.reserveTransferZip({
            transferId: item.id, ownerId, objectKey: "transfers/id/bundle.zip",
            expectedBytes: 400, period: "2026-09",
            nowIso: "2026-09-08T10:10:00.000Z",
            staleBeforeIso: "2026-09-08T09:10:00.000Z", limits: zipLimits
        });
        assert.equal(reservation.status, "building");
        assert.equal(store.completeTransferZip(
            item.id, 425, "2026-09-08T10:11:00.000Z"
        ), true);
        const reused = store.reserveTransferZip({
            transferId: item.id, ownerId, objectKey: "ignored", expectedBytes: 400,
            period: "2026-09", nowIso: "2026-09-08T10:12:00.000Z",
            staleBeforeIso: "2026-09-08T09:12:00.000Z", limits: zipLimits
        });
        assert.equal(reused.status, "ready");
        assert.equal(reused.job.size, 425);
        const usage = store.getEconomicUsage(
            ownerId, "2026-09", "2026-09-08T10:12:00.000Z"
        );
        assert.equal(usage.counters.zip_jobs_started, 1);
        assert.equal(usage.counters.zip_generated_bytes, 425);
        assert.equal(usage.readyZipBytes, 425);
        assert.equal(store.resetStaleZipJobs("2026-09-08T11:00:00.000Z"), 0);
    } finally {
        store.close();
        fs.rmSync(env.root, { recursive: true, force: true });
    }
});

test("la migración económica abre bases existentes sin perder transferencias", () => {
    const env = environment();
    let store = createDeliveryStore(env);
    const ownerId = store.createUser({
        username: "legacy-economic", passwordHash: "hash", passwordSalt: "salt",
        createdAt: "2026-09-08T09:00:00.000Z"
    });
    const item = transfer("00000000-0000-4000-8000-000000000121", ownerId, 25, "ready");
    store.createTransfer(item);
    store.close();
    store = createDeliveryStore(env);
    try {
        assert.equal(store.getTransfer(item.id).title, item.title);
        assert.equal(
            store.listExpiredTransfers("2026-09-09T00:00:00.000Z")[0].storageProvider,
            "r2"
        );
        assert.deepEqual(store.getEconomicUsage(ownerId, "2026-09").counters, {});
    } finally {
        store.close();
        fs.rmSync(env.root, { recursive: true, force: true });
    }
});
