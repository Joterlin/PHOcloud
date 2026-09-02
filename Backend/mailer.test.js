const assert = require("node:assert/strict");
const test = require("node:test");

const {
    emailConfigured,
    resendConfigured,
    sendAccountLink
} = require("./mailer");

const variableNames = [
    "RESEND_API_KEY",
    "PHOCLOUD_FROM_EMAIL",
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASS"
];

function restoreEnvironment(snapshot) {
    for (const name of variableNames) {
        if (snapshot[name] === undefined) delete process.env[name];
        else process.env[name] = snapshot[name];
    }
}

test("envía la verificación por la API HTTPS de Resend", async () => {
    const snapshot = Object.fromEntries(variableNames.map((name) => [name, process.env[name]]));
    const originalFetch = global.fetch;
    let request;
    try {
        process.env.RESEND_API_KEY = "re_test_secret";
        process.env.PHOCLOUD_FROM_EMAIL = "PHOcloud <onboarding@resend.dev>";
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_USER;
        delete process.env.SMTP_PASS;
        global.fetch = async (url, options) => {
            request = { url, options };
            return new Response(JSON.stringify({ id: "email_123" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        };

        const result = await sendAccountLink({
            to: "jose@example.com",
            displayName: "José",
            purpose: "verify_email",
            link: "https://phocloud.example/login?mode=verify&token=abc"
        });

        assert.equal(result.delivered, true);
        assert.equal(emailConfigured(), true);
        assert.equal(resendConfigured(), true);
        assert.equal(request.url, "https://api.resend.com/emails");
        assert.equal(request.options.headers.Authorization, "Bearer re_test_secret");
        const body = JSON.parse(request.options.body);
        assert.deepEqual(body.to, ["jose@example.com"]);
        assert.match(body.subject, /Confirma tu cuenta/);
        assert.match(body.html, /mode=verify/);
    } finally {
        global.fetch = originalFetch;
        restoreEnvironment(snapshot);
    }
});

test("informa un rechazo de Resend sin exponer la clave", async () => {
    const snapshot = Object.fromEntries(variableNames.map((name) => [name, process.env[name]]));
    const originalFetch = global.fetch;
    try {
        process.env.RESEND_API_KEY = "re_muy_secreta";
        process.env.PHOCLOUD_FROM_EMAIL = "PHOcloud <onboarding@resend.dev>";
        global.fetch = async () => new Response(
            JSON.stringify({ message: "Remitente no permitido" }),
            { status: 403, headers: { "Content-Type": "application/json" } }
        );

        await assert.rejects(
            () => sendAccountLink({
                to: "jose@example.com",
                displayName: "José",
                purpose: "verify_email",
                link: "https://phocloud.example/verify"
            }),
            (error) => {
                assert.match(error.message, /Resend rechazó el correo \(403\)/);
                assert.doesNotMatch(error.message, /re_muy_secreta/);
                return true;
            }
        );
    } finally {
        global.fetch = originalFetch;
        restoreEnvironment(snapshot);
    }
});
