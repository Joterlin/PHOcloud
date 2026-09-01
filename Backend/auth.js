const {
    createHash,
    randomBytes,
    scryptSync,
    timingSafeEqual
} = require("node:crypto");

const SESSION_COOKIE_NAME = "phocloud_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function createPasswordRecord(password) {
    const salt = randomBytes(16);
    const passwordHash = scryptSync(password, salt, 64);

    return {
        passwordSalt: salt.toString("hex"),
        passwordHash: passwordHash.toString("hex")
    };
}

function verifyPassword(password, passwordSalt, expectedHash) {
    try {
        const salt = Buffer.from(passwordSalt, "hex");
        const expected = Buffer.from(expectedHash, "hex");
        const actual = scryptSync(password, salt, expected.length);

        return expected.length === actual.length
            && timingSafeEqual(expected, actual);
    } catch {
        return false;
    }
}

function createSessionToken() {
    const token = randomBytes(32).toString("base64url");

    return {
        token,
        tokenHash: hashSessionToken(token)
    };
}

function hashSessionToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

function readCookie(cookieHeader, cookieName) {
    if (!cookieHeader) return null;

    for (const part of cookieHeader.split(";")) {
        const separatorIndex = part.indexOf("=");

        if (separatorIndex === -1) continue;

        const name = part.slice(0, separatorIndex).trim();
        const value = part.slice(separatorIndex + 1).trim();

        if (name === cookieName) {
            try {
                return decodeURIComponent(value);
            } catch {
                return null;
            }
        }
    }

    return null;
}

module.exports = {
    SESSION_COOKIE_NAME,
    SESSION_DURATION_MS,
    createPasswordRecord,
    verifyPassword,
    createSessionToken,
    hashSessionToken,
    readCookie
};
