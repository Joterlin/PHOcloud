const {
    createHash,
    createHmac,
    randomBytes,
    timingSafeEqual
} = require("crypto");
const { OAuth2Client } = require("google-auth-library");

const GOOGLE_OAUTH_COOKIE_NAME = "straclase_google_oauth";
const GOOGLE_OAUTH_MAX_AGE_MS = 10 * 60 * 1000;

function safeNextPath(value) {
    if (typeof value !== "string"
        || !value.startsWith("/")
        || value.startsWith("//")
        || value.includes("\\")
        || /[\r\n\0]/.test(value)) {
        return "/app";
    }
    try {
        const parsed = new URL(value, "https://straclase.invalid");
        if (parsed.origin !== "https://straclase.invalid"
            || parsed.pathname !== "/app") {
            return "/app";
        }
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return "/app";
    }
}

function base64UrlJson(value) {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function safeEqual(first, second) {
    const left = Buffer.from(String(first || ""));
    const right = Buffer.from(String(second || ""));
    return left.length === right.length && timingSafeEqual(left, right);
}

function createGoogleAuth({
    clientId = process.env.GOOGLE_CLIENT_ID || "",
    clientSecret = process.env.GOOGLE_CLIENT_SECRET || "",
    clientFactory = (redirectUri) => new OAuth2Client(
        clientId,
        clientSecret,
        redirectUri
    ),
    now = () => Date.now()
} = {}) {
    const configured = Boolean(clientId.trim() && clientSecret.trim());

    function sign(payload) {
        return createHmac("sha256", clientSecret)
            .update(payload)
            .digest("base64url");
    }

    function createState(next = "/app") {
        if (!configured) throw new Error("El acceso con Google no está configurado");
        const record = {
            state: randomBytes(32).toString("base64url"),
            nonce: randomBytes(32).toString("base64url"),
            verifier: randomBytes(64).toString("base64url"),
            next: safeNextPath(next),
            createdAt: now()
        };
        const payload = base64UrlJson(record);
        return {
            record,
            cookie: `${payload}.${sign(payload)}`
        };
    }

    function readState(cookie) {
        if (!configured || typeof cookie !== "string") return null;
        const separator = cookie.lastIndexOf(".");
        if (separator <= 0) return null;
        const payload = cookie.slice(0, separator);
        const suppliedSignature = cookie.slice(separator + 1);
        if (!safeEqual(sign(payload), suppliedSignature)) return null;
        try {
            const record = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
            if (!record.state || !record.nonce || !record.verifier) return null;
            if (!Number.isFinite(record.createdAt)
                || now() - record.createdAt > GOOGLE_OAUTH_MAX_AGE_MS
                || record.createdAt > now() + 30_000) {
                return null;
            }
            record.next = safeNextPath(record.next);
            return record;
        } catch {
            return null;
        }
    }

    function authorization({ redirectUri, next }) {
        const { record, cookie } = createState(next);
        const challenge = createHash("sha256")
            .update(record.verifier)
            .digest("base64url");
        const client = clientFactory(redirectUri);
        return {
            cookie,
            url: client.generateAuthUrl({
                access_type: "online",
                scope: ["openid", "email", "profile"],
                state: record.state,
                nonce: record.nonce,
                code_challenge: challenge,
                code_challenge_method: "S256",
                prompt: "select_account",
                include_granted_scopes: true
            })
        };
    }

    async function authenticate({ redirectUri, code, state, cookie }) {
        if (!configured) throw new Error("El acceso con Google no está configurado");
        const record = readState(cookie);
        if (!record || !safeEqual(record.state, state) || typeof code !== "string" || !code) {
            throw new Error("La solicitud de Google ha caducado o no es válida");
        }
        const client = clientFactory(redirectUri);
        const tokenResponse = await client.getToken({
            code,
            codeVerifier: record.verifier,
            redirect_uri: redirectUri
        });
        const idToken = tokenResponse.tokens?.id_token;
        if (!idToken) throw new Error("Google no devolvió una identidad válida");
        const ticket = await client.verifyIdToken({
            idToken,
            audience: clientId
        });
        const payload = ticket.getPayload() || {};
        if (!safeEqual(payload.nonce, record.nonce)
            || typeof payload.sub !== "string"
            || !payload.sub
            || typeof payload.email !== "string"
            || payload.email_verified !== true) {
            throw new Error("Google no pudo verificar el correo de esta cuenta");
        }
        return {
            subject: payload.sub,
            email: payload.email.trim().toLowerCase(),
            displayName: typeof payload.name === "string"
                ? payload.name.trim().slice(0, 80)
                : "",
            hostedDomain: typeof payload.hd === "string" ? payload.hd : "",
            next: record.next
        };
    }

    return {
        configured,
        authorization,
        authenticate,
        readState
    };
}

module.exports = {
    GOOGLE_OAUTH_COOKIE_NAME,
    GOOGLE_OAUTH_MAX_AGE_MS,
    createGoogleAuth,
    safeNextPath
};
