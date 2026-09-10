const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("la personalización muestra una galería viva y no expone el valor mágico cero", () => {
    const html = read("Frontend/index.html");
    const script = read("Frontend/script.js");
    assert.match(html, /id="editGalleryLivePreview"/);
    assert.match(html, /id="editLivePhotoGrid"/);
    assert.match(html, /VISTA PREVIA EN TIEMPO REAL/);
    assert.doesNotMatch(html, /0 permite seleccionar sin límite|Usa 0 si/);
    assert.match(html, /id="editSelectionLimit" type="number" min="1"/);
    assert.match(script, /function updateEditGalleryPreview\(\)/);
    assert.match(script, /galleryLifetimeDays/);
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
    assert.match(dashboardScript, /selectedFileIds/);
    assert.match(dashboardScript, /\/conversions/);
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
    assert.doesNotMatch(sendScript, /indexedDB|login\?mode=register/);
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
    assert.match(login, /login\.css\?v=[^"\s]+/);
    assert.match(login, /login\.js\?v=[^"\s]+/);
    assert.doesNotMatch(loginScript, /username|@usuario|RESERVED_USERNAMES/);
    assert.match(loginScript, /email: emailInput\.value\.trim\(\)/);
    assert.match(loginScript, /AbortSignal\.timeout\(30_000\)/);
    assert.match(loginScript, /Straclase tardó demasiado en responder/);
    assert.match(loginScript, /scrollIntoView\(\{ behavior: "smooth", block: "nearest" \}\)/);
    assert.match(loginCss, /@media \(min-width: 851px\)[\s\S]*#authError,[\s\S]*#authSuccess[\s\S]*position: fixed/);
    assert.doesNotMatch(dashboardScript, /accountData\.username/);
});
