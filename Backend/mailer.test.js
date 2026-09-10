const assert = require("node:assert/strict");
const test = require("node:test");
const nodemailer = require("nodemailer");

const {
    emailConfigured,
    resendConfigured,
    sendAccountLink,
    sendGalleryDelivery,
    sendTransferDelivery
} = require("./mailer");

const variableNames = [
    "RESEND_API_KEY",
    "PHOCLOUD_FROM_EMAIL",
    "PHOCLOUD_LEGAL_EMAIL",
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
        process.env.PHOCLOUD_FROM_EMAIL = "Nombre anterior <noreply@valid-domain.es>";
        process.env.PHOCLOUD_LEGAL_EMAIL = "legal@valid-domain.es";
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
            link: "https://straclase.example/login?mode=verify&token=abc"
        });

        assert.equal(result.delivered, true);
        assert.equal(emailConfigured(), true);
        assert.equal(resendConfigured(), true);
        assert.equal(request.url, "https://api.resend.com/emails");
        assert.equal(request.options.headers.Authorization, "Bearer re_test_secret");
        const body = JSON.parse(request.options.body);
        assert.deepEqual(body.to, ["jose@example.com"]);
        assert.equal(body.from, "Straclase <noreply@valid-domain.es>");
        assert.doesNotMatch(JSON.stringify(body), /legal@valid-domain\.es/);
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
        process.env.PHOCLOUD_FROM_EMAIL = "Straclase <onboarding@resend.dev>";
        global.fetch = async () => new Response(
            JSON.stringify({ message: "Remitente no permitido" }),
            { status: 403, headers: { "Content-Type": "application/json" } }
        );

        await assert.rejects(
            () => sendAccountLink({
                to: "jose@example.com",
                displayName: "José",
                purpose: "verify_email",
                link: "https://straclase.example/verify"
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

test("usa SMTP como respaldo si Resend rechaza el envío", async () => {
    const snapshot = Object.fromEntries(variableNames.map((name) => [name, process.env[name]]));
    const originalFetch = global.fetch;
    const originalCreateTransport = nodemailer.createTransport;
    let smtpMessage = null;
    try {
        process.env.RESEND_API_KEY = "re_test_secret";
        process.env.PHOCLOUD_FROM_EMAIL = "Straclase <noreply@valid-domain.es>";
        process.env.SMTP_HOST = "smtp.valid-domain.es";
        process.env.SMTP_USER = "usuario";
        process.env.SMTP_PASS = "secreto";
        global.fetch = async () => new Response(
            JSON.stringify({ message: "Dominio pendiente" }),
            { status: 403, headers: { "Content-Type": "application/json" } }
        );
        nodemailer.createTransport = () => ({
            async sendMail(message) { smtpMessage = message; }
        });

        const result = await sendAccountLink({
            to: "jose@example.com",
            displayName: "José",
            purpose: "verify_email",
            link: "https://straclase.example/verify"
        });

        assert.equal(result.delivered, true);
        assert.equal(smtpMessage.to, "jose@example.com");
        assert.equal(smtpMessage.from, "Straclase <noreply@valid-domain.es>");
    } finally {
        global.fetch = originalFetch;
        nodemailer.createTransport = originalCreateTransport;
        restoreEnvironment(snapshot);
    }
});

test("usa remitentes genéricos si el fotógrafo no publica una marca", async () => {
    const snapshot = Object.fromEntries(variableNames.map((name) => [name, process.env[name]]));
    const originalFetch = global.fetch;
    const messages = [];
    try {
        process.env.RESEND_API_KEY = "re_test_secret";
        process.env.PHOCLOUD_FROM_EMAIL = "Straclase <noreply@valid-domain.es>";
        global.fetch = async (url, options) => {
            messages.push(JSON.parse(options.body));
            return new Response(JSON.stringify({ id: "email_123" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        };

        await sendGalleryDelivery({
            to: "client@recipient.test",
            clientName: "Cliente",
            photographerName: "",
            galleryName: "Evento",
            link: "https://app.valid-domain.es/s/gallery",
            protectedGallery: false
        });
        await sendTransferDelivery({
            to: "client@recipient.test",
            senderName: "",
            title: "Archivos",
            message: "",
            link: "https://app.valid-domain.es/t/transfer",
            protectedTransfer: false,
            expiresAt: "2026-09-09T10:00:00.000Z"
        });

        assert.match(messages[0].subject, /^Tu fotógrafo/);
        assert.match(messages[1].subject, /^Straclase/);
    } finally {
        global.fetch = originalFetch;
        restoreEnvironment(snapshot);
    }
});
