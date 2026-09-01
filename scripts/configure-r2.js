require("dotenv").config();

const { createObjectStorage } = require("../Backend/object-storage");

async function main() {
    const publicUrl = process.env.PHOCLOUD_PUBLIC_URL?.trim();
    if (!publicUrl) {
        throw new Error("Falta PHOCLOUD_PUBLIC_URL");
    }
    const storage = createObjectStorage();
    if (!storage.enabled) {
        throw new Error("Configura PHOCLOUD_TRANSFER_STORAGE=r2");
    }
    await storage.healthcheck();
    const configured = await storage.configureBucket(publicUrl);
    console.log(
        `R2 configurado: ${configured.bucket} acepta subidas desde ${configured.origin} y elimina transferencias tras 24 horas.`
    );
}

main().catch((error) => {
    console.error(`No se pudo configurar R2: ${error.message}`);
    process.exitCode = 1;
});
