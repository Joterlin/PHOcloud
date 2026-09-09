const assert = require("node:assert/strict");
const test = require("node:test");

const {
    GIB,
    TECHNICAL_MAX_TRANSFER_BYTES,
    createConcurrencyLimiter,
    createEconomicConfig,
    monthKey
} = require("./economic-controls");

test("aplica límites conservadores y conserva 50 GiB como capacidad técnica", () => {
    const config = createEconomicConfig({});
    assert.equal(config.plans.free.transferMaxBytes, 5 * GIB);
    assert.equal(config.plans.professional.transferMaxBytes, 25 * GIB);
    assert.equal(config.plans.studio.transferMaxBytes, TECHNICAL_MAX_TRANSFER_BYTES);
    assert.equal(config.plans.free.concurrentUploads, 1);
    assert.equal(config.plans.free.monthlyZipJobs, 1);
    assert.equal(config.plans.free.monthlyZipBytes, 1 * GIB);
    assert.equal(config.plans.professional.monthlyZipJobs, 5);
    assert.equal(config.plans.professional.monthlyZipBytes, 10 * GIB);
    assert.equal(config.plans.studio.monthlyZipJobs, 20);
    assert.equal(config.plans.studio.monthlyZipBytes, 50 * GIB);
    assert.equal(config.accountConcurrentZips, 1);
    assert.equal(config.conversionEnabled, true);
    assert.equal(config.accountConcurrentConversions, 1);
    assert.equal(config.globalConcurrentConversions, 2);
});

test("los interruptores y umbrales se configuran sin permitir superar el máximo técnico", () => {
    const config = createEconomicConfig({
        PHOCLOUD_ACCEPT_NEW_TRANSFERS: "false",
        PHOCLOUD_ZIP_ENABLED: "0",
        PHOCLOUD_CONVERSION_ENABLED: "false",
        PHOCLOUD_GLOBAL_CONCURRENT_CONVERSIONS: "3",
        PHOCLOUD_FREE_TRANSFER_MAX_GIB: "500",
        PHOCLOUD_GLOBAL_CONCURRENT_UPLOADS: "3"
    });
    assert.equal(config.acceptNewTransfers, false);
    assert.equal(config.zipEnabled, false);
    assert.equal(config.conversionEnabled, false);
    assert.equal(config.globalConcurrentConversions, 3);
    assert.equal(config.plans.free.transferMaxBytes, 5 * GIB);
    assert.equal(config.globalConcurrentUploads, 3);
});

test("el limitador libera una sola vez y separa cuenta de límite global", () => {
    const limiter = createConcurrencyLimiter();
    const releaseA = limiter.tryAcquire(1, { globalLimit: 2, accountLimit: 1 });
    assert.equal(typeof releaseA, "function");
    assert.equal(limiter.tryAcquire(1, { globalLimit: 2, accountLimit: 1 }), null);
    const releaseB = limiter.tryAcquire(2, { globalLimit: 2, accountLimit: 1 });
    assert.equal(typeof releaseB, "function");
    assert.equal(limiter.tryAcquire(3, { globalLimit: 2, accountLimit: 1 }), null);
    releaseA();
    releaseA();
    assert.equal(typeof limiter.tryAcquire(3, { globalLimit: 2, accountLimit: 1 }), "function");
    releaseB();
});

test("genera periodos mensuales estables", () => {
    assert.equal(monthKey("2026-09-08T10:00:00.000Z"), "2026-09");
});
