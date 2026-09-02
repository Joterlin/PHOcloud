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
    const origin = new URL(publicUrl).origin;
    console.log(
        `R2 validado: ${storage.bucket} acepta las credenciales de PHOcloud. CORS debe permitir ${origin} y la regla de ciclo de vida debe eliminar objetos tras 24 horas.`
    );
}

main().catch((error) => {
    console.error(`No se pudo configurar R2: ${error.message}`);
    process.exitCode = 1;
});
