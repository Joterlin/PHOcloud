const byId = (id) => document.getElementById(id);

const uploadButton = byId("uploadButton");
const createDeliveryButton = byId("createDeliveryButton");
const logoutButton = byId("logoutButton");
const clientName = byId("clientName");
const fileInput = byId("fileInput");
const selectionPanel = byId("selectionPanel");
const selectionPreview = byId("selectionPreview");
const selectionSummary = byId("selectionSummary");
const addMorePhotos = byId("addMorePhotos");
const clearSelectionButton = byId("clearSelection");
const result = byId("result");
const linkInput = byId("linkInput");
const copyButton = byId("copyButton");
const openButton = byId("openButton");
const uploadStatus = byId("uploadStatus");
const uploadProgress = byId("uploadProgress");
const uploadStatusText = byId("uploadStatusText");
const photoCount = byId("photoCount");
const errorMessage = byId("errorMessage");
const deliveriesList = byId("deliveriesList");
const deliveriesEmpty = byId("deliveriesEmpty");
const deleteAllDeliveriesButton = byId("deleteAllDeliveries");
const deleteDialog = byId("deleteDialog");
const deleteDialogTitle = byId("deleteDialogTitle");
const deleteDialogMessage = byId("deleteDialogMessage");
const deleteDialogError = byId("deleteDialogError");
const cancelDeleteDialogButton = byId("cancelDeleteDialog");
const confirmDeleteButton = byId("confirmDelete");
const brandSettingsButton = byId("brandSettingsButton");
const brandDialog = byId("brandDialog");
const brandForm = byId("brandForm");
const brandDialogError = byId("brandDialogError");
const saveBrandButton = byId("saveBrand");
const editDialog = byId("editDialog");
const editDeliveryForm = byId("editDeliveryForm");
const editDialogError = byId("editDialogError");
const saveDeliveryButton = byId("saveDelivery");
const accountButton = byId("accountButton");
const accountDialog = byId("accountDialog");
const analyticsButton = byId("analyticsButton");
const analyticsDialog = byId("analyticsDialog");
const transferCreator = byId("transferCreator");
const transfersPanel = byId("transfersPanel");

let MAX_FILES = 500;
let MAX_FILE_SIZE = 50 * 1024 * 1024;
let MAX_VIDEO_SIZE = 500 * 1024 * 1024;
let MAX_TOTAL_SIZE = 10 * 1024 * 1024 * 1024;
let selectedFiles = [];
let previewUrls = new Map();
let coverFile = null;
let currentLink = "";
let brandProfile = null;
let currentEditDelivery = null;
let pendingDeletion = null;
let deletionInProgress = false;
let accountData = null;
let resultHideTimer = null;
let transferResultHideTimer = null;
let selectedTransferFiles = [];
let currentTransferLink = "";
let currentTransferId = "";
let latestDeliveries = [];
let latestTransfers = [];
let conversionContext = null;
let transferCapabilities = {
    maxFileSize: 5 * 1024 * 1024 * 1024,
    maxTotalSize: 5 * 1024 * 1024 * 1024,
    maxFiles: 500,
    acceptingNewTransfers: true
};

function elementFromHtml(markup) {
    const template = document.createElement("template");
    template.innerHTML = markup.trim();
    return template.content.firstElementChild;
}

function enhanceGalleryEditor() {
    const form = editDeliveryForm;
    const heading = form.querySelector(":scope > .edit-dialog-heading");
    const oldActions = form.querySelector(":scope > .edit-dialog-actions");
    const generalFields = form.querySelector(":scope > .options-grid");
    const permissionList = form.querySelector(":scope > .edit-permission-list");
    const selectionAdmin = form.querySelector(":scope > .selection-admin");
    const brandSection = form.querySelector(":scope > .edit-brand-section");
    const photoManager = form.querySelector(":scope > .photo-manager");
    const error = form.querySelector(":scope > #editDialogError");
    const livePreview = byId("editGalleryLivePreview");
    const customizerControls = brandSection.querySelector(".gallery-customizer-controls");
    const designGrid = customizerControls.querySelector(".options-grid");

    form.className = "gallery-editor";
    heading.className = "gallery-editor-header";
    heading.querySelector("div").className = "gallery-editor-title";
    const state = elementFromHtml('<div class="gallery-editor-save-state" role="status"><span id="editSaveStateDot"></span><span id="editSaveState">Todo guardado</span></div>');
    const headerActions = document.createElement("div");
    headerActions.className = "gallery-editor-header-actions";
    const openGallery = elementFromHtml('<button id="editPreviewOpenGallery" class="secondary" type="button">Abrir galería ↗</button>');
    headerActions.append(openGallery, byId("cancelEditDialog"), byId("saveDelivery"), byId("closeEditDialog"));
    headerActions.querySelector("#cancelEditDialog").textContent = "Cerrar";
    headerActions.querySelector("#saveDelivery").textContent = "Guardar cambios";
    heading.append(state, headerActions);
    oldActions.remove();

    const layout = document.createElement("div");
    layout.className = "gallery-editor-layout";
    const nav = elementFromHtml(`<nav class="gallery-editor-nav" aria-label="Secciones del editor">
        <button type="button" class="is-active" data-edit-panel-target="content"><span>01</span>Contenido</button>
        <button type="button" data-edit-panel-target="cover"><span>02</span>Portada</button>
        <button type="button" data-edit-panel-target="design"><span>03</span>Diseño</button>
        <button type="button" data-edit-panel-target="brand"><span>04</span>Marca</button>
        <button type="button" data-edit-panel-target="access"><span>05</span>Acceso</button>
    </nav>`);
    const controls = document.createElement("div");
    controls.className = "gallery-editor-controls";
    const panel = (name, eyebrow, title, description) => {
        const section = elementFromHtml(`<section class="gallery-editor-panel" data-edit-panel="${name}">
            <div class="editor-panel-heading"><span>${eyebrow}</span><h3>${title}</h3><p>${description}</p></div>
        </section>`);
        if (name !== "content") section.hidden = true;
        controls.appendChild(section);
        return section;
    };
    const contentPanel = panel("content", "CONTENIDO", "Los datos de la entrega", "Cambia el título, el mensaje y las fotografías que verá tu cliente.");
    const coverPanel = panel("cover", "PORTADA", "La primera impresión", "Elige una composición y encuadra la imagen directamente sobre la vista previa.");
    const designPanel = panel("design", "DISEÑO", "Ritmo y color", "Escoge cómo se ordenan las fotografías y la atmósfera de la página.");
    const brandPanel = panel("brand", "MARCA", "Hazla reconocible", "Combina el nombre de tu estudio, tu imagen y tus enlaces.");
    const accessPanel = panel("access", "ACCESO", "Privacidad y entrega", "Decide qué puede ver, descargar y seleccionar tu cliente.");
    layout.append(nav, controls);
    heading.after(form.querySelector("#editDeliveryId"), layout);

    const passwordField = byId("editPassword").closest(".field");
    contentPanel.append(generalFields, photoManager);
    passwordField.remove();
    photoManager.classList.add("editor-photo-manager");
    const intro = document.createElement("p");
    intro.className = "editor-help";
    intro.textContent = "Pulsa «Portada» sobre una fotografía para cambiar la imagen principal.";
    byId("editPhotos").before(intro);

    const coverSelectLabel = byId("editCoverStyle").closest(".field");
    coverSelectLabel.hidden = true;
    coverPanel.appendChild(coverSelectLabel);
    const coverPicker = elementFromHtml(`<div class="cover-style-grid" role="group" aria-label="Diseño de portada">
        <button type="button" data-edit-cover-style="immersive"><i class="cover-style-sample immersive"></i><strong>Inmersiva</strong><small>Imagen a pantalla completa</small></button>
        <button type="button" data-edit-cover-style="split"><i class="cover-style-sample split"></i><strong>Editorial</strong><small>Texto e imagen divididos</small></button>
        <button type="button" data-edit-cover-style="frame"><i class="cover-style-sample frame"></i><strong>Enmarcada</strong><small>Imagen con aire alrededor</small></button>
        <button type="button" data-edit-cover-style="minimal"><i class="cover-style-sample minimal"></i><strong>Sutil</strong><small>Una portada más suave</small></button>
        <button type="button" data-edit-cover-style="none"><i class="cover-style-sample none"></i><strong>Solo texto</strong><small>Sin fotografía</small></button>
    </div>`);
    coverPanel.appendChild(coverPicker);
    const coverPositionX = byId("editCoverPositionX");
    const coverPositionY = byId("editCoverPositionY");
    coverPositionX.closest(".field").hidden = true;
    coverPositionY.closest(".field").hidden = true;
    coverPanel.append(coverPositionX.closest(".field"), coverPositionY.closest(".field"));
    const focalControls = elementFromHtml(`<div id="editCoverFocusControls" class="focal-controls">
        <div><strong>Encuadre de la portada</strong><small>Arrastra el punto sobre la imagen o elige una posición.</small></div>
        <div class="focal-presets" data-cover-focal-presets>
            <button type="button" data-cover-x="25" data-cover-y="25" aria-label="Arriba izquierda"></button><button type="button" data-cover-x="50" data-cover-y="25" aria-label="Arriba centro"></button><button type="button" data-cover-x="75" data-cover-y="25" aria-label="Arriba derecha"></button>
            <button type="button" data-cover-x="25" data-cover-y="50" aria-label="Centro izquierda"></button><button type="button" data-cover-x="50" data-cover-y="50" aria-label="Centro"></button><button type="button" data-cover-x="75" data-cover-y="50" aria-label="Centro derecha"></button>
            <button type="button" data-cover-x="25" data-cover-y="75" aria-label="Abajo izquierda"></button><button type="button" data-cover-x="50" data-cover-y="75" aria-label="Abajo centro"></button><button type="button" data-cover-x="75" data-cover-y="75" aria-label="Abajo derecha"></button>
        </div>
    </div>`);
    coverPanel.appendChild(focalControls);

    const stylePicker = designGrid.querySelector(".style-picker");
    stylePicker.classList.remove("field-wide");
    designPanel.appendChild(stylePicker);
    const colorGrid = document.createElement("div");
    colorGrid.className = "editor-color-grid";
    for (const id of ["editBackgroundColor", "editAccentColor"]) {
        const label = byId(id).closest(".field");
        label.className = "color-control";
        const title = label.firstChild.textContent.trim();
        label.firstChild.remove();
        const wrapper = document.createElement("div");
        const output = document.createElement("output");
        output.id = id === "editBackgroundColor" ? "editBackgroundValue" : "editAccentValue";
        const caption = document.createElement("label");
        caption.htmlFor = id;
        caption.textContent = title;
        label.insertBefore(caption, label.firstChild);
        wrapper.append(byId(id), output);
        label.appendChild(wrapper);
        colorGrid.appendChild(label);
    }
    designPanel.append(colorGrid, elementFromHtml('<p id="editContrastStatus" class="contrast-status"></p>'));

    const brandNameField = byId("editBrandName").closest(".field");
    const logoField = byId("editLogo").closest(".field");
    brandNameField.classList.remove("field-wide");
    logoField.classList.remove("field-wide");
    brandPanel.append(byId("editLogoPreview"), brandNameField, logoField);
    const scaleInput = byId("editLogoScale");
    const xInput = byId("editLogoPositionX");
    const yInput = byId("editLogoPositionY");
    const oldScale = scaleInput.closest(".field");
    const oldX = xInput.closest(".field");
    const oldY = yInput.closest(".field");
    scaleInput.type = "number";
    xInput.type = "hidden";
    yInput.type = "hidden";
    const logoAdjuster = elementFromHtml(`<div id="editLogoControls" class="logo-adjuster" hidden>
        <div class="logo-adjuster-heading"><div><strong>Ajustar imagen</strong><small>También puedes arrastrarla en la portada.</small></div><button type="button" class="secondary small-button" data-reset-edit-logo>Restablecer</button></div>
        <div class="logo-adjuster-grid">
            <div class="logo-size-control"><label for="editLogoScale">Tamaño</label><div class="number-stepper"><button type="button" data-adjust-target="editLogoScale" data-delta="-5" aria-label="Reducir tamaño">−</button><span data-logo-scale-slot></span><span>%</span><button type="button" data-adjust-target="editLogoScale" data-delta="5" aria-label="Aumentar tamaño">＋</button></div></div>
            <div class="position-control"><span>Posición horizontal</span><div class="position-buttons" data-position-group="editLogoPositionX"><button type="button" data-position-value="20">Izquierda</button><button type="button" data-position-value="50">Centro</button><button type="button" data-position-value="80">Derecha</button></div><span data-logo-x-slot></span></div>
            <div class="position-control"><span>Posición vertical</span><div class="position-buttons" data-position-group="editLogoPositionY"><button type="button" data-position-value="25">Arriba</button><button type="button" data-position-value="50">Centro</button><button type="button" data-position-value="75">Abajo</button></div><span data-logo-y-slot></span></div>
        </div>
    </div>`);
    logoAdjuster.querySelector("[data-logo-scale-slot]").replaceWith(scaleInput);
    logoAdjuster.querySelector("[data-logo-x-slot]").replaceWith(xInput);
    logoAdjuster.querySelector("[data-logo-y-slot]").replaceWith(yInput);
    oldScale.remove(); oldX.remove(); oldY.remove();
    brandPanel.append(logoAdjuster, byId("removeEditLogoLabel"), byId("editLinksList").closest(".link-editor"));

    accessPanel.append(permissionList, passwordField, byId("removePasswordLabel"), selectionAdmin);
    permissionList.querySelectorAll(".permission-option small").forEach((small) => {
        if (!small.textContent) small.remove();
    });

    const previewStage = elementFromHtml(`<section class="gallery-editor-preview-stage" aria-label="Vista previa de la galería">
        <div class="preview-toolbar"><div><span class="live-dot"></span><strong>Vista previa en tiempo real</strong><small>Los cambios aún no se han publicado</small></div><div class="preview-device-switch" role="group" aria-label="Tamaño de vista previa"><button type="button" data-edit-preview-device="desktop" class="is-active" aria-pressed="true">Escritorio</button><button type="button" data-edit-preview-device="mobile" aria-pressed="false">Móvil</button></div></div>
        <div class="gallery-preview-viewport" data-preview-device="desktop"></div>
    </section>`);
    previewStage.querySelector(".gallery-preview-viewport").appendChild(livePreview);
    livePreview.querySelector(".live-preview-label")?.remove();
    const cover = livePreview.querySelector("#editCoverPreview");
    cover.querySelector("#editCoverPreviewImage").after(elementFromHtml('<button id="editCoverFocalPoint" type="button" aria-label="Punto de enfoque. Arrastra para cambiar el encuadre"><span></span></button>'));
    cover.prepend(elementFromHtml('<div id="editPreviewVisibilityNotice" class="edit-preview-disabled" hidden><strong>Galería desactivada</strong><span>El cliente verá un aviso hasta que permitas la visualización.</span></div>'));
    livePreview.querySelector("#editLiveMessage").after(elementFromHtml('<div class="edit-preview-actions"><span id="editPreviewOriginalAction">Descargar originales</span><span id="editPreviewWebAction">Calidad reducida</span><span id="editPreviewFavoriteAction">♡ Seleccionar</span></div>'));
    const collection = livePreview.querySelector(".edit-preview-collection");
    collection.firstElementChild.outerHTML = '<div class="edit-preview-collection-heading"><span>TU GALERÍA</span><strong>Tus fotografías, en un solo lugar.</strong></div>';
    livePreview.querySelector("#editLivePhotoGrid").before(elementFromHtml('<div id="editPreviewFavoriteNotice" class="edit-preview-favorite-notice"><span>♡</span> Tu cliente podrá seleccionar sus favoritas</div>'));
    collection.appendChild(elementFromHtml('<p class="edit-preview-footer">Entrega privada creada con Straclase</p>'));

    layout.appendChild(previewStage);
    error.classList.add("gallery-editor-error");
    form.appendChild(error);
    brandSection.remove();

    for (const button of nav.querySelectorAll("[data-edit-panel-target]")) {
        button.addEventListener("click", () => {
            const name = button.dataset.editPanelTarget;
            nav.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button));
            controls.querySelectorAll("[data-edit-panel]").forEach((item) => { item.hidden = item.dataset.editPanel !== name; });
            if (window.innerWidth < 900) controls.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }
    openGallery.addEventListener("click", () => {
        if (currentEditDelivery) window.open(`/s/${encodeURIComponent(currentEditDelivery.id)}`, "_blank", "noopener");
    });
}

enhanceGalleryEditor();
const blockedTransferExtensions = new Set([
    "exe", "msi", "msp", "com", "scr", "bat", "cmd", "ps1", "vbs",
    "js", "jar", "apk", "app", "dmg"
]);

const builderNavigation = [...document.querySelectorAll("[data-builder-target]")];
const builderPanels = [...document.querySelectorAll("[data-builder-panel]")];

function showBuilderPanel(name, focusPanel = false) {
    for (const panel of builderPanels) {
        panel.hidden = panel.dataset.builderPanel !== name;
    }
    for (const item of builderNavigation) {
        const active = item.dataset.builderTarget === name;
        item.classList.toggle("is-active", active);
        if (active) item.setAttribute("aria-current", "step");
        else item.removeAttribute("aria-current");
    }
    if (focusPanel && window.innerWidth <= 760) {
        document.querySelector(`[data-builder-panel="${name}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

for (const item of builderNavigation) {
    item.addEventListener("click", () => {
        showBuilderPanel(item.dataset.builderTarget, true);
    });
}
for (const item of document.querySelectorAll("[data-builder-next]")) {
    item.addEventListener("click", () => {
        showBuilderPanel(item.dataset.builderNext, true);
    });
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.hidden = false;
}

function hideError() {
    errorMessage.hidden = true;
}

async function readResponse(response) {
    if (response.status === 204) return {};
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
        window.location.replace("/login");
        throw new Error("La sesión ha caducado");
    }
    if (!response.ok) {
        const error = new Error(data.error || "No se pudo completar la operación");
        Object.assign(error, data);
        throw error;
    }
    return data;
}

function dateInputToIso(value) {
    if (!value) return "";
    const date = new Date(`${value}T23:59:59.999`);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function isoToDateInput(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function dateDaysFromNow(days) {
    const date = new Date();
    date.setDate(date.getDate() + Number(days));
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function updateExpiryChoice() {
    const choice = byId("editExpiryChoice").value;
    const exactField = byId("editExpiresAtField");
    const exactInput = byId("editExpiresAt");
    exactField.hidden = choice !== "custom";
    exactInput.required = choice === "custom";
    if (!choice) exactInput.value = "";
    else if (choice !== "custom") exactInput.value = dateDaysFromNow(choice);
}

byId("editExpiryChoice").addEventListener("change", updateExpiryChoice);
byId("editExpiresAt").min = dateDaysFromNow(1);

function galleryLifetimeDays() {
    const days = Number(accountData?.usage?.galleryLifetimeDays);
    return Number.isFinite(days) && days > 0 ? days : null;
}

function applyGalleryExpiryPolicy() {
    const maxDays = galleryLifetimeDays();
    const createInput = byId("expiresAt");
    const editInput = byId("editExpiresAt");
    const maximumDate = maxDays ? dateDaysFromNow(maxDays) : "";
    createInput.min = dateDaysFromNow(1);
    createInput.max = maximumDate;
    editInput.max = maximumDate;
    for (const option of byId("editExpiryChoice").querySelectorAll("[data-paid-expiry]")) {
        option.hidden = Boolean(maxDays);
        option.disabled = Boolean(maxDays);
    }
    if (maxDays) {
        if (!createInput.value || createInput.value > maximumDate) createInput.value = maximumDate;
        byId("createExpiryHelp").textContent = `El plan gratuito mantiene cada galería un máximo de ${maxDays} días.`;
        byId("editExpiryHelp").textContent = `En el plan gratuito la galería puede estar disponible un máximo de ${maxDays} días.`;
        const choice = byId("editExpiryChoice");
        if (!choice.value || Number(choice.value) > maxDays) choice.value = String(maxDays);
        if (!editInput.value || editInput.value > maximumDate) editInput.value = maximumDate;
        updateExpiryChoice();
    } else {
        byId("createExpiryHelp").textContent = "La galería dejará de estar disponible al finalizar ese día.";
        byId("editExpiryHelp").textContent = "Cuando caduque, el enlace dejará de mostrar la galería.";
    }
}

function syncSelectionLimit(checkboxId, inputId) {
    const enabled = byId(checkboxId).checked;
    const input = byId(inputId);
    input.disabled = !enabled;
    input.required = enabled;
    input.closest("label")?.classList.toggle("is-disabled", !enabled);
}

for (const [checkboxId, inputId] of [
    ["favoritesEnabled", "selectionLimit"],
    ["editFavoritesEnabled", "editSelectionLimit"]
]) {
    byId(checkboxId).addEventListener("change", () => syncSelectionLimit(checkboxId, inputId));
    syncSelectionLimit(checkboxId, inputId);
}

function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Fecha no disponible";
    return new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric"
    }).format(date);
}

function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function isAcceptedFile(file) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    return file.type.startsWith("image/") || file.type.startsWith("video/")
        || ["jpg", "jpeg", "png", "gif", "webp", "avif", "heic", "heif", "mp4", "mov", "m4v", "webm"]
            .includes(extension);
}

function isVideoFile(file) {
    return file.type.startsWith("video/")
        || ["mp4", "mov", "m4v", "webm"].includes(file.name.split(".").pop()?.toLowerCase());
}

uploadButton.addEventListener("click", () => fileInput.click());
addMorePhotos.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
    addSelectedFiles([...fileInput.files]);
    fileInput.value = "";
});

function addSelectedFiles(files) {
    hideError();
    const invalid = files.find((file) => !isAcceptedFile(file));
    if (invalid) return showError(`${invalid.name} no es un archivo compatible`);
    const oversized = files.find((file) => file.size > (isVideoFile(file) ? MAX_VIDEO_SIZE : MAX_FILE_SIZE));
    if (oversized) return showError(`${oversized.name} supera ${isVideoFile(oversized) ? "500 MB" : "50 MB"}`);

    const existing = new Set(selectedFiles.map(fileKey));
    const unique = files.filter((file) => !existing.has(fileKey(file)));
    if (selectedFiles.length + unique.length > MAX_FILES) {
        return showError(`Cada entrega admite como máximo ${MAX_FILES} fotografías`);
    }
    const newTotal = [...selectedFiles, ...unique]
        .reduce((sum, file) => sum + file.size, 0);
    if (newTotal > MAX_TOTAL_SIZE) {
        return showError("La selección supera el límite total de 10 GB");
    }

    selectedFiles.push(...unique);
    if (!coverFile) coverFile = selectedFiles.find((file) => !isVideoFile(file)) || null;
    renderSelection();
}

function fileKey(file) {
    return `${file.name}:${file.size}:${file.lastModified}`;
}

function previewUrl(file) {
    if (!previewUrls.has(file)) {
        previewUrls.set(file, URL.createObjectURL(file));
    }
    return previewUrls.get(file);
}

function renderSelection() {
    selectionPreview.replaceChildren();
    selectionPanel.hidden = selectedFiles.length === 0;
    uploadButton.hidden = selectedFiles.length > 0;
    const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    selectionSummary.textContent = `${selectedFiles.length} ${
        selectedFiles.length === 1 ? "fotografía" : "fotografías"
    } · ${formatBytes(totalSize)}`;
    document.querySelector('[data-builder-target="photos"]')
        ?.classList.toggle("has-content", selectedFiles.length > 0);

    selectedFiles.forEach((file, index) => {
        const card = document.createElement("article");
        card.className = "selection-photo";
        if (file === coverFile) card.classList.add("is-cover");

        const image = document.createElement(isVideoFile(file) ? "video" : "img");
        image.src = previewUrl(file);
        if (isVideoFile(file)) {
            image.muted = true;
            image.preload = "metadata";
        } else image.alt = file.name;

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove-selection";
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Quitar ${file.name}`);
        remove.addEventListener("click", () => removeSelectedFile(index));

        card.append(image);
        card.append(remove);
        selectionPreview.appendChild(card);
    });
}

function removeSelectedFile(index) {
    const [removed] = selectedFiles.splice(index, 1);
    const url = previewUrls.get(removed);
    if (url) URL.revokeObjectURL(url);
    previewUrls.delete(removed);
    if (coverFile === removed) coverFile = selectedFiles.find((file) => !isVideoFile(file)) || null;
    renderSelection();
}

function clearSelection() {
    for (const url of previewUrls.values()) URL.revokeObjectURL(url);
    previewUrls.clear();
    selectedFiles = [];
    coverFile = null;
    renderSelection();
}

clearSelectionButton.addEventListener("click", clearSelection);

function appendDeliverySettings(formData) {
    formData.append("clientEmail", byId("clientEmail").value.trim());
    formData.append("message", byId("deliveryMessage").value.trim());
    formData.append("password", byId("galleryPassword").value);
    formData.append("expiresAt", dateInputToIso(byId("expiresAt").value));
    formData.append("viewingEnabled", byId("viewingEnabled").checked);
    formData.append("allowOriginalDownload", byId("allowOriginalDownload").checked);
    formData.append("allowWebDownload", byId("allowWebDownload").checked);
    formData.append("favoritesEnabled", byId("favoritesEnabled").checked);
    formData.append("selectionLimit", byId("favoritesEnabled").checked
        ? byId("selectionLimit").value
        : "0");
}

function linkList(prefix = "") {
    return byId(`${prefix || "brand"}LinksList`);
}

function normalizeLinkInput(value) {
    const trimmed = value.trim();
    if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
}

function addLinkRow(prefix = "", link = {}) {
    const container = linkList(prefix);
    if (container.children.length >= 30) return;
    const row = document.createElement("div");
    row.className = "link-row";
    row.draggable = true;

    const handle = document.createElement("span");
    handle.className = "link-handle";
    handle.textContent = "⠿";
    handle.title = "Arrastra para ordenar";

    const label = document.createElement("input");
    label.className = "link-label";
    label.type = "text";
    label.maxLength = 40;
    label.placeholder = "Nombre · Mi web";
    label.setAttribute("aria-label", "Nombre del enlace");
    label.value = link.label || "";

    const url = document.createElement("input");
    url.className = "link-url";
    url.type = "text";
    url.inputMode = "url";
    url.maxLength = 240;
    url.placeholder = "tuweb.com";
    url.setAttribute("aria-label", "Dirección del enlace");
    url.value = link.url || "";
    url.addEventListener("blur", () => {
        url.value = normalizeLinkInput(url.value);
    });

    const actions = document.createElement("div");
    actions.className = "link-actions";
    const remove = actionButton("×", "remove-link", () => {
        row.remove();
        if (prefix === "edit") updateEditGalleryPreview();
        if (prefix === "profile") updateProfileBrandPreview();
    });
    remove.title = "Eliminar enlace";
    remove.setAttribute("aria-label", "Eliminar enlace");
    actions.append(remove);
    row.append(handle, label, url, actions);

    row.addEventListener("dragstart", (event) => {
        if (event.target.closest("input, button")) {
            event.preventDefault();
            return;
        }
        row.classList.add("is-dragging");
        event.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => row.classList.remove("is-dragging"));
    row.addEventListener("dragover", (event) => {
        const dragging = container.querySelector(".is-dragging");
        if (!dragging || dragging === row) return;
        event.preventDefault();
        const after = event.clientY > row.getBoundingClientRect().top
            + row.getBoundingClientRect().height / 2;
        container.insertBefore(dragging, after ? row.nextSibling : row);
        if (prefix === "edit") updateEditGalleryPreview();
        if (prefix === "profile") updateProfileBrandPreview();
    });

    if (prefix === "edit") row.addEventListener("input", updateEditGalleryPreview);
    if (prefix === "profile") row.addEventListener("input", updateProfileBrandPreview);

    container.appendChild(row);
    if (prefix === "edit") updateEditGalleryPreview();
    if (prefix === "profile") updateProfileBrandPreview();
    label.focus();
}

function renderLinkRows(prefix, links = []) {
    const container = linkList(prefix);
    container.replaceChildren();
    for (const link of links) addLinkRow(prefix, link);
}

function readLinkRows(prefix = "") {
    return [...linkList(prefix).querySelectorAll(".link-row")]
        .map((row) => {
            const urlInput = row.querySelector(".link-url");
            const normalizedUrl = normalizeLinkInput(urlInput.value);
            urlInput.value = normalizedUrl;
            if (!normalizedUrl) return null;
            let label = row.querySelector(".link-label").value.trim();
            if (!label) {
                try { label = new URL(normalizedUrl).hostname.replace(/^www\./, ""); }
                catch { label = "Enlace"; }
                row.querySelector(".link-label").value = label;
            }
            return { label, url: normalizedUrl };
        })
        .filter(Boolean);
}

for (const [buttonId, prefix] of [
    ["addBrandLink", ""],
    ["addProfileLink", "profile"],
    ["addEditLink", "edit"]
]) {
    byId(buttonId).addEventListener("click", () => addLinkRow(prefix));
}

function createBrandValues(prefix = "") {
    const value = (name) => {
        const id = prefix
            ? `${prefix}${name}`
            : `${name[0].toLowerCase()}${name.slice(1)}`;
        return byId(id);
    };
    return {
        brandName: value("BrandName").value.trim(),
        accentColor: value("AccentColor").value,
        backgroundColor: value("BackgroundColor").value,
        logoScale: Number(byId(prefix ? `${prefix}LogoScale` : "brandLogoScale").value),
        logoPositionX: Number(byId(prefix ? `${prefix}LogoPositionX` : "brandLogoPositionX").value),
        logoPositionY: Number(byId(prefix ? `${prefix}LogoPositionY` : "brandLogoPositionY").value),
        socialLinks: readLinkRows(prefix)
    };
}

function appendBrandValues(formData, values) {
    for (const [key, value] of Object.entries(values)) {
        formData.append(key, Array.isArray(value) ? JSON.stringify(value) : value);
    }
}

function logoElements(prefix) {
    const base = prefix || "brand";
    return {
        preview: byId(prefix === "profile" ? "profileLogoPreview"
            : prefix === "edit" ? "editLogoPreview" : "createLogoPreview"),
        image: byId(prefix === "profile" ? "profileLogoImage"
            : prefix === "edit" ? "editLogoImage" : "createLogoImage"),
        scale: byId(`${base}LogoScale`),
        positionX: byId(`${base}LogoPositionX`),
        positionY: byId(`${base}LogoPositionY`)
    };
}

function updateLogoPreview(prefix = "") {
    const elements = logoElements(prefix);
    const numericX = Number(elements.positionX.value);
    const numericY = Number(elements.positionY.value);
    const numericScale = Number(elements.scale.value);
    const x = Number.isFinite(numericX) ? numericX : 50;
    const y = Number.isFinite(numericY) ? numericY : 50;
    const scale = Number.isFinite(numericScale) ? numericScale : 100;
    elements.image.style.transform = `translate(${x - 50}%, ${y - 50}%) scale(${scale / 100})`;
    if (prefix === "edit") updateEditGalleryPreview();
    if (prefix === "profile") updateProfileBrandPreview();
}

function previewSelectedLogo(prefix, file) {
    if (!file) return;
    const elements = logoElements(prefix);
    const objectUrl = URL.createObjectURL(file);
    elements.image.src = objectUrl;
    elements.image.onload = () => URL.revokeObjectURL(objectUrl);
    elements.preview.hidden = false;
    if (prefix === "profile") {
        byId("removeProfileLogo").checked = false;
        byId("profileLogoControls").hidden = false;
    }
    if (prefix === "edit") {
        byId("removeEditLogo").checked = false;
        byId("editLogoControls").hidden = false;
    }
    updateLogoPreview(prefix);
}

for (const prefix of ["", "profile", "edit"]) {
    const elements = logoElements(prefix);
    for (const input of [elements.scale, elements.positionX, elements.positionY]) {
        input.addEventListener("input", () => updateLogoPreview(prefix));
    }
}

for (const [inputId, prefix] of [
    ["brandLogo", ""],
    ["profileLogo", "profile"],
    ["editLogo", "edit"]
]) {
    byId(inputId).addEventListener("change", (event) => {
        previewSelectedLogo(prefix, event.target.files[0]);
    });
}

createDeliveryButton.addEventListener("click", createDelivery);

async function createDelivery() {
    const name = clientName.value.trim();
    if (!name) {
        showError("Escribe el nombre del cliente, empresa o evento");
        clientName.focus();
        return;
    }
    if (!selectedFiles.length) {
        showError("Selecciona fotografías");
        uploadButton.focus();
        return;
    }
    if (byId("favoritesEnabled").checked && !byId("selectionLimit").checkValidity()) {
        showError("Escribe cuántas fotografías puede seleccionar el cliente (entre 1 y 500)");
        showBuilderPanel("access", true);
        byId("selectionLimit").focus();
        return;
    }

    const formData = new FormData();
    formData.append("clientName", name);
    appendDeliverySettings(formData);
    appendBrandValues(formData, {
        ...createBrandValues(""),
        galleryStyle: byId("galleryStyle").value,
        coverStyle: byId("coverStyle").value,
        coverPositionX: byId("coverPositionX").value,
        coverPositionY: byId("coverPositionY").value
    });
    formData.append("coverIndex", selectedFiles.indexOf(coverFile));
    for (const file of selectedFiles) formData.append("photos", file);
    const logo = byId("brandLogo").files[0];
    if (logo) formData.append("logo", logo);

    try {
        setUploading(true);
        const data = await uploadWithProgress("/upload", formData);
        currentLink = data.link;
        linkInput.value = data.link;
        photoCount.textContent = `${data.photoCount} ${
            data.photoCount === 1 ? "fotografía" : "fotografías"
        } en la galería`;
        result.hidden = false;
        clearTimeout(resultHideTimer);
        resultHideTimer = setTimeout(() => { result.hidden = true; }, 6500);
        const createdDeliveryId = data.galleryId;
        clearSelection();
        clientName.value = "";
        byId("clientEmail").value = "";
        byId("deliveryMessage").value = "";
        byId("galleryPassword").value = "";
        byId("expiresAt").value = "";
        byId("brandLogo").value = "";
        await loadDeliveries();
        await loadAccount();
        await openEditDelivery(createdDeliveryId);
    } catch (error) {
        showError(error.message);
    } finally {
        setUploading(false);
    }
}

function uploadWithProgress(url, formData) {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", url);
        request.responseType = "json";
        request.upload.addEventListener("progress", (event) => {
            if (!event.lengthComputable) return;
            const percent = Math.round((event.loaded / event.total) * 100);
            uploadProgress.style.width = `${percent}%`;
            uploadStatusText.textContent = `Subiendo fotografías… ${percent}%`;
        });
        request.upload.addEventListener("load", () => {
            uploadProgress.style.width = "100%";
            uploadStatusText.textContent = "Optimizando imágenes y preparando la galería…";
        });
        request.addEventListener("load", () => {
            const data = request.response || {};
            if (request.status >= 200 && request.status < 300) resolve(data);
            else reject(new Error(data.error || "No se pudo crear la entrega"));
        });
        request.addEventListener("error", () => {
            reject(new Error("Se perdió la conexión. Tus archivos siguen seleccionados para que puedas reintentar sin buscarlos otra vez"));
        });
        request.send(formData);
    });
}

function setUploading(uploading) {
    const galleryLimitReached = Boolean(
        accountData?.usage
        && accountData.usage.galleryCount >= accountData.usage.galleryLimit
    );
    createDeliveryButton.disabled = uploading || galleryLimitReached;
    addMorePhotos.disabled = uploading;
    clearSelectionButton.disabled = uploading;
    uploadStatus.hidden = !uploading;
    hideError();
    if (uploading) {
        result.hidden = true;
        uploadProgress.style.width = "0%";
        uploadStatusText.textContent = "Preparando subida…";
    }
}

copyButton.addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(currentLink);
        copyButton.textContent = "Enlace copiado ✓";
        setTimeout(() => { copyButton.textContent = "Copiar enlace"; }, 1800);
    } catch {
        linkInput.select();
        showError("Copia el enlace seleccionado con Ctrl + C");
    }
});
openButton.addEventListener("click", () => window.open(currentLink, "_blank"));
logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    try { await fetch("/auth/logout", { method: "POST" }); }
    finally {
        window.straclaseAnalytics?.reset();
        window.location.replace("/login");
    }
});

function planLabel(plan) {
    return ({ free: "Plan gratuito", professional: "Plan Creador", studio: "Plan Pro" })[plan]
        || "Plan gratuito";
}

async function openBillingDestination(path, body, button) {
    const previousText = button.textContent;
    const billingMessage = byId("billingMessage");
    button.disabled = true;
    button.textContent = "Abriendo Stripe…";
    billingMessage.textContent = "Preparando una conexión segura con Stripe…";
    try {
        const response = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body || {})
        });
        const data = await readResponse(response);
        if (!data.url) throw new Error("Stripe no devolvió un enlace válido");
        window.location.assign(data.url);
    } catch (error) {
        billingMessage.textContent = error.message;
        button.disabled = false;
        button.textContent = previousText;
    }
}

for (const button of document.querySelectorAll("[data-billing-plan]")) {
    button.addEventListener("click", () => {
        const hasSubscription = Boolean(accountData?.billing?.portalAvailable);
        openBillingDestination(
            hasSubscription ? "/billing/portal-session" : "/billing/checkout-session",
            hasSubscription ? {} : { plan: button.dataset.billingPlan },
            button
        );
    });
}

byId("manageBillingButton").addEventListener("click", (event) => {
    openBillingDestination("/billing/portal-session", {}, event.currentTarget);
});

async function loadAccount() {
    const response = await fetch("/account");
    const data = await readResponse(response);
    accountData = data.account;
    window.straclaseAnalytics?.identify(accountData.analyticsDistinctId);
    analyticsButton.hidden = accountData.analyticsAdmin !== true;
    const usage = accountData.usage;
    const galleryPercent = Math.min(100,
        usage.galleryLimit ? usage.galleryCount / usage.galleryLimit * 100 : 0
    );
    const storagePercent = Math.min(100,
        usage.storageLimitBytes ? usage.storageBytes / usage.storageLimitBytes * 100 : 0
    );
    const transferPercent = Math.min(100,
        usage.transferStorageLimitBytes
            ? usage.transferStorageBytes / usage.transferStorageLimitBytes * 100
            : 0
    );
    byId("accountName").textContent = accountData.displayName || accountData.email;
    byId("accountPlan").textContent = `${planLabel(accountData.plan)} · ${usage.galleryCount}/${usage.galleryLimit} galerías`;
    byId("accountDisplayName").textContent = accountData.displayName || accountData.email;
    byId("accountEmail").textContent = accountData.email;
    byId("accountAvatar").textContent = (accountData.displayName || accountData.email).slice(0, 1).toUpperCase();
    byId("accountPlanBadge").textContent = planLabel(accountData.plan).replace("Plan ", "");
    byId("galleryUsageText").textContent = `${usage.galleryCount}/${usage.galleryLimit} galerías`;
    byId("galleryUsageBar").style.width = `${galleryPercent}%`;
    byId("storageUsageText").textContent = `${formatBytes(usage.storageBytes)} de ${formatBytes(usage.storageLimitBytes)}`;
    byId("storageUsageBar").style.width = `${storagePercent}%`;
    byId("transferUsageText").textContent = `${formatBytes(usage.transferStorageBytes)} de ${formatBytes(usage.transferStorageLimitBytes)}`;
    byId("transferUsageBar").style.width = `${transferPercent}%`;
    const monthlyTransferPercent = Math.min(100,
        usage.monthlyUploadLimitBytes
            ? (usage.monthlyUploadBytes + usage.monthlyReservedUploadBytes)
                / usage.monthlyUploadLimitBytes * 100
            : 0
    );
    byId("monthlyTransferUsageText").textContent = `${formatBytes(usage.monthlyUploadBytes + usage.monthlyReservedUploadBytes)} de ${formatBytes(usage.monthlyUploadLimitBytes)}`;
    byId("monthlyTransferUsageBar").style.width = `${monthlyTransferPercent}%`;
    const backupStatus = accountData.backups || { enabled: false };
    byId("backupStatusText").textContent = backupStatus.enabled
        ? (backupStatus.lastSuccessAt
            ? `Última copia ${new Intl.DateTimeFormat("es-ES", {
                day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
            }).format(new Date(backupStatus.lastSuccessAt))}`
            : "Automáticas activadas")
        : "Pendientes de activar";

    const billingConfiguration = accountData.billing || { enabled: false };
    const billingEnabled = billingConfiguration.enabled === true;
    const hasSubscription = billingConfiguration.portalAvailable === true;
    byId("billingModeBadge").textContent = billingEnabled
        ? (billingConfiguration.mode === "live" ? "Disponible" : "Modo de prueba")
        : "Vista previa";
    for (const button of document.querySelectorAll("[data-billing-plan]")) {
        const buttonPlan = button.dataset.billingPlan;
        const currentPlan = usage.plan === buttonPlan;
        const available = billingConfiguration.plans?.[buttonPlan]?.available === true;
        button.disabled = currentPlan || !billingEnabled || !available;
        button.textContent = currentPlan
            ? "Tu plan actual"
            : (billingEnabled && available
                ? `${hasSubscription ? "Cambiar a" : "Elegir"} ${planLabel(buttonPlan).replace("Plan ", "")}`
                : "Próximamente");
    }
    byId("manageBillingButton").hidden = !billingConfiguration.portalAvailable;
    byId("billingMessage").textContent = billingEnabled
        ? (billingConfiguration.mode === "live"
            ? "El pago y la gestión de la suscripción se realizan de forma segura en Stripe."
            : "Stripe está conectado en modo de prueba: no se realizará ningún cobro real.")
        : "Estos planes son una vista previa. Todavía no se realizará ningún cobro.";

    const limitReached = usage.galleryCount >= usage.galleryLimit;
    byId("planLimitNotice").hidden = !limitReached;
    uploadButton.disabled = limitReached;
    createDeliveryButton.disabled = limitReached;
    uploadButton.title = limitReached
        ? "Elimina una galería antes de crear otra"
        : "";
    const viewingControl = byId("viewingEnabled");
    viewingControl.disabled = false;
    applyGalleryExpiryPolicy();
}

function analyticsNumber(value) {
    return new Intl.NumberFormat("es-ES").format(Number(value || 0));
}

function analyticsDays() {
    const days = [];
    const now = new Date();
    for (let offset = 6; offset >= 0; offset -= 1) {
        days.push(new Date(Date.UTC(
            now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset
        )).toISOString().slice(0, 10));
    }
    return days;
}

function renderAnalyticsChart(eventSeries, userSeries) {
    const visitsByDay = new Map((eventSeries || []).map((row) => [row.day, Number(row.visitors || 0)]));
    const usersByDay = new Map((userSeries || []).map((row) => [row.day, Number(row.newUsers || 0)]));
    const days = analyticsDays();
    const maximum = Math.max(1, ...days.flatMap((day) => [visitsByDay.get(day) || 0, usersByDay.get(day) || 0]));
    const chart = byId("analyticsChart");
    chart.replaceChildren();
    for (const day of days) {
        const visitors = visitsByDay.get(day) || 0;
        const users = usersByDay.get(day) || 0;
        const column = document.createElement("div");
        column.className = "analytics-chart-column";
        const bars = document.createElement("div");
        bars.className = "analytics-chart-bars";
        const visitsBar = document.createElement("i");
        visitsBar.className = "visits";
        visitsBar.style.height = `${visitors ? Math.max(8, visitors / maximum * 100) : 2}%`;
        visitsBar.title = `${visitors} visitantes`;
        const usersBar = document.createElement("i");
        usersBar.className = "users";
        usersBar.style.height = `${users ? Math.max(8, users / maximum * 100) : 2}%`;
        usersBar.title = `${users} usuarios nuevos`;
        bars.append(visitsBar, usersBar);
        const label = document.createElement("span");
        label.textContent = new Intl.DateTimeFormat("es-ES", { weekday: "short", timeZone: "UTC" })
            .format(new Date(`${day}T00:00:00Z`)).replace(".", "");
        column.append(bars, label);
        chart.append(column);
    }
}

function renderAnalyticsSources(sources) {
    const container = byId("analyticsSources");
    container.replaceChildren();
    if (!sources?.length) {
        const empty = document.createElement("p");
        empty.textContent = "Aún no hay visitas con consentimiento.";
        container.append(empty);
        return;
    }
    for (const item of sources) {
        const row = document.createElement("div");
        const source = document.createElement("span");
        source.textContent = item.source;
        const visitors = document.createElement("strong");
        visitors.textContent = analyticsNumber(item.visitors);
        row.append(source, visitors);
        container.append(row);
    }
}

async function loadAnalytics() {
    byId("analyticsStatus").textContent = "Cargando datos reales…";
    const response = await fetch("/analytics/summary");
    const data = await readResponse(response);
    const totals = data.totals;
    byId("analyticsVisitors").textContent = analyticsNumber(totals.visitors);
    byId("analyticsPageviews").textContent = analyticsNumber(totals.pageviews);
    byId("analyticsTotalUsers").textContent = analyticsNumber(totals.totalUsers);
    byId("analyticsNewUsers").textContent = analyticsNumber(totals.newUsers);
    byId("analyticsCompletedRegistrations").textContent = analyticsNumber(totals.completedRegistrations);
    byId("analyticsConversion").textContent = totals.conversionRate === null
        ? "—"
        : `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(totals.conversionRate)} %`;
    byId("analyticsActiveUsers").textContent = analyticsNumber(totals.activeUsers);
    byId("funnelVisits").textContent = analyticsNumber(totals.visitors);
    byId("funnelStarted").textContent = analyticsNumber(totals.signupStarted);
    byId("funnelCompleted").textContent = analyticsNumber(totals.signupCompleted);
    byId("funnelLogins").textContent = analyticsNumber(totals.logins);
    renderAnalyticsChart(data.eventSeries, data.userSeries);
    renderAnalyticsSources(data.sources);
    byId("analyticsStatus").textContent = data.posthogConfigured
        ? "PostHog conectado · región europea · datos internos actualizados"
        : "Datos internos activos · PostHog pendiente de añadir su Project API Key";
}

analyticsButton.addEventListener("click", async () => {
    analyticsDialog.showModal();
    try { await loadAnalytics(); }
    catch (error) { byId("analyticsStatus").textContent = error.message; }
});
byId("closeAnalyticsDialog").addEventListener("click", () => analyticsDialog.close());

accountButton.addEventListener("click", () => accountDialog.showModal());
byId("closeAccountDialog").addEventListener("click", () => accountDialog.close());
byId("viewPlansFromLimit").addEventListener("click", () => {
    showProduct("galleries");
    byId("deliveriesPanel").scrollIntoView({ behavior: "smooth", block: "start" });
});

async function loadBrandProfile() {
    const response = await fetch("/brand");
    const data = await readResponse(response);
    brandProfile = data.profile;
    applyProfileToCreate();
}

function applyProfileToCreate() {
    if (!brandProfile) return;
    byId("brandName").value = brandProfile.brandName || "";
    byId("accentColor").value = brandProfile.accentColor || "#c9aa70";
    byId("backgroundColor").value = brandProfile.backgroundColor || "#ffffff";
    byId("brandLogoScale").value = brandProfile.logoScale ?? 100;
    byId("brandLogoPositionX").value = brandProfile.logoPositionX ?? 50;
    byId("brandLogoPositionY").value = brandProfile.logoPositionY ?? 50;
    renderLinkRows("", brandProfile.socialLinks || []);
    const preview = byId("createLogoPreview");
    preview.hidden = !brandProfile.hasLogo;
    if (brandProfile.logoUrl) byId("createLogoImage").src = brandProfile.logoUrl;
    updateLogoPreview("");
}

brandSettingsButton.addEventListener("click", openBrandDialog);
byId("closeBrandDialog").addEventListener("click", () => brandDialog.close());
byId("cancelBrandDialog").addEventListener("click", () => brandDialog.close());

function openBrandDialog() {
    if (!brandProfile) return;
    byId("profileBrandName").value = brandProfile.brandName || "";
    byId("profileAccentColor").value = brandProfile.accentColor || "#c9aa70";
    byId("profileBackgroundColor").value = brandProfile.backgroundColor || "#ffffff";
    byId("profileLogoScale").value = brandProfile.logoScale ?? 100;
    byId("profileLogoPositionX").value = brandProfile.logoPositionX ?? 50;
    byId("profileLogoPositionY").value = brandProfile.logoPositionY ?? 50;
    renderLinkRows("profile", brandProfile.socialLinks || []);
    byId("profileLogo").value = "";
    byId("removeProfileLogo").checked = false;
    byId("removeProfileLogoLabel").hidden = !brandProfile.hasLogo;
    byId("profileLogoPreview").hidden = !brandProfile.hasLogo;
    byId("profileLogoControls").hidden = !brandProfile.hasLogo;
    if (brandProfile.logoUrl) {
        byId("profileLogoImage").src = brandProfile.logoUrl;
    }
    updateLogoPreview("profile");
    brandDialogError.hidden = true;
    brandDialog.showModal();
    updateProfileBrandPreview();
}

for (const id of [
    "profileBrandName", "profileAccentColor", "profileBackgroundColor",
    "profileLogoScale", "profileLogoPositionX", "profileLogoPositionY",
    "removeProfileLogo"
]) {
    byId(id).addEventListener("input", updateProfileBrandPreview);
}

for (const button of document.querySelectorAll("[data-adjust-target]")) {
    button.addEventListener("click", () => {
        const input = byId(button.dataset.adjustTarget);
        const next = Math.max(
            Number(input.min),
            Math.min(Number(input.max), Number(input.value) + Number(button.dataset.delta))
        );
        input.value = String(next);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

for (const group of document.querySelectorAll("[data-position-group]")) {
    for (const button of group.querySelectorAll("[data-position-value]")) {
        button.addEventListener("click", () => {
            const input = byId(group.dataset.positionGroup);
            input.value = button.dataset.positionValue;
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
    }
}

document.querySelector("[data-reset-profile-logo]").addEventListener("click", () => {
    byId("profileLogoScale").value = "100";
    byId("profileLogoPositionX").value = "50";
    byId("profileLogoPositionY").value = "50";
    updateLogoPreview("profile");
});

let profileLogoDrag = null;
byId("profileLiveLogo").addEventListener("pointerdown", (event) => {
    if (byId("profileLiveLogo").hidden) return;
    profileLogoDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        positionX: Number(byId("profileLogoPositionX").value),
        positionY: Number(byId("profileLogoPositionY").value),
        width: Math.max(1, byId("profileLiveLogo").getBoundingClientRect().width),
        height: Math.max(1, byId("profileLiveLogo").getBoundingClientRect().height)
    };
    byId("profileLiveLogo").setPointerCapture(event.pointerId);
    event.preventDefault();
});
byId("profileLiveLogo").addEventListener("pointermove", (event) => {
    if (!profileLogoDrag || profileLogoDrag.pointerId !== event.pointerId) return;
    const x = Math.max(0, Math.min(100,
        profileLogoDrag.positionX + (event.clientX - profileLogoDrag.startX) * 100 / profileLogoDrag.width
    ));
    const y = Math.max(0, Math.min(100,
        profileLogoDrag.positionY + (event.clientY - profileLogoDrag.startY) * 100 / profileLogoDrag.height
    ));
    byId("profileLogoPositionX").value = String(Math.round(x));
    byId("profileLogoPositionY").value = String(Math.round(y));
    updateLogoPreview("profile");
});
for (const eventName of ["pointerup", "pointercancel"]) {
    byId("profileLiveLogo").addEventListener(eventName, (event) => {
        if (profileLogoDrag?.pointerId === event.pointerId) profileLogoDrag = null;
    });
}

brandForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    saveBrandButton.disabled = true;
    brandDialogError.hidden = true;
    const formData = new FormData();
    appendBrandValues(formData, createBrandValues("profile"));
    formData.append("removeLogo", byId("removeProfileLogo").checked);
    const logo = byId("profileLogo").files[0];
    if (logo) formData.append("logo", logo);

    try {
        const response = await fetch("/brand", {
            method: "PUT",
            body: formData
        });
        const data = await readResponse(response);
        brandProfile = data.profile;
        applyProfileToCreate();
        brandDialog.close();
    } catch (error) {
        brandDialogError.textContent = error.message;
        brandDialogError.hidden = false;
    } finally {
        saveBrandButton.disabled = false;
    }
});

async function loadDeliveries() {
    try {
        const response = await fetch("/deliveries");
        const data = await readResponse(response);
        latestDeliveries = data.deliveries;
        deliveriesList.replaceChildren();
        deliveriesEmpty.hidden = data.deliveries.length !== 0;
        deleteAllDeliveriesButton.disabled = data.deliveries.length === 0;
        for (const delivery of data.deliveries) {
            deliveriesList.appendChild(createDeliveryCard(delivery));
        }
    } catch (error) {
        deliveriesList.replaceChildren();
        const message = document.createElement("p");
        message.className = "deliveries-error";
        message.textContent = error.message;
        deliveriesList.appendChild(message);
    }
}

function createDeliveryCard(delivery) {
    const card = document.createElement("article");
    card.className = "delivery-card";

    if (delivery.coverFilename) {
        const cover = document.createElement("img");
        cover.className = "delivery-cover";
        cover.loading = "lazy";
        cover.alt = "";
        cover.src = `/gallery/${encodeURIComponent(delivery.id)}/previews/${encodeURIComponent(delivery.coverFilename)}`;
        card.appendChild(cover);
    }

    const body = document.createElement("div");
    body.className = "delivery-card-body";
    const name = document.createElement("h3");
    name.className = "delivery-name";
    name.textContent = delivery.clientName || "Galería sin nombre";
    const details = document.createElement("p");
    details.className = "delivery-meta";
    details.textContent = `${delivery.photoCount} ${
        delivery.photoCount === 1 ? "fotografía" : "fotografías"
    } · ${formatDate(delivery.createdAt)}`;
    const badges = document.createElement("div");
    badges.className = "delivery-badges";
    const labels = [];
    if (delivery.brandName) labels.push(delivery.brandName);
    if (delivery.hasPassword) labels.push("Protegida");
    if (delivery.expiresAt) {
        labels.push(Date.parse(delivery.expiresAt) <= Date.now()
            ? "Caducada"
            : `Caduca ${formatDate(delivery.expiresAt)}`);
    }
    if (delivery.favoriteCount) {
        labels.push(`${delivery.favoriteCount} favorita${delivery.favoriteCount === 1 ? "" : "s"}`);
    }
    if (delivery.selection?.status === "submitted") labels.push("Selección recibida");
    if (delivery.latestActivity?.eventType === "gallery_view") labels.push("Vista recientemente");
    for (const label of labels) {
        const badge = document.createElement("span");
        badge.className = "delivery-badge";
        badge.textContent = label;
        badges.appendChild(badge);
    }

    const actions = document.createElement("div");
    actions.className = "delivery-actions";
    const open = document.createElement("a");
    open.className = "delivery-action delivery-open";
    open.href = delivery.link;
    open.target = "_blank";
    open.rel = "noopener";
    open.textContent = "Abrir";
    const copy = actionButton("Copiar enlace", "delivery-copy", () => {
        copyDeliveryLink(delivery.link, copy);
    });
    const send = actionButton("Enviar al cliente", "delivery-send", () => {
        sendDelivery(delivery, send);
    });
    const edit = actionButton("Personalizar", "delivery-edit", () => {
        openEditDelivery(delivery.id);
    });
    const remove = actionButton("Eliminar", "delivery-delete", () => {
        openDeleteDeliveryDialog(delivery);
    });
    actions.append(open);
    if (delivery.viewingEnabled) actions.append(copy, send);
    actions.append(edit, remove);
    body.append(name, details, badges, actions);
    card.appendChild(body);
    return card;
}

function actionButton(label, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `delivery-action ${className}`;
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
}

async function copyDeliveryLink(link, button) {
    const absolute = new URL(link, window.location.origin).href;
    try {
        await navigator.clipboard.writeText(absolute);
        const original = button.textContent;
        button.textContent = "Copiado ✓";
        setTimeout(() => { button.textContent = original; }, 1800);
    } catch {
        showError(`Copia este enlace: ${absolute}`);
    }
}

async function sendDelivery(delivery, button) {
    if (!delivery.clientEmail) {
        showError("Añade el correo del cliente desde Editar antes de enviar la galería");
        return;
    }
    hideError();
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Enviando…";
    try {
        const response = await fetch(
            `/deliveries/${encodeURIComponent(delivery.id)}/send`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: delivery.clientEmail })
            }
        );
        const data = await readResponse(response);
        button.textContent = data.delivered ? "Enviada ✓" : "Correo pendiente";
        await loadDeliveries();
    } catch (error) {
        button.textContent = original;
        showError(error.message);
    } finally {
        button.disabled = false;
    }
}

async function openEditDelivery(deliveryId) {
    editDialogError.hidden = true;
    try {
        const response = await fetch(`/deliveries/${encodeURIComponent(deliveryId)}`);
        const data = await readResponse(response);
        currentEditDelivery = data.delivery;
        fillEditForm();
        renderEditPhotos();
        editDialog.showModal();
    } catch (error) {
        showError(error.message);
    }
}

function fillEditForm() {
    const delivery = currentEditDelivery;
    byId("editDeliveryId").value = delivery.id;
    byId("editClientName").value = delivery.clientName;
    byId("editClientEmail").value = delivery.clientEmail || "";
    byId("editMessage").value = delivery.message || "";
    byId("editExpiresAt").value = isoToDateInput(delivery.expiresAt);
    byId("editExpiryChoice").value = delivery.expiresAt ? "custom" : "";
    updateExpiryChoice();
    applyGalleryExpiryPolicy();
    byId("editPassword").value = "";
    byId("removePassword").checked = false;
    byId("removePasswordLabel").hidden = !delivery.hasPassword;
    byId("editViewingEnabled").checked = delivery.viewingEnabled;
    byId("editAllowOriginalDownload").checked = delivery.allowOriginalDownload;
    byId("editAllowWebDownload").checked = delivery.allowWebDownload;
    byId("editFavoritesEnabled").checked = delivery.favoritesEnabled;
    byId("editSelectionLimit").value = delivery.selection?.selectionLimit
        || Math.max(1, Math.min(500, delivery.files?.length || 20));
    syncSelectionLimit("editFavoritesEnabled", "editSelectionLimit");
    byId("editBrandName").value = delivery.brandName || "";
    byId("editAccentColor").value = delivery.accentColor || "#c9aa70";
    byId("editBackgroundColor").value = delivery.backgroundColor || "#ffffff";
    renderLinkRows("edit", delivery.socialLinks || []);
    const galleryStyle = delivery.galleryStyle || "masonry";
    const galleryStyleOption = document.querySelector(
        `input[name="editGalleryStyle"][value="${galleryStyle}"]`
    );
    if (galleryStyleOption) galleryStyleOption.checked = true;
    byId("editCoverStyle").value = delivery.coverStyle || "immersive";
    byId("editCoverPositionX").value = delivery.coverPositionX ?? 50;
    byId("editCoverPositionY").value = delivery.coverPositionY ?? 50;
    byId("editLogoScale").value = delivery.logoScale ?? 100;
    byId("editLogoPositionX").value = delivery.logoPositionX ?? 50;
    byId("editLogoPositionY").value = delivery.logoPositionY ?? 50;
    byId("editLogo").value = "";
    byId("removeEditLogo").checked = false;
    byId("removeEditLogoLabel").hidden = !delivery.hasLogo;
    byId("editLogoPreview").hidden = !delivery.hasLogo;
    if (delivery.logoUrl) {
        byId("editLogoImage").src = `${delivery.logoUrl}?v=${Date.now()}`;
    } else {
        byId("editLogoImage").removeAttribute("src");
    }
    updateLogoPreview("edit");
    updateEditGalleryPreview();
    renderSelectionAdmin();
    renderSections();
    setEditSaveState(false);
    const firstEditorTab = document.querySelector('[data-edit-panel-target="content"]');
    firstEditorTab?.click();
}

function activityText(item) {
    const labels = {
        gallery_view: "Galería visualizada",
        favorite_added: "Fotografía seleccionada",
        favorite_removed: "Fotografía retirada",
        selection_comment: "Nota añadida",
        selection_submitted: "Selección final enviada",
        download_gallery_original: "Galería original descargada",
        download_gallery_web: "Galería descargada en calidad reducida",
        download_photo_original: "Original descargado",
        download_photo_web: "Calidad reducida descargada"
    };
    return labels[item.eventType] || "Actividad en la galería";
}

function renderSelectionAdmin() {
    const delivery = currentEditDelivery;
    const selection = delivery.selection || { status: "open", selectionLimit: 0 };
    const submitted = selection.status === "submitted";
    byId("editSelectionStatus").textContent = submitted ? "Selección enviada" : "Selección abierta";
    byId("reopenSelection").hidden = !submitted;
    const count = delivery.favorites?.length || 0;
    byId("editSelectionSummary").textContent = submitted
        ? `${selection.clientName || "El cliente"} envió ${count} fotografía${count === 1 ? "" : "s"}${selection.submittedAt ? ` el ${formatDate(selection.submittedAt)}` : ""}.`
        : `${count} fotografía${count === 1 ? "" : "s"} seleccionada${count === 1 ? "" : "s"} hasta ahora.`;

    const comments = byId("editSelectionComments");
    comments.replaceChildren();
    const usefulComments = (delivery.selectionComments || []).filter((item) => item.comment);
    for (const item of usefulComments) {
        const row = document.createElement("p");
        row.textContent = `${item.filename}: ${item.comment}`;
        comments.appendChild(row);
    }
    if (!usefulComments.length) comments.textContent = "Sin notas todavía.";

    const activity = byId("editActivity");
    activity.replaceChildren();
    for (const item of (delivery.activity || []).slice(0, 12)) {
        const row = document.createElement("p");
        row.textContent = `${activityText(item)} · ${formatDate(item.createdAt)}`;
        activity.appendChild(row);
    }
    if (!delivery.activity?.length) activity.textContent = "Todavía no hay actividad.";
}

byId("reopenSelection").addEventListener("click", async () => {
    if (!currentEditDelivery) return;
    const response = await fetch(
        `/deliveries/${encodeURIComponent(currentEditDelivery.id)}/selection/reopen`,
        { method: "POST" }
    );
    const data = await readResponse(response);
    currentEditDelivery.selection = data.selection;
    renderSelectionAdmin();
});

function renderSections() {
    const container = byId("sectionsList");
    container.replaceChildren();
    for (const section of (currentEditDelivery.sections || [])) {
        const chip = document.createElement("span");
        chip.className = "section-chip";
        chip.append(document.createTextNode(section.name));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Eliminar sección ${section.name}`);
        remove.addEventListener("click", () => deleteSection(section.id));
        chip.appendChild(remove);
        container.appendChild(chip);
    }
}

byId("addSection").addEventListener("click", async () => {
    const input = byId("newSectionName");
    const name = input.value.trim();
    if (!name || !currentEditDelivery) return;
    try {
        const response = await fetch(`/deliveries/${encodeURIComponent(currentEditDelivery.id)}/sections`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        });
        const data = await readResponse(response);
        currentEditDelivery.sections.push(data.section);
        input.value = "";
        renderSections();
        renderEditPhotos();
    } catch (error) {
        editDialogError.textContent = error.message;
        editDialogError.hidden = false;
    }
});

async function deleteSection(sectionId) {
    try {
        await readResponse(await fetch(
            `/deliveries/${encodeURIComponent(currentEditDelivery.id)}/sections/${sectionId}`,
            { method: "DELETE" }
        ));
        currentEditDelivery.sections = currentEditDelivery.sections.filter((item) => item.id !== sectionId);
        for (const [filename, assigned] of Object.entries(currentEditDelivery.mediaSections || {})) {
            if (Number(assigned) === sectionId) delete currentEditDelivery.mediaSections[filename];
        }
        renderSections();
        renderEditPhotos();
    } catch (error) {
        editDialogError.textContent = error.message;
        editDialogError.hidden = false;
    }
}

function rgbFromHex(hex) {
    const value = String(hex || "").replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(value)) return [0, 0, 0];
    return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
}

function hexFromRgb(rgb) {
    return `#${rgb.map((part) => Math.round(part).toString(16).padStart(2, "0")).join("")}`;
}

function relativeLuminance(hex) {
    return rgbFromHex(hex)
        .map((value) => value / 255)
        .map((value) => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
        .reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0);
}

function contrastRatio(first, second) {
    const values = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
    return (values[0] + .05) / (values[1] + .05);
}

function mixHex(color, target, amount) {
    const sourceRgb = rgbFromHex(color);
    const targetRgb = rgbFromHex(target);
    return hexFromRgb(sourceRgb.map((value, index) =>
        value + (targetRgb[index] - value) * amount
    ));
}

function readableAccent(accent, background, minimum = 4.5) {
    if (contrastRatio(accent, background) >= minimum) return accent;
    const target = relativeLuminance(background) > .35 ? "#000000" : "#ffffff";
    for (let amount = .08; amount <= 1; amount += .08) {
        const candidate = mixHex(accent, target, amount);
        if (contrastRatio(candidate, background) >= minimum) return candidate;
    }
    return target;
}

function foregroundFor(color) {
    return contrastRatio(color, "#111111") >= contrastRatio(color, "#ffffff")
        ? "#111111"
        : "#ffffff";
}

function colorTone(hex) {
    return relativeLuminance(hex) > .36 ? "light" : "dark";
}

function brandPalette(accent, background) {
    return {
        text: colorTone(background) === "light" ? "#171717" : "#f6f3ed",
        accentText: foregroundFor(accent),
        readable: readableAccent(accent, background),
        onCover: readableAccent(accent, "#202020")
    };
}

function syncProfilePositionButtons() {
    for (const group of document.querySelectorAll("[data-position-group]")) {
        const value = Number(byId(group.dataset.positionGroup).value);
        let closest = null;
        let distance = Infinity;
        for (const button of group.querySelectorAll("[data-position-value]")) {
            const currentDistance = Math.abs(Number(button.dataset.positionValue) - value);
            if (currentDistance < distance) {
                closest = button;
                distance = currentDistance;
            }
            button.classList.remove("is-active");
        }
        closest?.classList.add("is-active");
    }
}

function updateProfileBrandPreview() {
    const preview = byId("profileBrandLivePreview");
    if (!preview) return;
    const background = byId("profileBackgroundColor").value || "#ffffff";
    const accent = byId("profileAccentColor").value || "#c9aa70";
    const palette = brandPalette(accent, background);
    preview.style.setProperty("--brand-preview-bg", background);
    preview.style.setProperty("--brand-preview-text", palette.text);
    preview.style.setProperty("--brand-preview-accent", accent);
    preview.style.setProperty("--brand-preview-accent-readable", palette.readable);
    preview.style.setProperty("--brand-preview-accent-on-cover", palette.onCover);
    preview.style.setProperty("--brand-preview-accent-text", palette.accentText);
    preview.dataset.tone = colorTone(background);
    byId("profileAccentValue").textContent = accent.toUpperCase();
    byId("profileBackgroundValue").textContent = background.toUpperCase();

    const sourceLogo = byId("profileLogoImage");
    const liveLogo = byId("profileLiveLogo");
    const hasLogo = Boolean(sourceLogo.getAttribute("src")) && !byId("removeProfileLogo").checked;
    byId("profileLogoControls").hidden = !hasLogo;
    liveLogo.hidden = !hasLogo;
    if (hasLogo) {
        liveLogo.src = sourceLogo.src;
        liveLogo.style.transform = sourceLogo.style.transform;
    } else {
        liveLogo.removeAttribute("src");
    }
    const brandName = byId("profileBrandName").value.trim();
    byId("profileLiveBrandName").textContent = brandName || (hasLogo ? "" : "Tu marca");
    byId("profileLiveBrandName").hidden = hasLogo && !brandName;
    const firstLink = byId("profileLinksList").querySelector(".link-label")?.value.trim();
    byId("profileLiveLink").textContent = firstLink || "TU WEB";
    syncProfilePositionButtons();

    const adjusted = palette.readable.toLowerCase() !== accent.toLowerCase();
    byId("profileContrastStatus").textContent = adjusted
        ? "Contraste protegido: conservamos tu color en botones y usamos una variante legible en los textos pequeños."
        : "Buena legibilidad: esta combinación mantiene visibles los textos y botones.";
}

function renderEditLivePhotos() {
    const container = byId("editLivePhotoGrid");
    if (!currentEditDelivery || !container) return;
    container.replaceChildren();
    const files = (currentEditDelivery.files || []).slice(0, 6);
    for (const filename of files) {
        if (currentEditDelivery.mediaTypes?.[filename] === "video") {
            const video = document.createElement("span");
            video.className = "edit-live-video";
            video.textContent = "▶ Vídeo";
            container.appendChild(video);
            continue;
        }
        const image = document.createElement("img");
        image.alt = "";
        image.src = `/gallery/${encodeURIComponent(currentEditDelivery.id)}/previews/${encodeURIComponent(filename)}`;
        const item = document.createElement("span");
        item.className = "edit-live-photo";
        item.appendChild(image);
        if (byId("editFavoritesEnabled").checked) {
            const heart = document.createElement("i");
            heart.textContent = "♡";
            item.appendChild(heart);
        }
        container.appendChild(item);
    }
}

function updateEditGalleryPreview() {
    if (!currentEditDelivery) return;
    const preview = byId("editGalleryLivePreview");
    const image = byId("editCoverPreviewImage");
    const cover = currentEditDelivery.coverFilename
        || currentEditDelivery.files?.find((filename) => currentEditDelivery.mediaTypes?.[filename] !== "video");
    const background = byId("editBackgroundColor").value || "#ffffff";
    const accent = byId("editAccentColor").value || "#c9aa70";
    preview.style.setProperty("--preview-bg", background);
    preview.style.setProperty("--preview-accent", accent);
    const palette = brandPalette(accent, background);
    preview.style.setProperty("--preview-accent-readable", palette.readable);
    preview.style.setProperty("--preview-accent-text", palette.accentText);
    preview.style.setProperty("--preview-accent-on-cover", palette.onCover);
    preview.style.setProperty("--preview-text", palette.text);
    preview.dataset.tone = colorTone(background);
    preview.dataset.galleryStyle = document.querySelector(
        'input[name="editGalleryStyle"]:checked'
    )?.value || "masonry";
    preview.dataset.coverStyle = byId("editCoverStyle").value;
    byId("editCoverPreview").dataset.style = byId("editCoverStyle").value;
    byId("editCoverPreviewTitle").textContent = byId("editClientName").value
        || currentEditDelivery.clientName;
    byId("editLiveMessage").textContent = byId("editMessage").value.trim();
    image.hidden = !cover || byId("editCoverStyle").value === "none";
    if (cover) {
        image.src = `/gallery/${encodeURIComponent(currentEditDelivery.id)}/previews/${encodeURIComponent(cover)}`;
        image.style.objectPosition = `${byId("editCoverPositionX").value}% ${byId("editCoverPositionY").value}%`;
    }
    const focal = byId("editCoverFocalPoint");
    focal.style.left = `${byId("editCoverPositionX").value}%`;
    focal.style.top = `${byId("editCoverPositionY").value}%`;
    focal.hidden = !cover || byId("editCoverStyle").value === "none";
    byId("editCoverFocusControls").hidden = !cover || byId("editCoverStyle").value === "none";
    for (const button of document.querySelectorAll("[data-edit-cover-style]")) {
        const active = button.dataset.editCoverStyle === byId("editCoverStyle").value;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
    }

    const sourceLogo = byId("editLogoImage");
    const liveLogo = byId("editLiveLogo");
    const hasLogo = Boolean(sourceLogo.getAttribute("src")) && !byId("removeEditLogo").checked;
    byId("editLogoControls").hidden = !hasLogo;
    liveLogo.hidden = !hasLogo;
    if (hasLogo) {
        liveLogo.src = sourceLogo.src;
        liveLogo.style.transform = sourceLogo.style.transform;
    } else {
        liveLogo.removeAttribute("src");
    }
    const brandName = byId("editBrandName").value.trim();
    const brandText = byId("editLiveBrandName");
    brandText.textContent = brandName || (hasLogo ? "" : "Straclase");
    brandText.hidden = !brandText.textContent;

    const links = [...byId("editLinksList").querySelectorAll(".link-row")]
        .map((row) => row.querySelector(".link-label")?.value.trim())
        .filter(Boolean)
        .slice(0, 3);
    byId("editLiveLinks").textContent = links.join("   ·   ");
    const viewing = byId("editViewingEnabled").checked;
    byId("editPreviewVisibilityNotice").hidden = viewing;
    byId("editPreviewOriginalAction").hidden = !byId("editAllowOriginalDownload").checked;
    byId("editPreviewWebAction").hidden = !byId("editAllowWebDownload").checked;
    byId("editPreviewFavoriteAction").hidden = !byId("editFavoritesEnabled").checked;
    byId("editPreviewFavoriteNotice").hidden = !byId("editFavoritesEnabled").checked;
    byId("editAccentValue").textContent = accent.toUpperCase();
    byId("editBackgroundValue").textContent = background.toUpperCase();
    const adjusted = palette.readable.toLowerCase() !== accent.toLowerCase();
    byId("editContrastStatus").textContent = adjusted
        ? "Contraste protegido: usaremos una variante legible de tu color en textos pequeños."
        : "Buena legibilidad: textos y botones mantienen suficiente contraste.";
    syncProfilePositionButtons();
    renderEditLivePhotos();
}

function updateEditCoverPreview() {
    updateEditGalleryPreview();
}

for (const id of [
    "editCoverStyle", "editCoverPositionX", "editCoverPositionY",
    "editClientName", "editMessage", "editBrandName", "editAccentColor",
    "editBackgroundColor", "removeEditLogo", "editViewingEnabled",
    "editAllowOriginalDownload", "editAllowWebDownload", "editFavoritesEnabled"
]) {
    byId(id).addEventListener("input", updateEditGalleryPreview);
}
for (const option of document.querySelectorAll('input[name="editGalleryStyle"]')) {
    option.addEventListener("change", updateEditGalleryPreview);
}

function setEditSaveState(dirty) {
    byId("editSaveState").textContent = dirty ? "Cambios sin guardar" : "Todo guardado";
    byId("editSaveStateDot").classList.toggle("is-dirty", dirty);
}

editDeliveryForm.addEventListener("input", () => {
    if (currentEditDelivery) setEditSaveState(true);
});
editDeliveryForm.addEventListener("change", () => {
    if (currentEditDelivery) setEditSaveState(true);
});

for (const button of document.querySelectorAll("[data-edit-cover-style]")) {
    button.addEventListener("click", () => {
        byId("editCoverStyle").value = button.dataset.editCoverStyle;
        byId("editCoverStyle").dispatchEvent(new Event("input", { bubbles: true }));
    });
}

for (const button of document.querySelectorAll("[data-cover-focal-presets] button")) {
    button.addEventListener("click", () => {
        byId("editCoverPositionX").value = button.dataset.coverX;
        byId("editCoverPositionY").value = button.dataset.coverY;
        byId("editCoverPositionX").dispatchEvent(new Event("input", { bubbles: true }));
    });
}

for (const button of document.querySelectorAll("[data-edit-preview-device]")) {
    button.addEventListener("click", () => {
        const device = button.dataset.editPreviewDevice;
        document.querySelector(".gallery-preview-viewport").dataset.previewDevice = device;
        document.querySelectorAll("[data-edit-preview-device]").forEach((item) => {
            const active = item === button;
            item.classList.toggle("is-active", active);
            item.setAttribute("aria-pressed", String(active));
        });
    });
}

let coverFocalDrag = null;
function moveCoverFocalPoint(event) {
    const cover = byId("editCoverPreview");
    const bounds = cover.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, (event.clientX - bounds.left) * 100 / bounds.width));
    const y = Math.max(0, Math.min(100, (event.clientY - bounds.top) * 100 / bounds.height));
    byId("editCoverPositionX").value = String(Math.round(x));
    byId("editCoverPositionY").value = String(Math.round(y));
    byId("editCoverPositionX").dispatchEvent(new Event("input", { bubbles: true }));
}
byId("editCoverFocalPoint").addEventListener("pointerdown", (event) => {
    coverFocalDrag = event.pointerId;
    byId("editCoverFocalPoint").setPointerCapture(event.pointerId);
    moveCoverFocalPoint(event);
});
byId("editCoverFocalPoint").addEventListener("pointermove", (event) => {
    if (coverFocalDrag === event.pointerId) moveCoverFocalPoint(event);
});
for (const eventName of ["pointerup", "pointercancel"]) {
    byId("editCoverFocalPoint").addEventListener(eventName, (event) => {
        if (coverFocalDrag === event.pointerId) coverFocalDrag = null;
    });
}

document.querySelector("[data-reset-edit-logo]").addEventListener("click", () => {
    byId("editLogoScale").value = "100";
    byId("editLogoPositionX").value = "50";
    byId("editLogoPositionY").value = "50";
    byId("editLogoScale").dispatchEvent(new Event("input", { bubbles: true }));
});

let editLogoDrag = null;
byId("editLiveLogo").addEventListener("pointerdown", (event) => {
    if (byId("editLiveLogo").hidden) return;
    const bounds = byId("editCoverPreview").getBoundingClientRect();
    editLogoDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        positionX: Number(byId("editLogoPositionX").value),
        positionY: Number(byId("editLogoPositionY").value),
        width: Math.max(1, bounds.width),
        height: Math.max(1, bounds.height)
    };
    byId("editLiveLogo").setPointerCapture(event.pointerId);
    event.preventDefault();
});
byId("editLiveLogo").addEventListener("pointermove", (event) => {
    if (!editLogoDrag || editLogoDrag.pointerId !== event.pointerId) return;
    byId("editLogoPositionX").value = String(Math.round(Math.max(0, Math.min(100,
        editLogoDrag.positionX + (event.clientX - editLogoDrag.startX) * 100 / editLogoDrag.width
    ))));
    byId("editLogoPositionY").value = String(Math.round(Math.max(0, Math.min(100,
        editLogoDrag.positionY + (event.clientY - editLogoDrag.startY) * 100 / editLogoDrag.height
    ))));
    byId("editLogoPositionX").dispatchEvent(new Event("input", { bubbles: true }));
});
for (const eventName of ["pointerup", "pointercancel"]) {
    byId("editLiveLogo").addEventListener(eventName, (event) => {
        if (editLogoDrag?.pointerId === event.pointerId) editLogoDrag = null;
    });
}

function renderEditPhotos() {
    const container = byId("editPhotos");
    container.replaceChildren();
    const files = currentEditDelivery.files || [];
    const favorites = new Set(currentEditDelivery.favorites || []);
    byId("editPhotoSummary").textContent = `${files.length} fotos · ${
        favorites.size
    } seleccionada${favorites.size === 1 ? "" : "s"}`;

    for (const filename of files) {
        const item = document.createElement("article");
        item.className = "edit-photo";
        if (filename === currentEditDelivery.coverFilename) {
            item.classList.add("is-cover");
        }
        if (favorites.has(filename)) item.classList.add("is-favorite");
        const video = currentEditDelivery.mediaTypes?.[filename] === "video";
        const image = document.createElement(video ? "video" : "img");
        image.loading = "lazy";
        if (video) {
            image.src = `/gallery/${encodeURIComponent(currentEditDelivery.id)}/photos/${encodeURIComponent(filename)}`;
            image.controls = true;
            image.preload = "metadata";
        } else {
            image.alt = filename;
            image.src = `/gallery/${encodeURIComponent(currentEditDelivery.id)}/previews/${encodeURIComponent(filename)}`;
        }
        const cover = document.createElement("button");
        cover.type = "button";
        cover.className = "edit-cover-button";
        cover.textContent = filename === currentEditDelivery.coverFilename
            ? "✓ Portada"
            : "Portada";
        cover.addEventListener("click", () => {
            currentEditDelivery.coverFilename = filename;
            renderEditPhotos();
            updateEditCoverPreview();
        });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "edit-remove-button";
        remove.textContent = "×";
        remove.disabled = files.length <= 1;
        remove.addEventListener("click", () => deleteDeliveryPhoto(filename));
        const sectionSelect = document.createElement("select");
        sectionSelect.className = "edit-section-select";
        sectionSelect.setAttribute("aria-label", `Sección de ${filename}`);
        sectionSelect.appendChild(new Option("Sin sección", ""));
        for (const section of (currentEditDelivery.sections || [])) {
            sectionSelect.appendChild(new Option(section.name, String(section.id)));
        }
        sectionSelect.value = String(currentEditDelivery.mediaSections?.[filename] || "");
        sectionSelect.addEventListener("change", () => assignPhotoSection(filename, sectionSelect));
        item.append(image);
        if (!video) item.append(cover);
        item.append(remove, sectionSelect);
        container.appendChild(item);
    }
    renderEditLivePhotos();
}

async function assignPhotoSection(filename, select) {
    select.disabled = true;
    try {
        const sectionId = select.value ? Number(select.value) : null;
        await readResponse(await fetch(
            `/deliveries/${encodeURIComponent(currentEditDelivery.id)}/photos/${encodeURIComponent(filename)}/section`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sectionId })
            }
        ));
        currentEditDelivery.mediaSections ||= {};
        if (sectionId) currentEditDelivery.mediaSections[filename] = sectionId;
        else delete currentEditDelivery.mediaSections[filename];
    } catch (error) {
        editDialogError.textContent = error.message;
        editDialogError.hidden = false;
    } finally {
        select.disabled = false;
    }
}

async function deleteDeliveryPhoto(filename) {
    if (!currentEditDelivery || currentEditDelivery.files.length <= 1) return;
    try {
        const response = await fetch(
            `/deliveries/${encodeURIComponent(currentEditDelivery.id)}/photos/${encodeURIComponent(filename)}`,
            { method: "DELETE" }
        );
        await readResponse(response);
        currentEditDelivery.files = currentEditDelivery.files
            .filter((file) => file !== filename);
        currentEditDelivery.favorites = currentEditDelivery.favorites
            .filter((file) => file !== filename);
        if (currentEditDelivery.coverFilename === filename) {
            currentEditDelivery.coverFilename = currentEditDelivery.files[0];
        }
        renderEditPhotos();
        updateEditCoverPreview();
        await loadDeliveries();
        await loadAccount();
    } catch (error) {
        editDialogError.textContent = error.message;
        editDialogError.hidden = false;
    }
}

byId("addPhotosButton").addEventListener("click", () => byId("addPhotosInput").click());
byId("addPhotosInput").addEventListener("change", async () => {
    const files = [...byId("addPhotosInput").files];
    if (!files.length || !currentEditDelivery) return;
    const formData = new FormData();
    for (const file of files) formData.append("photos", file);
    byId("addPhotosButton").disabled = true;
    try {
        const response = await fetch(
            `/deliveries/${encodeURIComponent(currentEditDelivery.id)}/photos`,
            { method: "POST", body: formData }
        );
        const data = await readResponse(response);
        currentEditDelivery.files = data.files;
        currentEditDelivery.mediaTypes = data.mediaTypes || {};
        renderEditPhotos();
        updateEditGalleryPreview();
        await loadDeliveries();
        await loadAccount();
    } catch (error) {
        editDialogError.textContent = error.message;
        editDialogError.hidden = false;
    } finally {
        byId("addPhotosButton").disabled = false;
        byId("addPhotosInput").value = "";
    }
});

byId("removePassword").addEventListener("change", () => {
    byId("editPassword").disabled = byId("removePassword").checked;
    if (byId("removePassword").checked) byId("editPassword").value = "";
});

editDeliveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentEditDelivery) return;
    saveDeliveryButton.disabled = true;
    editDialogError.hidden = true;

    if (byId("editFavoritesEnabled").checked
        && !byId("editSelectionLimit").checkValidity()) {
        editDialogError.textContent = "Escribe cuántas fotografías puede seleccionar el cliente (entre 1 y 500).";
        editDialogError.hidden = false;
        byId("editSelectionLimit").focus();
        saveDeliveryButton.disabled = false;
        return;
    }

    const settings = {
        clientName: byId("editClientName").value.trim(),
        clientEmail: byId("editClientEmail").value.trim(),
        viewingEnabled: byId("editViewingEnabled").checked,
        message: byId("editMessage").value.trim(),
        expiresAt: dateInputToIso(byId("editExpiresAt").value),
        password: byId("editPassword").value,
        removePassword: byId("removePassword").checked,
        allowOriginalDownload: byId("editAllowOriginalDownload").checked,
        allowWebDownload: byId("editAllowWebDownload").checked,
        favoritesEnabled: byId("editFavoritesEnabled").checked,
        selectionLimit: byId("editFavoritesEnabled").checked
            ? byId("editSelectionLimit").value
            : 0,
        galleryStyle: document.querySelector(
            'input[name="editGalleryStyle"]:checked'
        )?.value || "masonry",
        coverFilename: currentEditDelivery.coverFilename,
        coverStyle: byId("editCoverStyle").value,
        coverPositionX: byId("editCoverPositionX").value,
        coverPositionY: byId("editCoverPositionY").value,
        ...createBrandValues("edit")
    };

    try {
        const response = await fetch(
            `/deliveries/${encodeURIComponent(currentEditDelivery.id)}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings)
            }
        );
        await readResponse(response);

        if (byId("removeEditLogo").checked) {
            await readResponse(await fetch(
                `/deliveries/${encodeURIComponent(currentEditDelivery.id)}/logo`,
                { method: "DELETE" }
            ));
        } else if (byId("editLogo").files[0]) {
            const logoData = new FormData();
            logoData.append("logo", byId("editLogo").files[0]);
            await readResponse(await fetch(
                `/deliveries/${encodeURIComponent(currentEditDelivery.id)}/logo`,
                { method: "POST", body: logoData }
            ));
        }

        editDialog.close();
        await loadDeliveries();
        await loadAccount();
    } catch (error) {
        editDialogError.textContent = error.message;
        editDialogError.hidden = false;
    } finally {
        saveDeliveryButton.disabled = false;
    }
});

function closeEditDialog() {
    if (!saveDeliveryButton.disabled) editDialog.close();
}
byId("closeEditDialog").addEventListener("click", closeEditDialog);
byId("cancelEditDialog").addEventListener("click", closeEditDialog);
editDialog.addEventListener("close", () => {
    currentEditDelivery = null;
    byId("editPhotos").replaceChildren();
});

function showProduct(product) {
    showWorkspaceView(product);
}

function showWorkspaceView(view, updateUrl = true) {
    const selected = ["transfers", "galleries"].includes(view) ? view : "transfers";
    byId("galleryCreator").hidden = selected !== "galleries";
    byId("deliveriesPanel").hidden = selected !== "galleries";
    transferCreator.hidden = selected !== "transfers";
    transfersPanel.hidden = selected !== "transfers";
    for (const [id, name] of [
        ["showTransfers", "transfers"], ["showGalleries", "galleries"]
    ]) byId(id).classList.toggle("is-active", selected === name);
    if (updateUrl) {
        const url = new URL(window.location.href);
        if (selected === "transfers") url.searchParams.delete("view");
        else url.searchParams.set("view", selected);
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
}

byId("showGalleries").addEventListener("click", () => showWorkspaceView("galleries"));
byId("showTransfers").addEventListener("click", () => showWorkspaceView("transfers"));
showWorkspaceView(new URLSearchParams(window.location.search).get("view") || "transfers", false);

async function loadGalleryCapabilities() {
    const data = await readResponse(await fetch("/galleries/capabilities"));
    MAX_FILES = data.maxFiles;
    MAX_FILE_SIZE = data.maxImageSize;
    MAX_VIDEO_SIZE = data.maxVideoSize;
    MAX_TOTAL_SIZE = data.maxTotalSize;
    byId("selectionHint").textContent =
        `Hasta ${data.maxFiles} archivos · ${formatBytes(data.maxImageSize)} por foto · ${formatBytes(data.maxVideoSize)} por vídeo · ${formatBytes(data.maxTotalSize)} por galería`;
}

async function loadTransferCapabilities() {
    const response = await fetch("/transfers/capabilities");
    transferCapabilities = await readResponse(response);
    byId("transferLimitHint").textContent = `Hasta ${formatBytes(transferCapabilities.maxTotalSize)} por transferencia · Disponible durante 24 horas`;
    byId("selectTransferFiles").disabled = !transferCapabilities.acceptingNewTransfers;
    byId("createTransfer").disabled = !transferCapabilities.acceptingNewTransfers;
    if (!transferCapabilities.acceptingNewTransfers) {
        showTransferError("Las nuevas transferencias están pausadas temporalmente. Tus archivos existentes siguen disponibles.");
    }
}

function transferFileExtension(file) {
    return file.name.split(".").pop()?.toLowerCase() || "";
}

function addTransferFiles(files) {
    hideError();
    if (!transferCapabilities.acceptingNewTransfers) {
        return showTransferError("Las nuevas transferencias están pausadas temporalmente.");
    }
    const blocked = files.find((file) => blockedTransferExtensions.has(transferFileExtension(file)));
    if (blocked) return showError(`${blocked.name} no está permitido por seguridad`);
    const oversized = files.find((file) => file.size > transferCapabilities.maxFileSize);
    if (oversized) return showTransferError(`${oversized.name} supera el máximo de ${formatBytes(transferCapabilities.maxFileSize)}`);
    const existing = new Set(selectedTransferFiles.map(fileKey));
    const unique = files.filter((file) => !existing.has(fileKey(file)));
    if (selectedTransferFiles.length + unique.length > transferCapabilities.maxFiles) {
        return showTransferError(`Cada transferencia admite como máximo ${transferCapabilities.maxFiles} archivos`);
    }
    const total = [...selectedTransferFiles, ...unique]
        .reduce((sum, file) => sum + file.size, 0);
    if (total > transferCapabilities.maxTotalSize) {
        return showTransferError(`La transferencia no puede superar ${formatBytes(transferCapabilities.maxTotalSize)}`);
    }
    selectedTransferFiles.push(...unique);
    renderTransferSelection();
}

function renderTransferSelection() {
    const container = byId("transferFilesList");
    container.replaceChildren();
    const total = selectedTransferFiles.reduce((sum, file) => sum + file.size, 0);
    byId("transferSelection").hidden = selectedTransferFiles.length === 0;
    byId("transferSelectionSummary").textContent = `${selectedTransferFiles.length} archivo${selectedTransferFiles.length === 1 ? "" : "s"} · ${formatBytes(total)}`;
    selectedTransferFiles.forEach((file, index) => {
        const row = document.createElement("div");
        row.className = "transfer-file-row";
        const name = document.createElement("span");
        name.textContent = file.name;
        const size = document.createElement("small");
        size.textContent = formatBytes(file.size);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Quitar ${file.name}`);
        remove.addEventListener("click", () => {
            selectedTransferFiles.splice(index, 1);
            renderTransferSelection();
        });
        row.append(name, size, remove);
        container.appendChild(row);
    });
}

byId("selectTransferFiles").addEventListener("click", () => byId("transferFilesInput").click());
byId("transferFilesInput").addEventListener("change", () => {
    addTransferFiles([...byId("transferFilesInput").files]);
    byId("transferFilesInput").value = "";
});
byId("clearTransferFiles").addEventListener("click", () => {
    selectedTransferFiles = [];
    renderTransferSelection();
});
for (const eventName of ["dragenter", "dragover"]) {
    byId("selectTransferFiles").addEventListener(eventName, (event) => {
        event.preventDefault();
        byId("selectTransferFiles").classList.add("is-dragover");
    });
}
for (const eventName of ["dragleave", "drop"]) {
    byId("selectTransferFiles").addEventListener(eventName, (event) => {
        event.preventDefault();
        byId("selectTransferFiles").classList.remove("is-dragover");
        if (eventName === "drop") addTransferFiles([...event.dataTransfer.files]);
    });
}

function uploadTransfer(formData) {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", "/transfers");
        request.responseType = "json";
        request.upload.addEventListener("progress", (event) => {
            if (!event.lengthComputable) return;
            const percent = Math.round(event.loaded / event.total * 100);
            byId("transferUploadProgress").style.width = `${percent}%`;
            byId("transferUploadText").textContent = `Subiendo archivos… ${percent}%`;
        });
        request.addEventListener("load", () => {
            const data = request.response || {};
            if (request.status >= 200 && request.status < 300) resolve(data);
            else reject(new Error(data.error || "No se pudo crear la transferencia"));
        });
        request.addEventListener("error", () => reject(new Error(
            "Se perdió la conexión. Los archivos siguen seleccionados para que puedas reintentar"
        )));
        request.send(formData);
    });
}

async function retryTransferPart(url, body, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const response = await fetch(url, { method: "PUT", body });
            if (!response.ok) throw new Error(`Error ${response.status}`);
            return;
        } catch (error) {
            lastError = error;
            if (attempt < attempts) {
                await new Promise((resolve) => setTimeout(resolve, attempt * 700));
            }
        }
    }
    throw new Error(`No se pudo subir un bloque tras ${attempts} intentos: ${lastError?.message || "error de conexión"}`);
}

async function runTransferPool(items, concurrency, worker) {
    let nextIndex = 0;
    async function run() {
        while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;
            await worker(items[index]);
        }
    }
    await Promise.all(Array.from(
        { length: Math.min(concurrency, items.length) },
        () => run()
    ));
}

async function createMultipartTransfer(metadata, sourceFiles) {
    let prepared;
    try {
        prepared = await readResponse(await fetch("/transfers/multipart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...metadata,
                files: sourceFiles.map((file) => ({
                    name: file.name,
                    size: file.size,
                    type: file.type
                }))
            })
        }));
        let uploadedBytes = 0;
        const totalBytes = prepared.totalBytes || 1;

        for (let fileIndex = 0; fileIndex < prepared.files.length; fileIndex += 1) {
            const remoteFile = prepared.files[fileIndex];
            const sourceFile = sourceFiles[fileIndex];
            const endpoint = `/transfers/${encodeURIComponent(prepared.transferId)}/files/${encodeURIComponent(remoteFile.id)}`;
            const start = await readResponse(await fetch(`${endpoint}/start`, {
                method: "POST"
            }));
            if (!start.ready) {
                const partNumbers = Array.from(
                    { length: start.partCount },
                    (_, index) => index + 1
                );
                for (let batchIndex = 0; batchIndex < partNumbers.length; batchIndex += 9) {
                    const batch = partNumbers.slice(batchIndex, batchIndex + 9);
                    const signed = await readResponse(await fetch(`${endpoint}/parts`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ partNumbers: batch })
                    }));
                    await runTransferPool(signed.urls, 3, async ({ partNumber, url }) => {
                        const startByte = (partNumber - 1) * start.partSize;
                        const endByte = Math.min(sourceFile.size, startByte + start.partSize);
                        const blob = sourceFile.slice(startByte, endByte);
                        await retryTransferPart(url, blob);
                        uploadedBytes += blob.size;
                        const percent = Math.min(100, Math.round(uploadedBytes / totalBytes * 100));
                        byId("transferUploadProgress").style.width = `${percent}%`;
                        byId("transferUploadText").textContent = `Subiendo ${remoteFile.name}… ${percent}%`;
                    });
                }
                await readResponse(await fetch(`${endpoint}/complete`, {
                    method: "POST"
                }));
            }
        }
        return await readResponse(await fetch(
            `/transfers/${encodeURIComponent(prepared.transferId)}/complete`,
            { method: "POST" }
        ));
    } catch (error) {
        if (prepared?.transferId) {
            await fetch(`/transfers/${encodeURIComponent(prepared.transferId)}`, {
                method: "DELETE"
            }).catch(() => {});
        }
        throw error;
    }
}

function defaultTransferTitle(files) {
    const firstName = files[0]?.name?.replace(/\.[^.]+$/, "").trim();
    if (firstName) return firstName.slice(0, 100);
    return `Transferencia ${new Intl.DateTimeFormat("es-ES").format(new Date())}`;
}

function showTransferError(message) {
    const element = byId("transferError");
    element.textContent = message || "No se pudo crear la transferencia. Inténtalo de nuevo.";
    element.hidden = false;
}

function hideTransferError() {
    byId("transferError").hidden = true;
}

byId("createTransfer").addEventListener("click", async () => {
    hideTransferError();
    if (!selectedTransferFiles.length) return showTransferError("Añade al menos un archivo para continuar.");
    const sourceFiles = [...selectedTransferFiles];
    const title = byId("transferTitle").value.trim() || defaultTransferTitle(sourceFiles);
    const metadata = {
        title,
        recipientEmail: byId("transferRecipient").value.trim(),
        message: byId("transferMessage").value.trim(),
        password: byId("transferPassword").value
    };
    byId("createTransfer").disabled = true;
    byId("transferUploadStatus").hidden = false;
    byId("transferUploadProgress").style.width = "0%";
    byId("transferUploadText").textContent = "Preparando transferencia…";
    hideError();
    try {
        const capabilities = await readResponse(await fetch("/transfers/capabilities"));
        let data;
        if (capabilities.uploadMode === "multipart") {
            data = await createMultipartTransfer(metadata, sourceFiles);
        } else {
            const formData = new FormData();
            for (const [key, value] of Object.entries(metadata)) formData.append(key, value);
            for (const file of sourceFiles) formData.append("files", file);
            data = await uploadTransfer(formData);
        }
        currentTransferLink = data.link;
        currentTransferId = data.transferId;
        byId("transferLinkInput").value = data.link;
        byId("transferResultSummary").textContent = `${data.fileCount} archivo${data.fileCount === 1 ? "" : "s"} · ${formatBytes(data.totalBytes)}`;
        byId("transferResult").hidden = false;
        byId("convertLatestTransfer").hidden = false;
        clearTimeout(transferResultHideTimer);
        transferResultHideTimer = setTimeout(() => {
            byId("transferResult").hidden = true;
        }, 8000);
        selectedTransferFiles = [];
        clearPendingGuestSelection().catch(() => {});
        renderTransferSelection();
        for (const id of ["transferTitle", "transferRecipient", "transferMessage", "transferPassword"]) byId(id).value = "";
        await Promise.all([loadTransfers(), loadAccount()]);
    } catch (error) {
        showTransferError(`${error.message || "No se pudo completar la subida"} Puedes volver a intentarlo con los mismos archivos.`);
    } finally {
        byId("createTransfer").disabled = !transferCapabilities.acceptingNewTransfers;
        byId("transferUploadStatus").hidden = true;
    }
});

byId("copyTransferLink").addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(currentTransferLink);
        byId("copyTransferLink").textContent = "Enlace copiado ✓";
        setTimeout(() => { byId("copyTransferLink").textContent = "Copiar enlace"; }, 1800);
    } catch {
        byId("transferLinkInput").select();
    }
});
byId("openTransferLink").addEventListener("click", () => window.open(currentTransferLink, "_blank"));

async function loadTransfers() {
    const response = await fetch("/transfers");
    const data = await readResponse(response);
    latestTransfers = data.transfers;
    const container = byId("transfersList");
    container.replaceChildren();
    byId("transfersEmpty").hidden = data.transfers.length !== 0;
    for (const transfer of data.transfers) container.appendChild(createTransferCard(transfer));
}

function createTransferCard(transfer) {
    const card = document.createElement("article");
    card.className = "transfer-card-admin";
    const body = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = transfer.title;
    const meta = document.createElement("p");
    const incomplete = transfer.status !== "ready";
    meta.textContent = incomplete
        ? `${transfer.fileCount} archivo${transfer.fileCount === 1 ? "" : "s"} · Subida incompleta`
        : `${transfer.fileCount} archivo${transfer.fileCount === 1 ? "" : "s"} · ${formatBytes(transfer.totalBytes)} · ${transfer.expired ? "Caducada" : `Caduca ${formatDate(transfer.expiresAt)}`}`;
    const actions = document.createElement("div");
    actions.className = "delivery-actions";
    const open = document.createElement("a");
    open.className = "delivery-action delivery-open";
    open.href = transfer.link;
    open.target = "_blank";
    open.rel = "noopener";
    open.textContent = "Abrir";
    const copy = actionButton("Copiar enlace", "delivery-copy", () => copyDeliveryLink(transfer.link, copy));
    const send = actionButton("Enviar", "delivery-send", () => sendTransfer(transfer, send));
    const remove = actionButton("Eliminar", "delivery-delete", () => openDeleteTransferDialog(transfer));
    if (!incomplete) {
        actions.append(open, copy);
        if (transfer.recipientEmail) actions.append(send);
        if (!transfer.expired) {
            const convert = actionButton(
                transfer.conversion?.status === "ready"
                    ? "Abrir galería creada"
                    : (["pending", "building"].includes(transfer.conversion?.status)
                        ? "Conversión en curso…"
                        : (transfer.conversion?.status === "failed"
                            ? "Reintentar conversión"
                            : "Convertir en galería")),
                "delivery-convert",
                () => {
                    if (transfer.conversion?.status === "ready") {
                        openEditDelivery(transfer.conversion.deliveryId);
                    } else if (["pending", "building"].includes(transfer.conversion?.status)) {
                        watchConversion(transfer.id, transfer.conversion.id)
                            .catch((error) => showTransferError(error.message));
                    } else if (transfer.conversion?.status === "failed") {
                        retryConversion(transfer.id, transfer.conversion.id);
                    } else {
                        openConvertDialog(transfer.id);
                    }
                }
            );
            actions.append(convert);
        }
    }
    actions.append(remove);
    body.append(title, meta, actions);
    const stats = document.createElement("div");
    stats.className = "transfer-stats";
    const count = document.createElement("strong");
    count.textContent = String(transfer.downloadCount);
    const label = document.createElement("span");
    label.textContent = transfer.downloadCount === 1 ? "descarga" : "descargas";
    if (incomplete) {
        stats.classList.add("transfer-incomplete");
        count.textContent = "!";
        label.textContent = "elimina y vuelve a intentarlo";
    }
    stats.append(count, label);
    card.append(body, stats);
    return card;
}

function conversionSelectedIds() {
    return [...byId("convertFiles").querySelectorAll(
        'input[data-convert-file]:checked'
    )].map((input) => input.value);
}

function updateConversionSelection() {
    const selected = conversionSelectedIds();
    const files = conversionContext?.options?.compatible || [];
    const total = files.filter((file) => selected.includes(file.sourceId))
        .reduce((sum, file) => sum + file.size, 0);
    byId("convertSelectionSummary").textContent =
        `${selected.length} seleccionados · ${formatBytes(total)}`;
    byId("startConversion").disabled = selected.length === 0;
    byId("toggleConvertFiles").textContent = selected.length === files.length
        ? "Deseleccionar todos" : "Seleccionar todos";
}

async function openConvertDialog(transferId) {
    const dialog = byId("convertDialog");
    const error = byId("convertError");
    error.hidden = true;
    byId("convertProgress").hidden = true;
    byId("convertFiles").replaceChildren();
    try {
        const options = await readResponse(await fetch(
            `/transfers/${encodeURIComponent(transferId)}/conversion-options`
        ));
        if (!options.conversionEnabled) {
            throw new Error("Las conversiones están pausadas temporalmente.");
        }
        conversionContext = {
            transferId,
            options,
            idempotencyKey: crypto.randomUUID()
        };
        if (options.usage.galleryCount + Number(options.usage.reservedGalleryCount || 0)
            >= options.usage.galleryLimit) {
            throw new Error(
                `Ya tienes ${options.usage.galleryLimit} galerías. Elimina una antes de convertir esta transferencia.`
            );
        }
        byId("convertClientName").value = options.transfer.title || "";
        byId("convertClientEmail").value = "";
        byId("convertMessage").value = options.transfer.message || "";
        for (const file of options.compatible) {
            const label = document.createElement("label");
            label.className = "convert-file";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = file.sourceId;
            checkbox.dataset.convertFile = "true";
            checkbox.checked = true;
            checkbox.addEventListener("change", updateConversionSelection);
            const copy = document.createElement("span");
            const name = document.createElement("strong");
            const detail = document.createElement("small");
            name.textContent = file.name;
            detail.textContent = `${file.mediaType === "image" ? "Fotografía" : "Vídeo"} · ${formatBytes(file.size)}`;
            copy.append(name, detail);
            label.append(checkbox, copy);
            if (file.mediaType === "image") {
                const cover = document.createElement("input");
                cover.type = "radio";
                cover.name = "convertCover";
                cover.value = file.sourceId;
                cover.title = "Usar como portada";
                cover.setAttribute("aria-label", `Usar ${file.name} como portada`);
                if (!byId("convertFiles").querySelector('input[name="convertCover"]')) {
                    cover.checked = true;
                }
                const coverText = document.createElement("em");
                coverText.textContent = "Portada";
                label.append(cover, coverText);
            }
            byId("convertFiles").appendChild(label);
        }
        const excluded = byId("convertExcluded");
        excluded.hidden = options.excluded.length === 0;
        excluded.replaceChildren();
        if (options.excluded.length) {
            const title = document.createElement("strong");
            title.textContent = `${options.excluded.length} archivo${options.excluded.length === 1 ? "" : "s"} no se incluirán`;
            const list = document.createElement("ul");
            for (const file of options.excluded) {
                const item = document.createElement("li");
                item.textContent = `${file.name}: ${file.reason}`;
                list.appendChild(item);
            }
            excluded.append(title, list);
        }
        if (!options.compatible.length) {
            error.textContent = "Esta transferencia no contiene fotos o vídeos compatibles.";
            error.hidden = false;
        }
        updateConversionSelection();
        dialog.showModal();
    } catch (requestError) {
        showTransferError(requestError.message);
    }
}

async function finishSuccessfulConversion(conversion) {
    byId("convertProgress").textContent = "Galería creada. Abriendo el editor…";
    await Promise.all([loadDeliveries(), loadTransfers(), loadAccount()]);
    byId("convertDialog").close();
    showWorkspaceView("galleries");
    await openEditDelivery(conversion.deliveryId);
}

async function retryConversion(transferId, jobId) {
    try {
        const data = await readResponse(await fetch(
            `/transfers/${encodeURIComponent(transferId)}/conversions/${encodeURIComponent(jobId)}/retry`,
            { method: "POST" }
        ));
        await watchConversion(transferId, data.conversion.id);
    } catch (error) {
        showTransferError(error.message);
    }
}

async function watchConversion(transferId, jobId) {
    const dialog = byId("convertDialog");
    if (!dialog.open) dialog.showModal();
    const progress = byId("convertProgress");
    progress.hidden = false;
    for (let attempt = 0; attempt < 300; attempt += 1) {
        const data = await readResponse(await fetch(
            `/transfers/${encodeURIComponent(transferId)}/conversions/${encodeURIComponent(jobId)}`
        ));
        const conversion = data.conversion;
        progress.textContent = conversion.status === "pending"
            ? "Conversión en cola…"
            : `Preparando galería… ${conversion.progress}%`;
        if (conversion.status === "ready") {
            await finishSuccessfulConversion(conversion);
            return;
        }
        if (conversion.status === "failed") {
            throw new Error("La conversión se interrumpió. Puedes reintentarlo desde esta transferencia.");
        }
        await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    throw new Error("La conversión continúa en segundo plano. Puedes cerrar esta ventana y volver después.");
}

byId("convertForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!conversionContext) return;
    const error = byId("convertError");
    const button = byId("startConversion");
    error.hidden = true;
    button.disabled = true;
    button.textContent = "Preparando…";
    try {
        const cover = byId("convertFiles").querySelector(
            'input[name="convertCover"]:checked'
        );
        const data = await readResponse(await fetch(
            `/transfers/${encodeURIComponent(conversionContext.transferId)}/conversions`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    idempotencyKey: conversionContext.idempotencyKey,
                    selectedFileIds: conversionSelectedIds(),
                    coverFileId: cover?.value || "",
                    clientName: byId("convertClientName").value.trim(),
                    clientEmail: byId("convertClientEmail").value.trim(),
                    message: byId("convertMessage").value.trim()
                })
            }
        ));
        await watchConversion(conversionContext.transferId, data.conversion.id);
    } catch (requestError) {
        error.textContent = requestError.message;
        error.hidden = false;
    } finally {
        button.disabled = false;
        button.textContent = "Crear galería";
    }
});

byId("toggleConvertFiles").addEventListener("click", () => {
    const boxes = [...byId("convertFiles").querySelectorAll(
        "input[data-convert-file]"
    )];
    const select = boxes.some((box) => !box.checked);
    for (const box of boxes) box.checked = select;
    updateConversionSelection();
});
function closeConvertDialog() {
    if (!byId("startConversion").disabled) byId("convertDialog").close();
}
byId("closeConvertDialog").addEventListener("click", closeConvertDialog);
byId("cancelConvertDialog").addEventListener("click", closeConvertDialog);
byId("convertLatestTransfer").addEventListener("click", () => {
    if (currentTransferId) openConvertDialog(currentTransferId);
});

async function sendTransfer(transfer, button) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Enviando…";
    try {
        const response = await fetch(`/transfers/${encodeURIComponent(transfer.id)}/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: transfer.recipientEmail })
        });
        const data = await readResponse(response);
        button.textContent = data.delivered ? "Enviada ✓" : "Correo pendiente";
    } catch (error) {
        button.textContent = original;
        showError(error.message);
    } finally {
        button.disabled = false;
    }
}

function openDeleteTransferDialog(transfer) {
    pendingDeletion = { type: "transfer", transfer };
    deleteDialogTitle.textContent = "Eliminar transferencia";
    deleteDialogMessage.textContent = `Se eliminarán “${transfer.title}” y todos sus archivos.`;
    confirmDeleteButton.textContent = "Eliminar transferencia";
    confirmDeleteButton.disabled = false;
    deleteDialog.showModal();
}

deleteAllDeliveriesButton.addEventListener("click", () => {
    pendingDeletion = { type: "all" };
    deleteDialogTitle.textContent = "Eliminar todas las entregas";
    deleteDialogMessage.textContent = "Se borrarán todas las galerías y fotografías. Esta acción no se puede deshacer.";
    confirmDeleteButton.textContent = "Eliminar todas";
    confirmDeleteButton.disabled = false;
    deleteDialog.showModal();
});

function openDeleteDeliveryDialog(delivery) {
    pendingDeletion = { type: "single", delivery };
    deleteDialogTitle.textContent = "Eliminar entrega";
    deleteDialogMessage.textContent = `Se eliminará la entrega de ${delivery.clientName} y todas sus fotografías.`;
    confirmDeleteButton.textContent = "Eliminar entrega";
    confirmDeleteButton.disabled = false;
    deleteDialog.showModal();
}

cancelDeleteDialogButton.addEventListener("click", () => {
    if (!deletionInProgress) deleteDialog.close();
});
confirmDeleteButton.addEventListener("click", async () => {
    if (!pendingDeletion) return;
    const deletion = pendingDeletion;
    const all = deletion.type === "all";
    deletionInProgress = true;
    confirmDeleteButton.disabled = true;
    cancelDeleteDialogButton.disabled = true;
    confirmDeleteButton.textContent = "Eliminando…";
    deleteDialogError.hidden = true;
    try {
        const endpoint = deletion.type === "transfer"
            ? `/transfers/${encodeURIComponent(deletion.transfer.id)}`
            : all
                ? "/deliveries"
                : `/deliveries/${encodeURIComponent(deletion.delivery.id)}`;
        const response = await fetch(
            endpoint,
            { method: "DELETE" }
        );
        await readResponse(response);
        deleteDialog.close();
        if (all) result.hidden = true;
        if (deletion.type === "transfer") await loadTransfers();
        else await loadDeliveries();
        await loadAccount();
    } catch (error) {
        deleteDialogError.textContent = error.message;
        deleteDialogError.hidden = false;
    } finally {
        deletionInProgress = false;
        confirmDeleteButton.disabled = false;
        cancelDeleteDialogButton.disabled = false;
    }
});
deleteDialog.addEventListener("close", () => {
    pendingDeletion = null;
    deleteDialogError.hidden = true;
});

const PENDING_DB_NAME = "straclase-pending";
const PENDING_STORE_NAME = "pending-transfers";
const PENDING_RECORD_KEY = "guest-selection";

function openPendingDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(PENDING_DB_NAME, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(PENDING_STORE_NAME)) {
                request.result.createObjectStore(PENDING_STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function readPendingGuestSelection() {
    const database = await openPendingDatabase();
    const record = await new Promise((resolve, reject) => {
        const request = database.transaction(PENDING_STORE_NAME)
            .objectStore(PENDING_STORE_NAME).get(PENDING_RECORD_KEY);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    database.close();
    return record;
}

async function clearPendingGuestSelection() {
    const database = await openPendingDatabase();
    await new Promise((resolve, reject) => {
        const transaction = database.transaction(PENDING_STORE_NAME, "readwrite");
        transaction.objectStore(PENDING_STORE_NAME).delete(PENDING_RECORD_KEY);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    });
    database.close();
}

async function restorePendingGuestSelection() {
    const url = new URL(window.location.href);
    const record = await readPendingGuestSelection();
    if (!record || Date.now() - Number(record.savedAt) > 24 * 60 * 60 * 1000
        || !Array.isArray(record.files) || !record.files.length) {
        await clearPendingGuestSelection().catch(() => {});
        return;
    }
    addTransferFiles(record.files);
    showWorkspaceView("transfers");
    if (url.searchParams.get("resumeGuest") === "1") {
        byId("transferCreator").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    url.searchParams.delete("resumeGuest");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

async function handleRequestedTransferConversion() {
    const url = new URL(window.location.href);
    const claimTransferId = url.searchParams.get("claimTransfer") || "";
    const convertTransferId = url.searchParams.get("convertTransfer") || "";
    const transferId = claimTransferId || convertTransferId;
    const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!transferId || !validId.test(transferId)) return;

    showWorkspaceView("transfers");
    if (claimTransferId) {
        await readResponse(await fetch(
            "/transfers/" + encodeURIComponent(claimTransferId) + "/claim",
            { method: "POST" }
        ));
        try {
            localStorage.removeItem("straclase-pending-transfer-claim");
        } catch {}
        await Promise.all([loadTransfers(), loadAccount()]);
    }

    url.searchParams.delete("claimTransfer");
    url.searchParams.delete("convertTransfer");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    await openConvertDialog(transferId);
}

Promise.all([
    loadBrandProfile(), loadDeliveries(), loadTransfers(), loadAccount(),
    loadTransferCapabilities(), loadGalleryCapabilities()
]).then(async () => {
    const url = new URL(window.location.href);
    const analyticsAuth = url.searchParams.get("analyticsAuth");
    if (["signup", "login"].includes(analyticsAuth)) {
        await window.straclaseAnalytics?.identify(accountData?.analyticsDistinctId);
        if (analyticsAuth === "signup") {
            await window.straclaseAnalytics?.capture("signup_completed");
        }
        await window.straclaseAnalytics?.capture("login_completed");
        url.searchParams.delete("analyticsAuth");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
    const billingResult = url.searchParams.get("billing");
    await restorePendingGuestSelection().catch(() => {});
    await handleRequestedTransferConversion().catch((error) => {
        showWorkspaceView("transfers");
        showTransferError(error.message);
    });
    if (!["success", "cancel"].includes(billingResult)) return;
    accountDialog.showModal();
    byId("billingMessage").textContent = billingResult === "success"
        ? "Pago completado. Stripe está actualizando tu plan; puede tardar unos segundos."
        : "No se realizó ningún cambio en tu plan.";
    url.searchParams.delete("billing");
    url.searchParams.delete("session_id");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}).catch((error) => {
    showError(error.message);
});
