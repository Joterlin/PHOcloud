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
const usernameInput = byId("username");
const emailInput = byId("email");
const passwordInput = byId("password");
const confirmPasswordInput = byId("confirmPassword");
const params = new URLSearchParams(window.location.search);

let setupRequired = false;
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

function showError(message) {
    authError.textContent = message;
    authError.hidden = false;
}

function showSuccess(message, link = null) {
    authSuccessText.textContent = message;
    authSuccess.hidden = false;
    devLink.hidden = !link;
    if (link) devLink.href = link;
}

function configureMode(nextMode) {
    mode = nextMode;
    clearNotices();
    backTargetMode = "login";
    backEmail = "";
    backButton.textContent = "Volver al acceso";
    authTabs.hidden = !["login", "register"].includes(mode) || setupRequired;
    backButton.hidden = ["login", "register", "setup"].includes(mode);
    byId("termsText").hidden = mode !== "register";
    byId("acceptTerms").disabled = mode !== "register";
    byId("acceptTerms").required = mode === "register";
    for (const button of authTabs.querySelectorAll("button")) {
        button.classList.toggle("active", button.dataset.mode === mode);
    }

    setGroup("displayNameGroup", mode === "register");
    setGroup("emailGroup", ["register", "forgot", "resend"].includes(mode));
    setGroup("usernameGroup", ["login", "register", "setup"].includes(mode));
    setGroup("passwordGroup", ["login", "register", "setup", "reset"].includes(mode));
    setGroup("confirmPasswordGroup", ["register", "setup", "reset"].includes(mode));
    byId("forgotButton").hidden = mode !== "login";
    byId("usernameLabel").textContent = mode === "login"
        ? "Usuario o correo"
        : "Nombre de usuario";
    passwordInput.autocomplete = mode === "login" ? "current-password" : "new-password";

    const content = {
        login: ["TU ESPACIO PHOCLOUD", "Bienvenido de nuevo", "Envía archivos grandes y gestiona tus galerías profesionales.", "Entrar"],
        register: ["EMPIEZA GRATIS", "Crea tu cuenta", "Transfiere hasta 50 GB durante 24 horas y crea hasta tres galerías.", "Crear cuenta"],
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
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const data = await response.json();
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
        showSuccess(data.message);
        backButton.hidden = false;
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
                identifier: usernameInput.value.trim(),
                password: passwordInput.value
            });
            window.location.replace("/");
            return;
        }
        if (mode === "setup") {
            await request("/auth/setup", {
                username: usernameInput.value.trim(),
                password: passwordInput.value
            });
            window.location.replace("/");
            return;
        }
        if (mode === "register") {
            const data = await request("/auth/register", {
                displayName: byId("displayName").value.trim(),
                username: usernameInput.value.trim(),
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
        if (status.authenticated) return window.location.replace("/");
        setupRequired = status.setupRequired;
        if (setupRequired) mode = "setup";
        configureMode(mode);
    } catch {
        showError("No se pudo conectar con PHOcloud");
    }
}

initialize();
