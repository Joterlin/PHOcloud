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
    assert.match(dashboard, /id="showHome"/);
    assert.match(dashboard, /id="showTransfers"/);
    assert.match(dashboard, /id="showGalleries"/);
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
    assert.match(sendScript, /indexedDB\.open/);
    assert.match(sendScript, /requiresAccount|login\?mode=register/);
    assert.match(transfer, /href="\/enviar"/);
    assert.match(gallery, /href="\/enviar"/);
});
