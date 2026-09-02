require("dotenv").config();

const { randomUUID } = require("node:crypto");
const { createObjectStorage } = require("../Backend/object-storage");

async function main() {
    const storage = createObjectStorage();
    if (!storage.enabled) throw new Error("R2 de transferencias no está activo");

    const transferId = randomUUID();
    const fileId = randomUUID();
    const filename = "comprobacion-phocloud.txt";
    const payload = Buffer.from("PHOcloud R2 multipart smoke test");
    const origin = new URL(process.env.PHOCLOUD_PUBLIC_URL).origin;
    let key;
    let uploadId;
    let completed = false;

    try {
        const upload = await storage.startMultipart({
            transferId,
            fileId,
            filename,
            contentType: "text/plain"
        });
        ({ key, uploadId } = upload);
        const url = await storage.signPart({ key, uploadId, partNumber: 1 });
        const response = await fetch(url, {
            method: "PUT",
            headers: { Origin: origin },
            body: payload
        });
        if (!response.ok) {
            throw new Error(`R2 rechazó la subida con HTTP ${response.status}`);
        }
        if (response.headers.get("access-control-allow-origin") !== origin) {
            throw new Error("R2 no devolvió permiso CORS para PHOcloud");
        }
        const parts = await storage.listParts({ key, uploadId });
        if (parts.length !== 1 || !parts[0].etag) {
            throw new Error("R2 no registró correctamente el bloque subido");
        }
        await storage.completeMultipart({ key, uploadId, parts });
        completed = true;
        const body = await storage.getObjectStream(key);
        const received = Buffer.from(await body.transformToByteArray());
        if (!received.equals(payload)) {
            throw new Error("El contenido recuperado no coincide");
        }
        console.log("TRANSFER_R2_WRITE_CORS_READ_DELETE=OK");
    } finally {
        if (completed && key) await storage.deleteKeys([key]);
        else if (key && uploadId) {
            await storage.abortMultipart({ key, uploadId }).catch(() => {});
        }
    }
}

main().catch((error) => {
    console.error(`TRANSFER_R2_SMOKE_FAILED: ${error.message}`);
    process.exitCode = 1;
});
