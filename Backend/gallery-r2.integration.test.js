const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { Jimp } = require("jimp");
const { createDeliveryStore } = require("./database");

const rootDirectory = path.join(__dirname, "..");

async function requestBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks);
}

function xml(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/xml" });
    res.end(body);
}

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

test("una galería conserva originales privados en R2 durante todo su recorrido", async () => {
    const objects = new Map();
    const r2 = http.createServer(async (req, res) => {
        const url = new URL(req.url, "http://127.0.0.1");
        const key = decodeURIComponent(url.pathname)
            .replace(/^\/gallery-media-production\//, "");
        if (req.method === "GET" && url.searchParams.get("list-type") === "2") {
            return xml(res, 200, [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
                '<Name>gallery-media-production</Name>',
                `<KeyCount>${objects.size}</KeyCount><MaxKeys>1</MaxKeys>`,
                '<IsTruncated>false</IsTruncated>',
                '</ListBucketResult>'
            ].join(""));
        }
        if (req.method === "PUT") {
            objects.set(key, {
                body: await requestBody(req),
                contentType: req.headers["content-type"] || "application/octet-stream"
            });
            res.writeHead(200, { ETag: '"gallery-etag"' });
            return res.end();
        }
        if (req.method === "GET") {
            const object = objects.get(key);
            if (!object) {
                return xml(res, 404, '<Error><Code>NoSuchKey</Code></Error>');
            }
            res.writeHead(200, {
                "Content-Type": object.contentType,
                "Content-Length": object.body.length
            });
            return res.end(object.body);
        }
        if (req.method === "POST" && url.searchParams.has("delete")) {
            const deletion = (await requestBody(req)).toString("utf8");
            for (const match of deletion.matchAll(/<Key>([^<]+)<\/Key>/g)) {
                objects.delete(match[1]
                    .replaceAll("&amp;", "&")
                    .replaceAll("&lt;", "<")
                    .replaceAll("&gt;", ">")
                    .replaceAll("&quot;", '"')
                    .replaceAll("&apos;", "'"));
            }
            return xml(res, 200, [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"/>'
            ].join(""));
        }
        res.writeHead(500);
        res.end(`Ruta R2 no implementada: ${req.method} ${req.url}`);
    });
    r2.listen(0, "127.0.0.1");
    await once(r2, "listening");

    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "phocloud-gallery-flow-"));
    const fixturePath = path.join(temporaryRoot, "fixture.png");
    await new Jimp({ width: 800, height: 600, color: 0xc9aa70ff })
        .write(fixturePath);
    const png = fs.readFileSync(fixturePath);
    const r2Address = r2.address();
    const r2Endpoint = `http://127.0.0.1:${r2Address.port}`;
    const port = 37_000 + (process.pid % 2_000);
    const baseUrl = `http://127.0.0.1:${port}`;
    const uploadsDirectory = path.join(temporaryRoot, "uploads");
    const databasePath = path.join(temporaryRoot, "phocloud.db");
    const legacyGalleryId = "00000000-0000-4000-8000-000000000099";
    const legacyFolder = path.join(uploadsDirectory, legacyGalleryId);
    fs.mkdirSync(legacyFolder, { recursive: true });
    fs.copyFileSync(fixturePath, path.join(legacyFolder, "galeria anterior.png"));
    const initialStore = createDeliveryStore({
        databasePath,
        uploadsDirectory
    });
    initialStore.close();
    const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
        cwd: rootDirectory,
        env: {
            ...process.env,
            NODE_ENV: "test",
            PORT: String(port),
            PHOCLOUD_PUBLIC_URL: baseUrl,
            PHOCLOUD_DATABASE_PATH: databasePath,
            PHOCLOUD_UPLOADS_DIRECTORY: uploadsDirectory,
            PHOCLOUD_TRANSFERS_DIRECTORY: path.join(temporaryRoot, "transfers"),
            PHOCLOUD_TRANSFER_STORAGE: "local",
            PHOCLOUD_GALLERY_STORAGE: "r2",
            PHOCLOUD_R2_ACCOUNT_ID: "cuenta",
            PHOCLOUD_R2_ENDPOINT: r2Endpoint,
            PHOCLOUD_GALLERY_R2_ACCESS_KEY_ID: "access",
            PHOCLOUD_GALLERY_R2_SECRET_ACCESS_KEY: "secret",
            PHOCLOUD_GALLERY_R2_BUCKET: "gallery-media-production",
            SMTP_HOST: "",
            SMTP_USER: "",
            SMTP_PASS: "",
            PHOCLOUD_FROM_EMAIL: ""
        },
        stdio: "ignore"
    });

    try {
        await waitForServer(baseUrl, child);
        const migrationDeadline = Date.now() + 10_000;
        while (!fs.existsSync(path.join(legacyFolder, ".gallery-files.json"))
            && Date.now() < migrationDeadline) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.equal(
            fs.existsSync(path.join(legacyFolder, ".gallery-files.json")),
            true
        );
        assert.equal(
            fs.existsSync(path.join(legacyFolder, "galeria anterior.png")),
            false
        );
        assert.equal(objects.size, 1);
        const registration = {
            displayName: "Estudio R2",
            username: "estudio-r2",
            email: "r2@example.com",
            password: "ContrasenaTemporal123"
        };
        const registered = await jsonRequest(`${baseUrl}/auth/register`, {
            method: "POST",
            body: { ...registration, acceptTerms: true }
        });
        const verificationToken = new URL(registered.data.devLink)
            .searchParams.get("token");
        assert.equal((await jsonRequest(`${baseUrl}/auth/verify-email`, {
            method: "POST", body: { token: verificationToken }
        })).response.status, 200);
        const login = await jsonRequest(`${baseUrl}/auth/login`, {
            method: "POST",
            body: {
                identifier: registration.email,
                password: registration.password
            }
        });
        const cookie = login.response.headers.getSetCookie()
            .map((value) => value.split(";", 1)[0]).join("; ");

        const form = new FormData();
        form.append("clientName", "Boda en R2");
        form.append("viewingEnabled", "true");
        form.append("photos", new File([png], "foto de boda.png", {
            type: "image/png"
        }));
        const uploaded = await fetch(`${baseUrl}/upload`, {
            method: "POST",
            headers: { Cookie: cookie },
            body: form
        });
        const uploadData = await uploaded.json();
        assert.equal(uploaded.status, 201);
        assert.equal(objects.size, 2);

        const folderPath = path.join(uploadsDirectory, uploadData.galleryId);
        assert.equal(fs.existsSync(path.join(folderPath, "foto de boda.png")), false);
        assert.equal(fs.existsSync(path.join(folderPath, ".gallery-files.json")), true);

        const galleryUrl = `${baseUrl}/gallery/${uploadData.galleryId}`;
        const gallery = await jsonRequest(galleryUrl);
        assert.equal(gallery.response.status, 200);
        assert.deepEqual(gallery.data.files, ["foto de boda.png"]);

        const additionalForm = new FormData();
        additionalForm.append("photos", new File([png], "segunda.png", {
            type: "image/png"
        }));
        const added = await fetch(
            `${baseUrl}/deliveries/${uploadData.galleryId}/photos`,
            {
                method: "POST",
                headers: { Cookie: cookie },
                body: additionalForm
            }
        );
        assert.equal(added.status, 201);
        assert.equal(objects.size, 3);
        const deletedPhoto = await jsonRequest(
            `${baseUrl}/deliveries/${uploadData.galleryId}/photos/segunda.png`,
            { method: "DELETE", cookie }
        );
        assert.equal(deletedPhoto.response.status, 200);
        assert.equal(objects.size, 2);

        const photoResponse = await fetch(
            `${galleryUrl}/photos/${encodeURIComponent("foto de boda.png")}`,
            { redirect: "manual" }
        );
        assert.equal(photoResponse.status, 302);
        const original = await fetch(photoResponse.headers.get("location"));
        assert.deepEqual(Buffer.from(await original.arrayBuffer()), png);

        const zip = await fetch(`${galleryUrl}/download`);
        assert.equal(zip.status, 200);
        assert.ok((await zip.arrayBuffer()).byteLength > png.length);

        const favorite = await jsonRequest(`${galleryUrl}/favorites`, {
            method: "POST",
            body: { filename: "foto de boda.png" }
        });
        assert.equal(favorite.response.status, 201);

        const ready = await jsonRequest(`${baseUrl}/readyz`);
        assert.equal(ready.data.galleryStorage, "r2");

        const removed = await jsonRequest(
            `${baseUrl}/deliveries/${uploadData.galleryId}`,
            { method: "DELETE", cookie }
        );
        assert.equal(removed.response.status, 200);
        assert.equal(objects.size, 1);
        assert.equal(fs.existsSync(folderPath), false);
    } finally {
        if (child.exitCode === null) {
            child.kill("SIGTERM");
            await new Promise((resolve) => child.once("exit", resolve));
        }
        r2.close();
        await once(r2, "close");
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
});
