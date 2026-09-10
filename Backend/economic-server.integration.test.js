const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const rootDirectory = path.join(__dirname, "..");

async function waitForServer(baseUrl, child) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error("El servidor se detuvo");
        try {
            if ((await fetch(`${baseUrl}/healthz`)).ok) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 75));
    }
    throw new Error("El servidor no respondió");
}

async function startServer(overrides = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phocloud-guard-"));
    const port = 46_000 + Math.floor(Math.random() * 1500);
    const baseUrl = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
        cwd: rootDirectory,
        env: {
            ...process.env,
            NODE_ENV: "test", PORT: String(port), PHOCLOUD_PUBLIC_URL: baseUrl,
            PHOCLOUD_DATABASE_PATH: path.join(root, "phocloud.db"),
            PHOCLOUD_UPLOADS_DIRECTORY: path.join(root, "uploads"),
            PHOCLOUD_TRANSFERS_DIRECTORY: path.join(root, "transfers"),
            PHOCLOUD_TRANSFER_STORAGE: "local",
            SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "",
            PHOCLOUD_FROM_EMAIL: "",
            ...overrides
        },
        stdio: "ignore"
    });
    await waitForServer(baseUrl, child);
    return { root, baseUrl, child };
}

async function setup(baseUrl) {
    const response = await fetch(`${baseUrl}/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "economia@example.com", password: "ContrasenaTemporal123" })
    });
    assert.equal(response.status, 201);
    return response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
}

function transferForm(name) {
    const form = new FormData();
    form.append("title", name);
    form.append("files", new File([Buffer.alloc(10)], `${name}.txt`, { type: "text/plain" }));
    return form;
}

async function stop(server) {
    server.child.kill("SIGTERM");
    await new Promise((resolve) => server.child.once("exit", resolve));
    fs.rmSync(server.root, { recursive: true, force: true });
}

test("cuota concurrente, ZIP suspendido y métricas privadas funcionan juntos", async () => {
    const server = await startServer({
        PHOCLOUD_FREE_MONTHLY_UPLOAD_GIB: "0.000000014",
        PHOCLOUD_FREE_TRANSFER_MAX_GIB: "0.000000014",
        PHOCLOUD_ZIP_ENABLED: "false",
        PHOCLOUD_OPERATIONS_TOKEN: "token-operaciones-prueba"
    });
    try {
        const cookie = await setup(server.baseUrl);
        const capabilities = await fetch(`${server.baseUrl}/transfers/capabilities`, {
            headers: { Cookie: cookie }
        }).then((response) => response.json());
        assert.equal(capabilities.maxTotalSize, 15);
        assert.equal(capabilities.maxFileSize, 15);
        const responses = await Promise.all(["uno", "dos"].map((name) => fetch(
            `${server.baseUrl}/transfers`,
            { method: "POST", headers: { Cookie: cookie }, body: transferForm(name) }
        )));
        const statuses = responses.map((response) => response.status);
        assert.equal(statuses.filter((status) => status === 201).length, 1);
        assert.equal(statuses.filter((status) => [403, 429].includes(status)).length, 1);
        const created = await Promise.all(responses.map(async (response) => ({
            status: response.status, data: await response.json()
        })));
        const transferId = created.find((item) => item.status === 201).data.transferId;
        assert.equal((await fetch(`${server.baseUrl}/transfer/${transferId}/download`)).status, 503);
        assert.equal((await fetch(`${server.baseUrl}/operations/economics`)).status, 401);
        const metrics = await fetch(`${server.baseUrl}/operations/economics`, {
            headers: { Authorization: "Bearer token-operaciones-prueba" }
        });
        assert.equal(metrics.status, 200);
        const body = await metrics.json();
        assert.equal(body.estimates.uploadedBytes, 10);
        assert.equal(body.controls.zipEnabled, false);

        const tooLarge = await fetch(`${server.baseUrl}/transfers`, {
            method: "POST", headers: { Cookie: cookie },
            body: (() => {
                const form = new FormData();
                form.append("title", "demasiado grande");
                form.append("files", new File([Buffer.alloc(16)], "grande.bin"));
                return form;
            })()
        });
        assert.equal(tooLarge.status, 403);
        assert.equal((await tooLarge.json()).code, "PLAN_TRANSFER_SIZE_LIMIT");
    } finally {
        await stop(server);
    }
});

test("el interruptor de transferencias no bloquea login ni administración", async () => {
    const server = await startServer({ PHOCLOUD_ACCEPT_NEW_TRANSFERS: "false" });
    try {
        const cookie = await setup(server.baseUrl);
        assert.equal((await fetch(`${server.baseUrl}/account`, {
            headers: { Cookie: cookie }
        })).status, 200);
        assert.equal((await fetch(`${server.baseUrl}/transfers`, {
            method: "POST", headers: { Cookie: cookie }, body: transferForm("pausada")
        })).status, 503);
    } finally {
        await stop(server);
    }
});
