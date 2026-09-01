const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("node:child_process");
const { Jimp } = require("jimp");

const rootDirectory = path.join(__dirname, "..");

async function waitForServer(baseUrl, process) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        if (process.exitCode !== null) throw new Error("El servidor de prueba se detuvo");
        try {
            const response = await fetch(`${baseUrl}/healthz`);
            if (response.ok) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("El servidor de prueba no respondió");
}

async function jsonRequest(url, { method = "GET", body, cookie } = {}) {
    const response = await fetch(url, {
        method,
        headers: {
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            ...(cookie ? { Cookie: cookie } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual"
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
}

test("recorrido de registro, permisos de visualización y envío", async () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "phocloud-release-"));
    const fixturePath = path.join(temporaryRoot, "fixture.png");
    await new Jimp({ width: 1200, height: 800, color: 0xc9aa70ff })
        .write(fixturePath);
    const png = fs.readFileSync(fixturePath);
    const port = 32_000 + (process.pid % 10_000);
    const baseUrl = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
        cwd: rootDirectory,
        env: {
            ...process.env,
            NODE_ENV: "test",
            PORT: String(port),
            PHOCLOUD_PUBLIC_URL: baseUrl,
            PHOCLOUD_DATABASE_PATH: path.join(temporaryRoot, "phocloud.db"),
            PHOCLOUD_UPLOADS_DIRECTORY: path.join(temporaryRoot, "uploads"),
            SMTP_HOST: "",
            SMTP_USER: "",
            SMTP_PASS: "",
            PHOCLOUD_FROM_EMAIL: ""
        },
        stdio: "ignore"
    });

    try {
        await waitForServer(baseUrl, child);

        const registration = {
            displayName: "Estudio Beta",
            username: "estudio-beta",
            email: "estudio@example.com",
            password: "ContrasenaTemporal123"
        };
        const rejected = await jsonRequest(`${baseUrl}/auth/register`, {
            method: "POST",
            body: { ...registration, acceptTerms: false }
        });
        assert.equal(rejected.response.status, 400);

        const registered = await jsonRequest(`${baseUrl}/auth/register`, {
            method: "POST",
            body: { ...registration, acceptTerms: true }
        });
        assert.equal(registered.response.status, 201);
        const verificationToken = new URL(registered.data.devLink)
            .searchParams.get("token");
        const verified = await jsonRequest(`${baseUrl}/auth/verify-email`, {
            method: "POST",
            body: { token: verificationToken }
        });
        assert.equal(verified.response.status, 200);

        const login = await jsonRequest(`${baseUrl}/auth/login`, {
            method: "POST",
            body: {
                identifier: registration.email,
                password: registration.password
            }
        });
        assert.equal(login.response.status, 200);
        const cookie = login.response.headers.getSetCookie()
            .map((value) => value.split(";", 1)[0])
            .join("; ");
        const account = await jsonRequest(`${baseUrl}/account`, { cookie });
        assert.equal(account.data.account.usage.galleryLimit, 3);
        const capabilities = await jsonRequest(
            `${baseUrl}/transfers/capabilities`, { cookie }
        );
        assert.equal(capabilities.response.status, 200);
        assert.equal(capabilities.data.uploadMode, "local");
        assert.equal(capabilities.data.maxTotalSize, 50 * 1024 * 1024 * 1024);

        const transferForm = new FormData();
        transferForm.append("title", "Material para retocador");
        transferForm.append("message", "Incluye referencias y notas");
        transferForm.append("recipientEmail", "retocador@example.com");
        transferForm.append("password", "clave-transfer");
        transferForm.append("expiresAt", new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString());
        transferForm.append("files", new File(
            [Buffer.from("contenido de prueba")], "instrucciones.txt",
            { type: "text/plain" }
        ));
        const transferUpload = await fetch(`${baseUrl}/transfers`, {
            method: "POST",
            headers: { Cookie: cookie },
            body: transferForm
        });
        const transferUploadData = await transferUpload.json();
        assert.equal(transferUpload.status, 201);
        const transferApi = `${baseUrl}/transfer/${transferUploadData.transferId}`;
        assert.equal((await fetch(transferApi)).status, 401);
        const wrongTransferPassword = await jsonRequest(`${transferApi}/unlock`, {
            method: "POST", body: { password: "incorrecta" }
        });
        assert.equal(wrongTransferPassword.response.status, 401);
        const unlockedTransfer = await jsonRequest(`${transferApi}/unlock`, {
            method: "POST", body: { password: "clave-transfer" }
        });
        assert.equal(unlockedTransfer.response.status, 204);
        const transferCookie = unlockedTransfer.response.headers.getSetCookie()
            .map((value) => value.split(";", 1)[0]).join("; ");
        const transferDetail = await jsonRequest(transferApi, { cookie: transferCookie });
        assert.equal(transferDetail.response.status, 200);
        assert.equal(transferDetail.data.files[0].name, "instrucciones.txt");
        const transferLifetime = Date.parse(transferDetail.data.expiresAt)
            - Date.parse(transferDetail.data.createdAt);
        assert.equal(transferLifetime, 24 * 60 * 60 * 1000);
        const accountWithTransfer = await jsonRequest(`${baseUrl}/account`, { cookie });
        assert.equal(
            accountWithTransfer.data.account.usage.transferStorageLimitBytes,
            50 * 1024 * 1024 * 1024
        );
        const individualTransferDownload = await fetch(
            `${transferApi}/files/instrucciones.txt/download`,
            { headers: { Cookie: transferCookie } }
        );
        assert.equal(individualTransferDownload.status, 200);
        assert.equal(await individualTransferDownload.text(), "contenido de prueba");
        const transferZip = await fetch(`${transferApi}/download`, {
            headers: { Cookie: transferCookie }
        });
        assert.equal(transferZip.status, 200);
        assert.ok((await transferZip.arrayBuffer()).byteLength > 0);
        const transferList = await jsonRequest(`${baseUrl}/transfers`, { cookie });
        assert.equal(transferList.data.transfers[0].downloadCount, 2);
        const deletedTransfer = await jsonRequest(
            `${baseUrl}/transfers/${transferUploadData.transferId}`,
            { method: "DELETE", cookie }
        );
        assert.equal(deletedTransfer.response.status, 200);
        assert.equal((await fetch(transferApi)).status, 404);

        const form = new FormData();
        form.append("clientName", "Cliente Beta");
        form.append("clientEmail", "cliente@example.com");
        form.append("viewingEnabled", "false");
        form.append("socialLinks", JSON.stringify([
            { label: "Mi web", url: "estudio-ejemplo.com" },
            { label: "Reservas", url: "booking.example.com/fotografo" }
        ]));
        form.append("photos", new File([png], "foto.png", { type: "image/png" }));
        const upload = await fetch(`${baseUrl}/upload`, {
            method: "POST",
            headers: { Cookie: cookie },
            body: form
        });
        const uploadData = await upload.json();
        assert.equal(upload.status, 201);

        const galleryUrl = `${baseUrl}/gallery/${uploadData.galleryId}`;
        assert.equal((await fetch(galleryUrl)).status, 404);
        const ownerGalleryResponse = await fetch(galleryUrl, {
            headers: { Cookie: cookie }
        });
        assert.equal(ownerGalleryResponse.status, 200);
        const ownerGallery = await ownerGalleryResponse.json();
        assert.deepEqual(ownerGallery.socialLinks, [
            { label: "Mi web", url: "https://estudio-ejemplo.com/" },
            { label: "Reservas", url: "https://booking.example.com/fotografo" }
        ]);

        const hiddenSend = await jsonRequest(
            `${baseUrl}/deliveries/${uploadData.galleryId}/send`,
            { method: "POST", body: {}, cookie }
        );
        assert.equal(hiddenSend.response.status, 409);

        const detail = await jsonRequest(
            `${baseUrl}/deliveries/${uploadData.galleryId}`,
            { cookie }
        );
        const visible = await jsonRequest(
            `${baseUrl}/deliveries/${uploadData.galleryId}`,
            {
                method: "PUT",
                cookie,
                body: {
                    ...detail.data.delivery,
                    viewingEnabled: true,
                    password: "",
                    removePassword: false
                }
            }
        );
        assert.equal(visible.response.status, 200);
        assert.equal((await fetch(galleryUrl)).status, 200);
        const publicGallery = await (await fetch(galleryUrl)).json();
        assert.equal(publicGallery.allowOriginalDownload, true);
        assert.equal(publicGallery.allowWebDownload, true);

        const template = await jsonRequest(`${baseUrl}/templates`, {
            method: "POST",
            cookie,
            body: {
                name: "Bodas elegante",
                settings: { galleryStyle: "editorial", selectionLimit: 1 }
            }
        });
        assert.equal(template.response.status, 201);
        assert.equal((await jsonRequest(`${baseUrl}/templates`, { cookie }))
            .data.templates.length, 1);

        const section = await jsonRequest(
            `${baseUrl}/deliveries/${uploadData.galleryId}/sections`,
            { method: "POST", cookie, body: { name: "Ceremonia" } }
        );
        assert.equal(section.response.status, 201);
        const filename = publicGallery.files[0];
        const assigned = await jsonRequest(
            `${baseUrl}/deliveries/${uploadData.galleryId}/photos/${encodeURIComponent(filename)}/section`,
            { method: "PUT", cookie, body: { sectionId: section.data.section.id } }
        );
        assert.equal(assigned.response.status, 200);

        const selected = await jsonRequest(`${galleryUrl}/favorites`, {
            method: "POST",
            body: { filename }
        });
        assert.equal(selected.response.status, 201);
        const commented = await jsonRequest(
            `${galleryUrl}/favorites/${encodeURIComponent(filename)}/comment`,
            { method: "PUT", body: { comment: "Quiero esta en blanco y negro" } }
        );
        assert.equal(commented.response.status, 200);
        const submitted = await jsonRequest(`${galleryUrl}/selection/submit`, {
            method: "POST",
            body: { clientName: "Cliente Beta", clientEmail: "cliente@example.com" }
        });
        assert.equal(submitted.response.status, 200);
        const lockedFavorite = await jsonRequest(
            `${galleryUrl}/favorites/${encodeURIComponent(filename)}`,
            { method: "DELETE" }
        );
        assert.equal(lockedFavorite.response.status, 409);
        const selectionDetail = await jsonRequest(
            `${baseUrl}/deliveries/${uploadData.galleryId}`,
            { cookie }
        );
        assert.equal(selectionDetail.data.delivery.selection.status, "submitted");
        assert.equal(selectionDetail.data.delivery.selectionComments[0].comment,
            "Quiero esta en blanco y negro");
        assert.ok(selectionDetail.data.delivery.activity.length >= 3);
        assert.equal(selectionDetail.data.delivery.sections[0].name, "Ceremonia");
        assert.equal(selectionDetail.data.delivery.mediaSections[filename], section.data.section.id);
        const reopened = await jsonRequest(
            `${baseUrl}/deliveries/${uploadData.galleryId}/selection/reopen`,
            { method: "POST", cookie }
        );
        assert.equal(reopened.data.selection.status, "open");

        const originalZip = await fetch(`${galleryUrl}/download`);
        assert.equal(originalZip.status, 200);
        assert.ok((await originalZip.arrayBuffer()).byteLength > 0);
        const webZip = await fetch(`${galleryUrl}/download/web`);
        assert.equal(webZip.status, 200);
        assert.ok((await webZip.arrayBuffer()).byteLength > 0);
        const webPhoto = await fetch(
            `${galleryUrl}/photos/${encodeURIComponent(publicGallery.files[0])}/download/web`
        );
        assert.equal(webPhoto.status, 200);
        assert.ok((await webPhoto.arrayBuffer()).byteLength > 0);

        const sent = await jsonRequest(
            `${baseUrl}/deliveries/${uploadData.galleryId}/send`,
            { method: "POST", body: {}, cookie }
        );
        assert.equal(sent.response.status, 200);
        assert.equal(sent.data.delivered, false);

        const uploadSimpleGallery = async (name, viewingEnabled) => {
            const galleryForm = new FormData();
            galleryForm.append("clientName", name);
            galleryForm.append("viewingEnabled", String(viewingEnabled));
            galleryForm.append("photos", new File(
                [png], `${name}.png`, { type: "image/png" }
            ));
            const response = await fetch(`${baseUrl}/upload`, {
                method: "POST",
                headers: { Cookie: cookie },
                body: galleryForm
            });
            return { response, data: await response.json() };
        };

        assert.equal((await uploadSimpleGallery("Activa dos", true)).response.status, 201);
        assert.equal((await uploadSimpleGallery("Activa tres", true)).response.status, 201);
        const fourthActive = await uploadSimpleGallery("Activa cuatro", true);
        assert.equal(fourthActive.response.status, 403);
        assert.equal(fourthActive.data.code, "PLAN_ACTIVE_GALLERY_LIMIT");
        assert.equal((await uploadSimpleGallery("Entrega guardada", false)).response.status, 201);
        const finalAccount = await jsonRequest(`${baseUrl}/account`, { cookie });
        assert.equal(finalAccount.data.account.usage.galleryCount, 3);
        assert.equal(finalAccount.data.account.usage.totalGalleryCount, 4);
        assert.equal((await fetch(`${baseUrl}/readyz`)).status, 200);
    } finally {
        child.kill("SIGTERM");
        await new Promise((resolve) => child.once("exit", resolve));
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
});

test("producción no expone la configuración privilegiada inicial", async () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "phocloud-production-"));
    const port = 42_000 + (process.pid % 5_000);
    const baseUrl = `http://127.0.0.1:${port}`;
    const publicUrl = "https://app.phocloud.example";
    const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
        cwd: rootDirectory,
        env: {
            ...process.env,
            NODE_ENV: "production",
            PORT: String(port),
            PHOCLOUD_PUBLIC_URL: publicUrl,
            PHOCLOUD_DATABASE_PATH: path.join(temporaryRoot, "data", "phocloud.db"),
            PHOCLOUD_UPLOADS_DIRECTORY: path.join(temporaryRoot, "uploads"),
            PHOCLOUD_TRANSFERS_DIRECTORY: path.join(temporaryRoot, "transfers"),
            SMTP_HOST: "smtp.example.test",
            SMTP_USER: "user",
            SMTP_PASS: "secret",
            PHOCLOUD_FROM_EMAIL: "PHOcloud <hola@phocloud.example>",
            PHOCLOUD_LEGAL_NAME: "Titular de prueba",
            PHOCLOUD_LEGAL_EMAIL: "privacidad@phocloud.example",
            PHOCLOUD_LEGAL_COUNTRY: "España",
            PHOCLOUD_TRANSFER_STORAGE: "local"
        },
        stdio: "ignore"
    });
    try {
        await waitForServer(baseUrl, child);
        const status = await jsonRequest(`${baseUrl}/auth/status`);
        assert.equal(status.data.setupRequired, false);
        const setup = await fetch(`${baseUrl}/auth/setup`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Origin: publicUrl
            },
            body: JSON.stringify({
                username: "intruso",
                password: "ContrasenaTemporal123"
            })
        });
        assert.equal(setup.status, 404);
    } finally {
        child.kill("SIGTERM");
        await new Promise((resolve) => child.once("exit", resolve));
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
});
