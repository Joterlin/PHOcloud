const PERSONAL_EMAIL_DOMAINS = new Set([
    "gmail.com",
    "googlemail.com",
    "hotmail.com",
    "hotmail.es",
    "outlook.com",
    "outlook.es",
    "live.com",
    "icloud.com",
    "me.com",
    "yahoo.com",
    "yahoo.es",
    "proton.me",
    "protonmail.com"
]);

const LEGAL_REQUIRED_VARIABLES = [
    "PHOCLOUD_LEGAL_EMAIL",
    "PHOCLOUD_LEGAL_COUNTRY"
];

const LEGAL_OPTIONAL_VARIABLES = [
    "PHOCLOUD_LEGAL_NAME",
    "PHOCLOUD_LEGAL_ADDRESS",
    "PHOCLOUD_LEGAL_TAX_ID",
    "PHOCLOUD_LEGAL_REGISTRY"
];

const PLACEHOLDER_PATTERNS = [
    /pendiente/i,
    /por configurar/i,
    /tudominio/i,
    /tu-dominio/i,
    /your[ -]?domain/i,
    /example\.(?:com|org|net|test|invalid)/i,
    /\.example$/i,
    /\.invalid$/i,
    /\.local$/i,
    /nombre o raz[oó]n social/i,
    /domicilio (?:legal|fiscal|completo)/i,
    /nif[- ]?iva/i,
    /nif (?:del )?prestador/i,
    /datos registrales/i,
    /xxxxxxxx/i
];

function clean(value) {
    return String(value || "").trim();
}

function containsPlaceholder(value) {
    const normalized = clean(value);
    return !normalized || PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function extractMailbox(value, allowDisplayName = false) {
    const normalized = clean(value);
    if (!normalized || /[\r\n]/.test(normalized)) return "";
    const bracketed = normalized.match(/^([^<>]+)\s*<([^<>]+)>$/);
    const candidate = bracketed ? bracketed[2].trim() : normalized;
    if (bracketed && !allowDisplayName) return "";
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(candidate)) return "";
    return candidate.toLowerCase();
}

function publicHostname(env) {
    try {
        return new URL(clean(env.PHOCLOUD_PUBLIC_URL)).hostname
            .toLowerCase()
            .replace(/^www\./, "");
    } catch {
        return "";
    }
}

function relatedDomains(first, second) {
    return first === second
        || first.endsWith(`.${second}`)
        || second.endsWith(`.${first}`);
}

function emailErrors(name, rawValue, env, { allowDisplayName = false } = {}) {
    const errors = [];
    if (!clean(rawValue)) return [`Falta ${name}`];
    if (containsPlaceholder(rawValue)) {
        errors.push(`${name} contiene un marcador o dato de ejemplo`);
        return errors;
    }
    const mailbox = extractMailbox(rawValue, allowDisplayName);
    if (!mailbox) return [`${name} no contiene una dirección de correo válida`];
    const domain = mailbox.split("@")[1];
    if (PERSONAL_EMAIL_DOMAINS.has(domain)) {
        errors.push(`${name} debe usar un correo profesional, no un proveedor personal`);
    }
    if (env.NODE_ENV === "production") {
        const hostname = publicHostname(env);
        if (hostname && !relatedDomains(hostname, domain)) {
            errors.push(`${name} debe usar el mismo dominio base que PHOCLOUD_PUBLIC_URL`);
        }
    }
    return errors;
}

function validatePublicConfiguration(env = process.env, {
    requireLegal = false,
    requireTransactional = false
} = {}) {
    const errors = [];

    if (requireLegal) {
        for (const name of LEGAL_REQUIRED_VARIABLES) {
            const value = clean(env[name]);
            if (!value) {
                errors.push(`Falta ${name}`);
            } else if (containsPlaceholder(value)) {
                errors.push(`${name} contiene un marcador o dato de ejemplo`);
            }
        }
        if (clean(env.PHOCLOUD_LEGAL_EMAIL)) {
            errors.push(...emailErrors("PHOCLOUD_LEGAL_EMAIL", env.PHOCLOUD_LEGAL_EMAIL, env));
        }
        for (const name of LEGAL_OPTIONAL_VARIABLES) {
            if (clean(env[name]) && containsPlaceholder(env[name])) {
                errors.push(`${name} contiene un marcador o dato de ejemplo`);
            }
        }
    }

    if (requireTransactional || clean(env.PHOCLOUD_FROM_EMAIL)) {
        errors.push(...emailErrors("PHOCLOUD_FROM_EMAIL", env.PHOCLOUD_FROM_EMAIL, env, {
            allowDisplayName: true
        }));
    }

    if (clean(env.PHOCLOUD_SECURITY_EMAIL)) {
        errors.push(...emailErrors("PHOCLOUD_SECURITY_EMAIL", env.PHOCLOUD_SECURITY_EMAIL, env));
    }

    return [...new Set(errors)];
}

function escapeHtml(value) {
    return clean(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function legalConfiguration(env = process.env) {
    return {
        name: clean(env.PHOCLOUD_LEGAL_NAME),
        email: clean(env.PHOCLOUD_LEGAL_EMAIL),
        country: clean(env.PHOCLOUD_LEGAL_COUNTRY),
        address: clean(env.PHOCLOUD_LEGAL_ADDRESS),
        taxId: clean(env.PHOCLOUD_LEGAL_TAX_ID),
        registry: clean(env.PHOCLOUD_LEGAL_REGISTRY)
    };
}

function renderLegalTemplate(template, env = process.env, {
    updatedDate = "8 de septiembre de 2026"
} = {}) {
    const errors = validatePublicConfiguration(env, { requireLegal: true });
    if (errors.length) {
        const error = new Error(`Configuración legal no publicable: ${errors.join("; ")}`);
        error.code = "LEGAL_CONFIGURATION_INVALID";
        throw error;
    }

    const legal = legalConfiguration(env);
    const replacements = {
        LEGAL_NAME: legal.name,
        LEGAL_EMAIL: legal.email,
        LEGAL_COUNTRY: legal.country,
        LEGAL_ADDRESS: legal.address,
        LEGAL_TAX_ID: legal.taxId,
        UPDATED_DATE: updatedDate
    };
    let html = Object.entries(replacements).reduce(
        (result, [key, value]) => result.replaceAll(`{{${key}}}`, escapeHtml(value)),
        String(template)
    );
    const registryBlock = legal.registry
        ? `<p><strong>Datos registrales:</strong> ${escapeHtml(legal.registry)}.</p>`
        : "";
    html = html.replaceAll("{{LEGAL_REGISTRY_BLOCK}}", registryBlock);
    if (/{{[A-Z0-9_]+}}/.test(html)) {
        throw new Error("La plantilla legal contiene campos sin sustituir");
    }
    return html;
}

function configuredSecurityEmail(env = process.env) {
    const value = clean(env.PHOCLOUD_SECURITY_EMAIL);
    if (!value || emailErrors("PHOCLOUD_SECURITY_EMAIL", value, env).length) return "";
    return extractMailbox(value);
}

module.exports = {
    LEGAL_REQUIRED_VARIABLES,
    configuredSecurityEmail,
    containsPlaceholder,
    extractMailbox,
    legalConfiguration,
    renderLegalTemplate,
    validatePublicConfiguration
};
