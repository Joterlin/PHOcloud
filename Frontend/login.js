const byId = (id) => document.getElementById(id);
const authForm = byId("authForm");
const authTabs = byId("authTabs");
const authTitle = byId("authTitle");
const authIntro = byId("authIntro");
const authEyebrow = byId("authEyebrow");
const authButton = byId("authButton");
const backButton = byId("backButton");
const authError = byId("authError");
const authSuccess = byId("authSuccess");
const authSuccessText = byId("authSuccessText");
const devLink = byId("devLink");
const googleAuthBlock = byId("googleAuthBlock");
const googleAuthButton = byId("googleAuthButton");
const emailInput = byId("email");
const passwordInput = byId("password");
const confirmPasswordInput = byId("confirmPassword");
const params = new URLSearchParams(window.location.search);
const requestedNext = params.get("next") || "";
const oauthError = params.get("oauthError") || "";
const PENDING_TRANSFER_CLAIM_KEY = "straclase-pending-transfer-claim";
const validTransferId = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
function pendingTransferClaim() {
    try {
        const value = localStorage.getItem(PENDING_TRANSFER_CLAIM_KEY) || "";
        return validTransferId(value) ? value : "";
    } catch {
        return "";
    }
}
const nextClaim = (() => {
    if (!requestedNext.startsWith("/") || requestedNext.startsWith("//")) return "";
    try {
        const value = new URL(requestedNext, window.location.origin)
            .searchParams.get("claimTransfer") || "";
        if (validTransferId(value)) {
            localStorage.setItem(PENDING_TRANSFER_CLAIM_KEY, value);
            return value;
        }
    } catch {}
    return "";
})();
const savedClaim = nextClaim || pendingTransferClaim();
const redirectTarget = requestedNext.startsWith("/")
    && !requestedNext.startsWith("//")
    ? requestedNext
    : savedClaim
        ? `/app?claimTransfer=${encodeURIComponent(savedClaim)}`
        : "/app";

let setupRequired = false;
let googleAuthEnabled = false;
let mode = params.get("mode") || "login";
const accountToken = params.get("token") || "";
let backTargetMode = "login";
let backEmail = "";

function setGroup(id, visible, required = visible) {
    const group = byId(id);
    group.hidden = !visible;
    for (const input of group.querySelectorAll("input")) {
        input.disabled = !visible;
        input.required = required;
    }
}

function clearNotices() {
    authError.hidden = true;
    authSuccess.hidden = true;
    devLink.hidden = true;
}

function revealNotice(element) {
    window.requestAnimationFrame(() => {
        element.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
}

function showError(message) {
    authSuccess.hidden = true;
    authError.textContent = message;
    authError.hidden = false;
    revealNotice(authError);
}

function showSuccess(message, link = null) {
    authError.hidden = true;
    authSuccessText.textContent = message;
    authSuccess.hidden = false;
    devLink.hidden = !link;
    if (link) devLink.href = link;
    revealNotice(authSuccess);
}

function configureMode(nextMode) {
    mode = nextMode;
    clearNotices();
    backTargetMode = "login";
    backEmail = "";
    backButton.textContent = "Volver al acceso";
    authTabs.hidden = !["login", "register"].includes(mode) || setupRequired;
    googleAuthBlock.hidden = !googleAuthEnabled
        || !["login", "register"].includes(mode)
        || setupRequired;
    backButton.hidden = ["login", "register", "setup"].includes(mode);
    byId("termsText").hidden = mode !== "register";
    byId("acceptTerms").disabled = mode !== "register";
    byId("acceptTerms").required = mode === "register";
    for (const button of authTabs.querySelectorAll("button")) {
        button.classList.toggle("active", button.dataset.mode === mode);
    }

    setGroup("displayNameGroup", mode === "register");
    setGroup("emailGroup", ["login", "register", "setup", "forgot", "resend"].includes(mode));
    setGroup("passwordGroup", ["login", "register", "setup", "reset"].includes(mode));
    setGroup("confirmPasswordGroup", ["register", "setup", "reset"].includes(mode));
    byId("forgotButton").hidden = mode !== "login";
    passwordInput.autocomplete = mode === "login" ? "current-password" : "new-password";

    const content = {
        login: ["TU ESPACIO STRACLASE", "Bienvenido de nuevo", "Envía archivos grandes y gestiona tus galerías profesionales.", "Entrar"],
        register: ["EMPIEZA GRATIS", "Crea tu cuenta", "Transfiere hasta 5 GiB durante 24 horas y crea hasta tres galerías.", "Crear cuenta"],
        setup: ["PRIMERA CONFIGURACIÓN", "Crea la cuenta inicial", "Administra transferencias, galerías y marca desde un único espacio.", "Crear cuenta"],
        forgot: ["RECUPERAR ACCESO", "¿Olvidaste tu contraseña?", "Te enviaremos un enlace seguro para crear una nueva.", "Enviar enlace"],
        resend: ["CONFIRMAR CORREO", "Solicita otro enlace", "Escribe el correo con el que creaste tu cuenta.", "Reenviar verificación"],
        reset: ["NUEVA CONTRASEÑA", "Recupera tu cuenta", "Elige una contraseña nueva de al menos 10 caracteres.", "Guardar contraseña"],
        verify: ["CONFIRMANDO CUENTA", "Estamos verificando tu correo", "Solo tardará un momento.", "Verificando…"]
    }[mode] || null;
    if (!content) return configureMode("login");
    [authEyebrow.textContent, authTitle.textContent, authIntro.textContent, authButton.textContent] = content;
    authButton.hidden = mode === "verify";
    if (mode === "verify") verifyEmail();
}

async function request(url, body) {
    let response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000)
        });
    } catch (error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") {
            throw new Error("Straclase tardó demasiado en responder. Comprueba tu conexión y vuelve a intentarlo.");
        }
        throw new Error("No se pudo conectar con Straclase. Vuelve a intentarlo.");
    }
    const contentType = response.headers.get("Content-Type") || "";
    const data = contentType.includes("application/json")
        ? await response.json().catch(() => ({}))
        : {};
    if (!response.ok) {
        const error = new Error(data.error || "No se pudo completar la solicitud");
        Object.assign(error, data);
        throw error;
    }
    return data;
}

async function verifyEmail() {
    if (!accountToken) {
        showError("El enlace de verificación no es válido");
        backButton.hidden = false;
        return;
    }
    try {
        const data = await request("/auth/verify-email", { token: accountToken });
        showSuccess(data.authenticated
            ? "Correo confirmado. Abriendo tu espacio para convertir la transferencia…"
            : data.message);
        if (data.authenticated) {
            window.setTimeout(() => window.location.replace(redirectTarget), 600);
        } else {
            backButton.hidden = false;
        }
    } catch (error) {
        showError(error.message);
        backButton.hidden = false;
    }
}

authTabs.addEventListener("click", (event) => {
    const targetMode = event.target.dataset.mode;
    if (targetMode) configureMode(targetMode);
});
byId("forgotButton").addEventListener("click", () => configureMode("forgot"));
backButton.addEventListener("click", () => {
    history.replaceState({}, "", "/login");
    const target = backTargetMode;
    const email = backEmail;
    configureMode(target);
    if (email) emailInput.value = email;
});

authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearNotices();
    if (["register", "setup", "reset"].includes(mode)
        && passwordInput.value !== confirmPasswordInput.value) {
        showError("Las contraseñas no coinciden");
        return;
    }
    authButton.disabled = true;
    const previousText = authButton.textContent;
    authButton.textContent = "Procesando…";
    try {
        if (mode === "login") {
            await request("/auth/login", {
                email: emailInput.value.trim(),
                password: passwordInput.value
            });
            window.location.replace(redirectTarget);
            return;
        }
        if (mode === "setup") {
            await request("/auth/setup", {
                email: emailInput.value.trim(),
                password: passwordInput.value
            });
            window.location.replace(redirectTarget);
            return;
        }
        if (mode === "register") {
            const data = await request("/auth/register", {
                displayName: byId("displayName").value.trim(),
                email: emailInput.value.trim(),
                password: passwordInput.value,
                acceptTerms: byId("acceptTerms").checked
            });
            showSuccess(data.message, data.devLink);
            authForm.reset();
            return;
        }
        if (mode === "forgot" || mode === "resend") {
            const data = await request(
                mode === "forgot" ? "/auth/forgot-password" : "/auth/resend-verification",
                { email: emailInput.value.trim() }
            );
            showSuccess(data.message, data.devLink);
            return;
        }
        if (mode === "reset") {
            const data = await request("/auth/reset-password", {
                token: accountToken,
                password: passwordInput.value
            });
            showSuccess(data.message);
            backButton.hidden = false;
        }
    } catch (error) {
        showError(error.message);
        if (error.verificationRequired) {
            backButton.hidden = false;
            backButton.textContent = "Reenviar verificación";
            backTargetMode = "resend";
            backEmail = error.email || "";
        }
    } finally {
        authButton.disabled = false;
        authButton.textContent = previousText;
    }
});

async function initialize() {
    try {
        const response = await fetch("/auth/status");
        const status = await response.json();
        if (status.authenticated) return window.location.replace(redirectTarget);
        setupRequired = status.setupRequired;
        googleAuthEnabled = status.googleAuthEnabled === true;
        googleAuthButton.href = `/auth/google?next=${encodeURIComponent(redirectTarget)}`;
        if (setupRequired) mode = "setup";
        configureMode(mode);
        if (oauthError) showError(oauthError);
    } catch {
        showError("No se pudo conectar con Straclase");
    }
}

initialize();
