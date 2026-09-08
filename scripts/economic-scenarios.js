const USERS = [10, 100, 1000, 10000];
const TRANSFER_GIB = [1, 5, 10, 50];
const DOWNLOADS = [1, 3, 10];
const GALLERY_GIB_PER_USER = [0, 5, 25, 50, 150];

const USD_PER_EUR = 1.1590;
const R2_STORAGE_USD_GB_MONTH = 0.015;
const R2_CLASS_A_USD_MILLION = 4.50;
const R2_CLASS_B_USD_MILLION = 0.36;
const RAILWAY_EGRESS_USD_GB = 0.05;
const PART_GIB = 64 / 1024;
const FILES_PER_TRANSFER = 10;
const GB_PER_GIB = 1024 ** 3 / 1_000_000_000;

function usd(value) { return Number(value.toFixed(4)); }
function eur(value) { return Number((value / USD_PER_EUR).toFixed(4)); }

function scenario(users, gib, downloads, mode) {
    const uploadedGiB = users * gib;
    const storedGbMonth = uploadedGiB * GB_PER_GIB / 30
        * (mode === "cached_zip" ? 2 : 1);
    const uploadA = users * (Math.ceil(gib / PART_GIB) + 2);
    const zipA = mode === "cached_zip"
        ? users * (Math.ceil(gib / PART_GIB) + 2)
        : 0;
    const downloadB = mode === "cached_zip"
        ? users * (FILES_PER_TRANSFER + downloads)
        : users * FILES_PER_TRANSFER * downloads;
    const r2StorageUsd = storedGbMonth * R2_STORAGE_USD_GB_MONTH;
    const r2OperationsUsd = (uploadA + zipA) / 1_000_000 * R2_CLASS_A_USD_MILLION
        + downloadB / 1_000_000 * R2_CLASS_B_USD_MILLION;
    const railwayEgressUsd = mode === "cached_zip"
        ? uploadedGiB * GB_PER_GIB * RAILWAY_EGRESS_USD_GB
        : 0;
    return {
        users, transferGiB: gib, downloads, mode,
        uploadedGiB,
        downloadedGiB: uploadedGiB * downloads,
        r2StorageUsd: usd(r2StorageUsd),
        r2OperationsUsd: usd(r2OperationsUsd),
        railwayEgressUsd: usd(railwayEgressUsd),
        variableTotalUsd: usd(r2StorageUsd + r2OperationsUsd + railwayEgressUsd),
        variableTotalEur: eur(r2StorageUsd + r2OperationsUsd + railwayEgressUsd)
    };
}

const scenarios = USERS.flatMap((users) => TRANSFER_GIB.flatMap((gib) => (
    DOWNLOADS.flatMap((downloads) => ["direct", "cached_zip"].map(
        (mode) => scenario(users, gib, downloads, mode)
    ))
)));

const galleryStorage = USERS.flatMap((users) => GALLERY_GIB_PER_USER.map((gib) => {
    const costUsd = users * gib * GB_PER_GIB * R2_STORAGE_USD_GB_MONTH;
    return { users, galleryGiBPerUser: gib, costUsd: usd(costUsd), costEur: eur(costUsd) };
}));

const stripeNet = [
    { plan: "Creador", priceEur: 4.99, galleryCapGiB: 50 },
    { plan: "Pro", priceEur: 9.99, galleryCapGiB: 150 }
].map((plan) => {
    const stripeFees = plan.priceEur * 0.022 + 0.25;
    const fullGalleryStorage = eur(
        plan.galleryCapGiB * GB_PER_GIB * R2_STORAGE_USD_GB_MONTH
    );
    return {
        ...plan,
        stripeFeesEur: Number(stripeFees.toFixed(4)),
        afterStripeEur: Number((plan.priceEur - stripeFees).toFixed(4)),
        afterStripeAndFullGalleryStorageEur: Number(
            (plan.priceEur - stripeFees - fullGalleryStorage).toFixed(4)
        )
    };
});

process.stdout.write(`${JSON.stringify({
    assumptions: {
        transfersPerUserMonth: 1,
        filesPerTransfer: FILES_PER_TRANSFER,
        gbPerGiB: GB_PER_GIB,
        transferRetentionHours: 24,
        r2StorageUsdGbMonth: R2_STORAGE_USD_GB_MONTH,
        r2ClassAUsdMillion: R2_CLASS_A_USD_MILLION,
        r2ClassBUsdMillion: R2_CLASS_B_USD_MILLION,
        railwayEgressUsdGb: RAILWAY_EGRESS_USD_GB,
        usdPerEur: USD_PER_EUR,
        stripeCardFee: "1.5% + EUR 0.25",
        stripeBillingFee: "0.7%"
    },
    scenarios,
    galleryStorage,
    stripeNet
}, null, 2)}\n`);
