const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
    configuredSecurityEmail,
    renderLegalTemplate,
    validatePublicConfiguration
} = require("./public-config");

function validEnvironment() {
    return {
        NODE_ENV: "production",
        PHOCLOUD_PUBLIC_URL: "https://app.valid-domain.es",
        PHOCLOUD_FROM_EMAIL: "Straclase <noreply@valid-domain.es>",
        PHOCLOUD_LEGAL_NAME: "Galería Digital SL",
        PHOCLOUD_LEGAL_EMAIL: "legal@valid-domain.es",
        PHOCLOUD_LEGAL_COUNTRY: "España",
        PHOCLOUD_LEGAL_ADDRESS: "Calle Mayor 1, Madrid",
        PHOCLOUD_LEGAL_TAX_ID: "B12345678",
        PHOCLOUD_SECURITY_EMAIL: "security@valid-domain.es"
    };
}

test("rechaza placeholders, dominios personales y correos ajenos al dominio público", () => {
    const placeholder = validEnvironment();
    placeholder.PHOCLOUD_LEGAL_NAME = "Responsable pendiente de configurar";
    placeholder.PHOCLOUD_LEGAL_EMAIL = "personal@gmail.com";
    placeholder.PHOCLOUD_FROM_EMAIL = "Straclase <onboarding@resend.dev>";

    const errors = validatePublicConfiguration(placeholder, {
        requireLegal: true,
        requireTransactional: true
    });
    assert.ok(errors.some((error) => error.includes("PHOCLOUD_LEGAL_NAME")));
    assert.ok(errors.some((error) => error.includes("PHOCLOUD_LEGAL_EMAIL")));
    assert.ok(errors.some((error) => error.includes("PHOCLOUD_FROM_EMAIL")));
    assert.ok(errors.every((error) => !error.includes("personal@gmail.com")));
});

test("publica las páginas sin exigir datos de identidad que no se renderizan", () => {
    const env = validEnvironment();
    delete env.PHOCLOUD_LEGAL_NAME;
    delete env.PHOCLOUD_LEGAL_ADDRESS;
    delete env.PHOCLOUD_LEGAL_TAX_ID;

    assert.deepEqual(validatePublicConfiguration(env, { requireLegal: true }), []);
    assert.match(renderLegalTemplate("{{LEGAL_COUNTRY}} · {{LEGAL_EMAIL}}", env), /España/);
});

test("renderiza privacidad y términos sin identidad personal ni correo transaccional", () => {
    const env = validEnvironment();
    const privacyTemplate = fs.readFileSync(
        path.join(__dirname, "..", "public", "privacy.html"),
        "utf8"
    );
    const termsTemplate = fs.readFileSync(
        path.join(__dirname, "..", "public", "terms.html"),
        "utf8"
    );

    for (const template of [privacyTemplate, termsTemplate]) {
        const html = renderLegalTemplate(template, env);
        assert.match(html, /legal@valid-domain\.es/);
        assert.doesNotMatch(html, /Galería Digital SL/);
        assert.doesNotMatch(html, /Calle Mayor 1, Madrid/);
        assert.doesNotMatch(html, /B12345678/);
        assert.doesNotMatch(html, /noreply@valid-domain\.es/);
        assert.doesNotMatch(html, /{{[A-Z0-9_]+}}/);
        assert.doesNotMatch(html, /pendiente de configurar/i);
    }
});

test("escapa valores legales antes de incorporarlos al HTML", () => {
    const env = validEnvironment();
    env.PHOCLOUD_LEGAL_REGISTRY = "Registro <script>alert(1)</script>";
    const html = renderLegalTemplate("{{LEGAL_REGISTRY_BLOCK}}", env);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
});

test("las plantillas públicas no incluyen campos de identidad personal", () => {
    for (const filename of ["privacy.html", "terms.html"]) {
        const template = fs.readFileSync(
            path.join(__dirname, "..", "public", filename),
            "utf8"
        );
        assert.doesNotMatch(template, /{{LEGAL_NAME}}/);
        assert.doesNotMatch(template, /{{LEGAL_ADDRESS}}/);
        assert.doesNotMatch(template, /{{LEGAL_TAX_ID}}/);
        assert.doesNotMatch(template, /{{LEGAL_REGISTRY_BLOCK}}/);
    }
});

test("security.txt solo usa su correo específico cuando es válido", () => {
    const env = validEnvironment();
    assert.equal(configuredSecurityEmail(env), "security@valid-domain.es");
    delete env.PHOCLOUD_SECURITY_EMAIL;
    assert.equal(configuredSecurityEmail(env), "");
});
