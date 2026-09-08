const GIB = 1024 ** 3;

const TECHNICAL_MAX_TRANSFER_BYTES = 50 * GIB;

const DEFAULT_PLAN_LIMITS = Object.freeze({
    free: Object.freeze({
        galleries: 3,
        galleryStorageBytes: 3 * GIB,
        transferMaxBytes: 5 * GIB,
        monthlyUploadBytes: 5 * GIB,
        transferStorageBytes: 5 * GIB,
        concurrentUploads: 1,
        zipMaxBytes: 1 * GIB,
        monthlyZipJobs: 2,
        monthlyZipBytes: 2 * GIB
    }),
    professional: Object.freeze({
        galleries: 25,
        galleryStorageBytes: 50 * GIB,
        transferMaxBytes: 25 * GIB,
        monthlyUploadBytes: 250 * GIB,
        transferStorageBytes: 50 * GIB,
        concurrentUploads: 2,
        zipMaxBytes: 5 * GIB,
        monthlyZipJobs: 50,
        monthlyZipBytes: 100 * GIB
    }),
    studio: Object.freeze({
        galleries: 100,
        galleryStorageBytes: 150 * GIB,
        transferMaxBytes: TECHNICAL_MAX_TRANSFER_BYTES,
        monthlyUploadBytes: 1024 * GIB,
        transferStorageBytes: 250 * GIB,
        concurrentUploads: 4,
        zipMaxBytes: 10 * GIB,
        monthlyZipJobs: 200,
        monthlyZipBytes: 500 * GIB
    })
});

function enabled(value, fallback = true) {
    if (value === undefined || value === null || value === "") return fallback;
    return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function positiveInteger(value, fallback, { minimum = 1, maximum = Number.MAX_SAFE_INTEGER } = {}) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
        return fallback;
    }
    return parsed;
}

function gibibytes(value, fallbackGiB, maximumGiB = 1024 * 1024) {
    const parsed = Number(value);
    const gib = Number.isFinite(parsed) && parsed > 0 && parsed <= maximumGiB
        ? parsed
        : fallbackGiB;
    return Math.floor(gib * GIB);
}

function createEconomicConfig(env = process.env) {
    const plan = (name, defaults) => ({
        ...defaults,
        transferMaxBytes: gibibytes(
            env[`PHOCLOUD_${name}_TRANSFER_MAX_GIB`],
            defaults.transferMaxBytes / GIB,
            TECHNICAL_MAX_TRANSFER_BYTES / GIB
        ),
        monthlyUploadBytes: gibibytes(
            env[`PHOCLOUD_${name}_MONTHLY_UPLOAD_GIB`],
            defaults.monthlyUploadBytes / GIB
        ),
        transferStorageBytes: gibibytes(
            env[`PHOCLOUD_${name}_TRANSFER_STORAGE_GIB`],
            defaults.transferStorageBytes / GIB
        ),
        concurrentUploads: positiveInteger(
            env[`PHOCLOUD_${name}_CONCURRENT_UPLOADS`], defaults.concurrentUploads,
            { maximum: 32 }
        ),
        zipMaxBytes: gibibytes(
            env[`PHOCLOUD_${name}_ZIP_MAX_GIB`],
            defaults.zipMaxBytes / GIB,
            TECHNICAL_MAX_TRANSFER_BYTES / GIB
        ),
        monthlyZipJobs: positiveInteger(
            env[`PHOCLOUD_${name}_MONTHLY_ZIP_JOBS`], defaults.monthlyZipJobs,
            { maximum: 100000 }
        ),
        monthlyZipBytes: gibibytes(
            env[`PHOCLOUD_${name}_MONTHLY_ZIP_GIB`],
            defaults.monthlyZipBytes / GIB
        )
    });

    return Object.freeze({
        acceptNewTransfers: enabled(env.PHOCLOUD_ACCEPT_NEW_TRANSFERS, true),
        zipEnabled: enabled(env.PHOCLOUD_ZIP_ENABLED, true),
        uploadLeaseMs: positiveInteger(
            env.PHOCLOUD_UPLOAD_LEASE_MINUTES, 180,
            { minimum: 15, maximum: 24 * 60 }
        ) * 60 * 1000,
        zipLeaseMs: positiveInteger(
            env.PHOCLOUD_ZIP_LEASE_MINUTES, 60,
            { minimum: 5, maximum: 24 * 60 }
        ) * 60 * 1000,
        globalConcurrentUploads: positiveInteger(
            env.PHOCLOUD_GLOBAL_CONCURRENT_UPLOADS, 8, { maximum: 1000 }
        ),
        globalConcurrentZips: positiveInteger(
            env.PHOCLOUD_GLOBAL_CONCURRENT_ZIPS, 2, { maximum: 32 }
        ),
        accountConcurrentZips: positiveInteger(
            env.PHOCLOUD_ACCOUNT_CONCURRENT_ZIPS, 1, { maximum: 8 }
        ),
        globalMonthlyUploadBytes: gibibytes(
            env.PHOCLOUD_GLOBAL_MONTHLY_UPLOAD_GIB, 2048
        ),
        globalTransferStorageBytes: gibibytes(
            env.PHOCLOUD_GLOBAL_TRANSFER_STORAGE_GIB, 250
        ),
        globalMonthlyDownloadBytes: gibibytes(
            env.PHOCLOUD_GLOBAL_MONTHLY_DOWNLOAD_GIB, 4096
        ),
        globalMonthlyZipBytes: gibibytes(
            env.PHOCLOUD_GLOBAL_MONTHLY_ZIP_GIB, 250
        ),
        globalMonthlyZipJobs: positiveInteger(
            env.PHOCLOUD_GLOBAL_MONTHLY_ZIP_JOBS, 1000,
            { maximum: 1000000 }
        ),
        globalMonthlyErrorLimit: positiveInteger(
            env.PHOCLOUD_GLOBAL_MONTHLY_ERROR_LIMIT, 5000,
            { maximum: 10000000 }
        ),
        plans: Object.freeze({
            free: Object.freeze(plan("FREE", DEFAULT_PLAN_LIMITS.free)),
            professional: Object.freeze(plan("CREATOR", DEFAULT_PLAN_LIMITS.professional)),
            studio: Object.freeze(plan("PRO", DEFAULT_PLAN_LIMITS.studio))
        })
    });
}

function monthKey(date = new Date()) {
    return new Date(date).toISOString().slice(0, 7);
}

function createConcurrencyLimiter() {
    let globalActive = 0;
    const accountActive = new Map();

    function tryAcquire(accountId, { globalLimit, accountLimit }) {
        const key = String(accountId);
        const currentAccount = accountActive.get(key) || 0;
        if (globalActive >= globalLimit || currentAccount >= accountLimit) return null;
        globalActive += 1;
        accountActive.set(key, currentAccount + 1);
        let released = false;
        return () => {
            if (released) return;
            released = true;
            globalActive = Math.max(0, globalActive - 1);
            const next = Math.max(0, (accountActive.get(key) || 1) - 1);
            if (next) accountActive.set(key, next);
            else accountActive.delete(key);
        };
    }

    return {
        tryAcquire,
        snapshot: () => ({ globalActive, accounts: accountActive.size })
    };
}

module.exports = {
    DEFAULT_PLAN_LIMITS,
    GIB,
    TECHNICAL_MAX_TRANSFER_BYTES,
    createConcurrencyLimiter,
    createEconomicConfig,
    monthKey
};
