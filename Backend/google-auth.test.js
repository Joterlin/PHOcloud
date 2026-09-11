const test = require("node:test");
const assert = require("node:assert/strict");
const {
    GOOGLE_OAUTH_MAX_AGE_MS,
    createGoogleAuth,
    safeNextPath
} = require("./google-auth");

test("crea y verifica un acceso Google con PKCE, state y nonce", async () => {
    let authOptions;
    let tokenOptions;
    let verifyOptions;
    const client = {
        generateAuthUrl(options) {
            authOptions = options;
            return "https://accounts.google.test/o/oauth2/v2/auth";
        },
        async getToken(options) {
            tokenOptions = options;
            return { tokens: { id_token: "token-firmado" } };
        },
        async verifyIdToken(options) {
            verifyOptions = options;
            return { getPayload: () => ({
                sub: "google-subject",
                email: "FOTO@GMAIL.COM",
                email_verified: true,
                name: "Foto Estudio",
                nonce: authOptions.nonce
            }) };
        }
    };
    const google = createGoogleAuth({
        clientId: "client-id.apps.googleusercontent.com",
        clientSecret: "client-secret",
        clientFactory: () => client,
        now: () => 1_000_000
    });
    const authorization = google.authorization({
        redirectUri: "https://straclase.com/auth/google/callback",
        next: "/app?claimTransfer=valid"
    });
    const record = google.readState(authorization.cookie);
    const identity = await google.authenticate({
        redirectUri: "https://straclase.com/auth/google/callback",
        code: "authorization-code",
        state: record.state,
        cookie: authorization.cookie
    });

    assert.equal(google.configured, true);
    assert.equal(authOptions.code_challenge_method, "S256");
    assert.equal(authOptions.scope.join(" "), "openid email profile");
    assert.equal(tokenOptions.codeVerifier, record.verifier);
    assert.equal(verifyOptions.audience, "client-id.apps.googleusercontent.com");
    assert.deepEqual(identity, {
        subject: "google-subject",
        email: "foto@gmail.com",
        displayName: "Foto Estudio",
        hostedDomain: "",
        next: "/app?claimTransfer=valid"
    });
});

test("rechaza cookies manipuladas, caducadas y redirecciones externas", () => {
    let currentTime = 2_000_000;
    const google = createGoogleAuth({
        clientId: "client-id",
        clientSecret: "client-secret",
        clientFactory: () => ({ generateAuthUrl: () => "https://google.test" }),
        now: () => currentTime
    });
    const authorization = google.authorization({
        redirectUri: "https://straclase.com/auth/google/callback",
        next: "https://sitio-malicioso.example"
    });
    assert.equal(google.readState(authorization.cookie).next, "/app");
    assert.equal(google.readState(authorization.cookie + "x"), null);
    currentTime += GOOGLE_OAUTH_MAX_AGE_MS + 1;
    assert.equal(google.readState(authorization.cookie), null);
    assert.equal(safeNextPath("//sitio-malicioso.example"), "/app");
    assert.equal(safeNextPath("/\\sitio-malicioso.example"), "/app");
    assert.equal(safeNextPath("/login"), "/app");
    assert.equal(safeNextPath("/app"), "/app");
});
