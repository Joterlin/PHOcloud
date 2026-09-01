require("dotenv").config();

const baseUrl = process.env.PHOCLOUD_PUBLIC_URL?.replace(/\/$/, "");
const allowHttp = process.env.PHOCLOUD_SMOKE_ALLOW_HTTP === "true";

function fail(message) {
    throw new Error(message);
}

async function request(pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        ...options
    });
    return response;
}

async function expectStatus(pathname, expected, options) {
    const response = await request(pathname, options);
    if (response.status !== expected) {
        fail(`${pathname}: se esperaba ${expected} y respondió ${response.status}`);
    }
    console.log(`OK ${response.status} ${pathname}`);
    return response;
}

async function main() {
    if (!baseUrl) fail("Falta PHOCLOUD_PUBLIC_URL");
    const parsed = new URL(baseUrl);
    if (!allowHttp && parsed.protocol !== "https:") {
        fail("La comprobación pública exige HTTPS");
    }

    const health = await expectStatus("/healthz", 200);
    const healthData = await health.json();
    if (healthData.status !== "ok") fail("/healthz no declara estado ok");

    const ready = await expectStatus("/readyz", 200);
    const readyData = await ready.json();
    if (readyData.status !== "ready") fail("/readyz no declara estado ready");

    const login = await expectStatus("/login", 200);
    const loginHtml = await login.text();
    if (!loginHtml.includes("PHOcloud")) fail("/login no contiene la aplicación");

    await expectStatus("/privacidad", 200);
    await expectStatus("/terminos", 200);
    const status = await expectStatus("/auth/status", 200);
    const statusData = await status.json();
    if (statusData.setupRequired) {
        fail("Producción anuncia una configuración privilegiada inicial");
    }

    const headers = await expectStatus("/healthz", 200);
    for (const name of [
        "content-security-policy",
        "x-content-type-options",
        "referrer-policy"
    ]) {
        if (!headers.headers.get(name)) fail(`Falta la cabecera ${name}`);
    }
    if (!allowHttp && !headers.headers.get("strict-transport-security")) {
        fail("Falta Strict-Transport-Security");
    }
    console.log(
        `PHOcloud público correcto en ${baseUrl}; transferencias: ${readyData.transferStorage || "sin declarar"}.`
    );
}

main().catch((error) => {
    console.error(`SMOKE ERROR: ${error.message}`);
    process.exitCode = 1;
});
