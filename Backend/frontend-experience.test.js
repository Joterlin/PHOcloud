const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("la personalización muestra una galería viva y no expone el valor mágico cero", () => {
    const html = read("Frontend/index.html");
    const script = read("Frontend/script.js");
    const css = read("Frontend/style.css");
    assert.match(html, /id="editGalleryLivePreview"/);
    assert.match(html, /id="editLivePhotoGrid"/);
    assert.match(html, /VISTA PREVIA EN TIEMPO REAL/);
    assert.doesNotMatch(html, /0 permite seleccionar sin límite|Usa 0 si/);
    assert.match(html, /id="editSelectionLimit" type="number" min="1"/);
    assert.match(script, /function updateEditGalleryPreview\(\)/);
    assert.match(script, /galleryLifetimeDays/);
    assert.match(script, /function enhanceGalleryEditor\(\)/);
    assert.match(script, /data-edit-panel-target="cover"/);
    assert.match(script, /data-edit-preview-device="mobile"/);
    assert.match(script, /id="editCoverFocalPoint"/);
    assert.match(script, /data-edit-cover-style="immersive"/);
    assert.match(script, /editPreviewOriginalAction/);
    assert.match(script, /editPreviewFavoriteNotice/);
    assert.match(script, /scaleInput\.type = "number"/);
    assert.match(script, /editLiveLogo"\)\.addEventListener\("pointerdown"/);
    assert.match(script, /setEditSaveState\(true\)/);
    assert.match(css, /\.gallery-editor-layout/);
    assert.match(css, /\.gallery-preview-viewport\[data-preview-device=mobile\]/);
    assert.match(css, /#editCoverFocalPoint/);
});

test("el aviso de transferencia se oculta solo y la marca pública no usa una placa", () => {
    const script = read("Frontend/script.js");
    const galleryCss = read("public/gallery.css");
    assert.match(script, /transferResultHideTimer = setTimeout/);
    assert.match(script, /byId\("transferResult"\)\.hidden = true/);
    assert.doesNotMatch(galleryCss, /\.brand:has\(img:not\(\[hidden\]\)\) #brandText/);
    const brandPlate = galleryCss.match(/\.brand-plate \{([^}]+)\}/)?.[1] || "";
    assert.ok(brandPlate);
    assert.doesNotMatch(brandPlate, /border:|background:|box-shadow:/);
});

test("separación de experiencias y conversión sin segunda subida", () => {
    const dashboard = read("Frontend/index.html");
    const dashboardScript = read("Frontend/script.js");
    const send = read("public/send.html");
    const sendScript = read("public/send.js");
    const transfer = read("public/transfer.html");
    const gallery = read("public/gallery.html");
    assert.doesNotMatch(dashboard, /id="showHome"|TU ESPACIO DE TRABAJO|ACTIVIDAD RECIENTE/);
    assert.match(dashboard, /style\.css\?v=[^"\s]+/);
    assert.match(dashboard, /script\.js\?v=[^"\s]+/);
    assert.match(dashboard, /id="showTransfers"/);
    assert.match(dashboard, /id="showGalleries"/);
    assert.doesNotMatch(dashboard, /id="workspaceBrandButton"|id="workspaceAccountButton"/);
    assert.match(dashboard, /id="convertDialog"/);
    assert.match(dashboard, /id="transferGalleryPreview"/);
    assert.match(dashboardScript, /selectedFileIds/);
    assert.match(dashboardScript, /\/conversions/);
    assert.match(dashboardScript, /transfer\.galleryEligible \|\| hasActiveOrReadyConversion/);
    assert.match(dashboardScript, /function closeConvertDialog\(\) \{\s*byId\("convertDialog"\)\.close\(\);/);
    const conversionSubmit = dashboardScript.slice(
        dashboardScript.indexOf('byId("convertForm").addEventListener'),
        dashboardScript.indexOf('byId("toggleConvertFiles").addEventListener')
    );
    assert.match(conversionSubmit, /Content-Type": "application\/json"/);
    assert.doesNotMatch(conversionSubmit, /FormData|append\("files"/);
    assert.match(send, /id="guestFiles"/);
    assert.match(send, /No necesitas registrarte ni iniciar sesión/);
    assert.match(sendScript, /\/transfers\/multipart/);
    assert.match(sendScript, /retryPart/);
    assert.match(send, /name="shareMethod" value="link"/);
    assert.match(send, /name="shareMethod" value="email"/);
    assert.match(send, /id="recipientEmail"/);
    assert.match(send, /id="senderEmail"/);
    assert.match(send, /id="senderCode"/);
    assert.match(sendScript, /requestSenderVerification/);
    assert.match(sendScript, /confirmSenderCode/);
    assert.match(sendScript, /async function emailTransfer/);
    assert.match(sendScript, /id="resultLink"|resultLink/);
    assert.match(send, /id="convertGuestTransfer"/);
    assert.match(send, /id="conversionOffer"[^>]+hidden/);
    assert.match(send, /id="conversionPreview"/);
    assert.match(sendScript, /isPhotoOnlyGallerySelection/);
    assert.match(sendScript, /byId\("conversionOffer"\)\.hidden = !canConvert/);
    assert.match(sendScript, /login\?mode=register/);
    assert.match(sendScript, /claimTransfer/);
    assert.match(dashboardScript, /\/claim/);
    assert.match(transfer, /href="\/enviar"/);
    assert.match(gallery, /href="\/enviar"/);
    assert.match(gallery, /data-gallery-view="compact"/);
    assert.match(gallery, /data-gallery-view="standard"/);
    assert.match(gallery, /data-gallery-view="large"/);
    assert.match(read("public/gallery.js"), /straclase-gallery-view/);
});

test("el registro y el acceso usan únicamente el correo electrónico", () => {
    const login = read("Frontend/login.html");
    const loginScript = read("Frontend/login.js");
    const loginCss = read("Frontend/login.css");
    const dashboardScript = read("Frontend/script.js");
    assert.doesNotMatch(login, /id="username"|id="usernamePrefix"|Nombre de usuario/);
    assert.match(login, /id="email" type="email"/);
    assert.match(login, /id="googleAuthButton"[^>]+href="\/auth\/google"/);
    assert.match(login, /Continuar con Google/);
    assert.match(login, /aceptas los/);
    assert.match(login, /login\.css\?v=[^"\s]+/);
    assert.match(login, /login\.js\?v=[^"\s]+/);
    assert.doesNotMatch(loginScript, /username|@usuario|RESERVED_USERNAMES/);
    assert.match(loginScript, /email: emailInput\.value\.trim\(\)/);
    assert.match(loginScript, /status\.googleAuthEnabled === true/);
    assert.match(loginScript, /oauthError/);
    assert.doesNotMatch(login, /GOOGLE_CLIENT_SECRET|GOCSPX_/);
    assert.match(loginScript, /AbortSignal\.timeout\(30_000\)/);
    assert.match(loginScript, /Straclase tardó demasiado en responder/);
    assert.match(loginScript, /scrollIntoView\(\{ behavior: "smooth", block: "nearest" \}\)/);
    assert.match(loginCss, /@media \(min-width: 851px\)[\s\S]*#authError,[\s\S]*#authSuccess[\s\S]*position: fixed/);
    assert.doesNotMatch(dashboardScript, /accountData\.username/);
});

test("la identidad Straclase usa la figura desplazada sin invadir marcas de clientes", () => {
    const pages = [
        "Frontend/index.html",
        "Frontend/login.html",
        "public/send.html",
        "public/gallery.html",
        "public/transfer.html",
        "public/privacy.html",
        "public/terms.html"
    ];
    for (const page of pages) {
        const html = read(page);
        assert.match(html, /\/assets\/straclase-favicon\.svg/);
        assert.match(html, /\/assets\/straclase-mark\.png/);
    }
    const favicon = read("public/assets/straclase-favicon.svg");
    assert.match(favicon, /M44 24l7-7 7 7-7 7z/);
    assert.equal(fs.statSync(path.join(root, "public/assets/straclase-mark.png")).size > 0, true);
    const galleryScript = read("public/gallery.js");
    const transferScript = read("public/transfer.js");
    assert.match(galleryScript, /usesSystemBrand = !data\.logoUrl/);
    assert.match(galleryScript, /systemBrandLogo\.hidden = !usesSystemBrand/);
    assert.match(transferScript, /usesSystemBrand = !data\.logoUrl/);
    assert.match(transferScript, /transferSystemLogo"\)\.hidden = !usesSystemBrand/);
});

test("Mi marca ofrece una vista previa útil y protege el contraste público", () => {
    const dashboard = read("Frontend/index.html");
    const dashboardScript = read("Frontend/script.js");
    const dashboardCss = read("Frontend/style.css");
    const galleryScript = read("public/gallery.js");
    const galleryCss = read("public/gallery.css");
    const transferScript = read("public/transfer.js");

    assert.match(dashboard, /id="profileBrandLivePreview"/);
    assert.match(dashboard, /id="profileLiveLogo"/);
    assert.match(dashboard, /data-adjust-target="profileLogoScale"/);
    assert.match(dashboard, /data-position-group="profileLogoPositionX"/);
    assert.match(dashboard, /data-position-group="profileLogoPositionY"/);
    assert.doesNotMatch(dashboard, /id="profileLogo(?:Scale|PositionX|PositionY)" type="range"/);
    assert.match(dashboardScript, /function updateProfileBrandPreview\(\)/);
    assert.match(dashboardScript, /profileLiveLogo"\)\.addEventListener\("pointerdown"/);
    assert.match(dashboardScript, /function readableAccent\(/);
    assert.match(dashboardScript, /--preview-accent-readable/);
    assert.match(dashboardCss, /\.brand-editor-layout/);
    assert.match(dashboardCss, /--brand-preview-accent-text/);
    assert.match(galleryScript, /--accent-foreground/);
    assert.match(galleryScript, /--accent-readable/);
    assert.match(galleryCss, /color: var\(--accent-foreground\)/);
    assert.match(transferScript, /--accent-foreground/);
});

test("la analítica es consentida, privada y muestra únicamente datos reales", () => {
    const dashboard = read("Frontend/index.html");
    const dashboardScript = read("Frontend/script.js");
    const login = read("Frontend/login.html");
    const loginScript = read("Frontend/login.js");
    const send = read("public/send.html");
    const analytics = read("public/analytics.js");
    const privacy = read("public/privacy.html");
    assert.match(dashboard, /id="analyticsButton"[^>]+hidden/);
    assert.match(dashboard, /id="analyticsDialog"/);
    assert.match(dashboard, /analytics\.js\?v=/);
    assert.match(login, /analytics\.js\?v=/);
    assert.match(send, /analytics\.js\?v=/);
    assert.match(dashboardScript, /fetch\("\/analytics\/summary"\)/);
    assert.match(dashboardScript, /accountData\.analyticsAdmin !== true/);
    assert.match(dashboardScript, /straclaseAnalytics\?\.reset\(\)/);
    assert.match(loginScript, /capture\("signup_started"\)/);
    assert.match(loginScript, /capture\("signup_completed"\)/);
    assert.match(loginScript, /capture\("login_completed"\)/);
    assert.match(analytics, /autocapture: false/);
    assert.match(analytics, /disable_session_recording: true/);
    assert.match(analytics, /opt_out_capturing_by_default: true/);
    assert.match(analytics, /consent\(\) !== "granted"/);
    assert.doesNotMatch(read("public/gallery.html"), /analytics\.js/);
    assert.doesNotMatch(read("public/transfer.html"), /analytics\.js/);
    assert.match(privacy, /Cookies y analítica/);
    assert.match(privacy, /No se envían contraseñas, tokens, datos de pago, imágenes, archivos ni contenido privado/);
});
