const test = require("node:test");
const assert = require("node:assert/strict");
const {
    createPasswordRecord,
    verifyPassword,
    createSessionToken,
    hashSessionToken,
    readCookie
} = require("./auth");

test("crea y verifica una contraseña sin guardarla en texto plano", () => {
    const password = "Una contraseña segura 2026";
    const record = createPasswordRecord(password);

    assert.notEqual(record.passwordHash, password);
    assert.equal(
        verifyPassword(password, record.passwordSalt, record.passwordHash),
        true
    );
    assert.equal(
        verifyPassword("contraseña incorrecta", record.passwordSalt, record.passwordHash),
        false
    );
});

test("genera tokens de sesión aleatorios y guarda solamente su hash", () => {
    const first = createSessionToken();
    const second = createSessionToken();

    assert.notEqual(first.token, second.token);
    assert.notEqual(first.token, first.tokenHash);
    assert.equal(first.tokenHash, hashSessionToken(first.token));
});

test("lee la cookie de sesión", () => {
    assert.equal(
        readCookie("theme=dark; phocloud_session=abc123; language=es", "phocloud_session"),
        "abc123"
    );
    assert.equal(readCookie("theme=dark", "phocloud_session"), null);
});
