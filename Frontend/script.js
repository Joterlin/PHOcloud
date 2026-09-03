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
const transferCreator = byId("transferCreator");
const transfersPanel = byId("transfersPanel");

const MAX_FILES = 500;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_VIDEO_SIZE = 500 * 1024 * 1024;
const MAX_TOTAL_SIZE = 10 * 1024 * 1024 * 1024;
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
let selectedTransferFiles = [];
let currentTransferLink = "";
const MAX_TRANSFER_FILE_SIZE = 50 * 1024 * 1024 * 1024;
const MAX_TRANSFER_TOTAL_SIZE = 50 * 1024 * 1024 * 1024;
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
    formData.append("selectionLimit", byId("selectionLimit").value || "0");
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
    const remove = actionButton("×", "remove-link", () => row.remove());
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
    });

    container.appendChild(row);
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
    const x = Number(elements.positionX.value) || 50;
    const y = Number(elements.positionY.value) || 50;
    const scale = Number(elements.scale.value) || 100;
    elements.image.style.transform = `translate(${(x - 50) * .35}%, ${(y - 50) * .35}%) scale(${scale / 100})`;
}

function previewSelectedLogo(prefix, file) {
    if (!file) return;
    const elements = logoElements(prefix);
    const objectUrl = URL.createObjectURL(file);
    elements.image.src = objectUrl;
    elements.image.onload = () => URL.revokeObjectURL(objectUrl);
    elements.preview.hidden = false;
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
    finally { window.location.replace("/login"); }
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
    byId("accountName").textContent = accountData.displayName || accountData.username;
    byId("accountPlan").textContent = `${planLabel(accountData.plan)} · ${usage.galleryCount}/${usage.galleryLimit} galerías`;
    byId("accountDisplayName").textContent = accountData.displayName || accountData.username;
    byId("accountEmail").textContent = accountData.email || `@${accountData.username}`;
    byId("accountAvatar").textContent = (accountData.displayName || accountData.username).slice(0, 1).toUpperCase();
    byId("accountPlanBadge").textContent = planLabel(accountData.plan).replace("Plan ", "");
    byId("galleryUsageText").textContent = `${usage.galleryCount}/${usage.galleryLimit} galerías`;
    byId("galleryUsageBar").style.width = `${galleryPercent}%`;
    byId("storageUsageText").textContent = `${formatBytes(usage.storageBytes)} de ${formatBytes(usage.storageLimitBytes)}`;
    byId("storageUsageBar").style.width = `${storagePercent}%`;
    byId("transferUsageText").textContent = `${formatBytes(usage.transferStorageBytes)} de ${formatBytes(usage.transferStorageLimitBytes)}`;
    byId("transferUsageBar").style.width = `${transferPercent}%`;
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
}

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
    if (brandProfile.logoUrl) {
        byId("profileLogoImage").src = brandProfile.logoUrl;
    }
    updateLogoPreview("profile");
    brandDialogError.hidden = true;
    brandDialog.showModal();
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
    byId("editPassword").value = "";
    byId("removePassword").checked = false;
    byId("removePasswordLabel").hidden = !delivery.hasPassword;
    byId("editViewingEnabled").checked = delivery.viewingEnabled;
    byId("editAllowOriginalDownload").checked = delivery.allowOriginalDownload;
    byId("editAllowWebDownload").checked = delivery.allowWebDownload;
    byId("editFavoritesEnabled").checked = delivery.favoritesEnabled;
    byId("editSelectionLimit").value = delivery.selection?.selectionLimit || 0;
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
    updateEditCoverPreview();
    byId("editLogo").value = "";
    byId("removeEditLogo").checked = false;
    byId("removeEditLogoLabel").hidden = !delivery.hasLogo;
    byId("editLogoPreview").hidden = !delivery.hasLogo;
    if (delivery.logoUrl) byId("editLogoImage").src = `${delivery.logoUrl}?v=${Date.now()}`;
    updateLogoPreview("edit");
    renderSelectionAdmin();
    renderSections();
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

function updateEditCoverPreview() {
    if (!currentEditDelivery) return;
    const image = byId("editCoverPreviewImage");
    const cover = currentEditDelivery.coverFilename
        || currentEditDelivery.files?.find((filename) => currentEditDelivery.mediaTypes?.[filename] !== "video");
    byId("editCoverPreview").dataset.style = byId("editCoverStyle").value;
    byId("editCoverPreviewTitle").textContent = byId("editClientName").value
        || currentEditDelivery.clientName;
    image.hidden = !cover || byId("editCoverStyle").value === "none";
    if (cover) {
        image.src = `/gallery/${encodeURIComponent(currentEditDelivery.id)}/previews/${encodeURIComponent(cover)}`;
        image.style.objectPosition = `${byId("editCoverPositionX").value}% ${byId("editCoverPositionY").value}%`;
    }
}

for (const id of ["editCoverStyle", "editCoverPositionX", "editCoverPositionY", "editClientName"]) {
    byId(id).addEventListener("input", updateEditCoverPreview);
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
        selectionLimit: byId("editSelectionLimit").value || 0,
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
    const galleries = product === "galleries";
    byId("showGalleries").classList.toggle("is-active", galleries);
    byId("showTransfers").classList.toggle("is-active", !galleries);
    byId("galleryCreator").hidden = !galleries;
    byId("deliveriesPanel").hidden = !galleries;
    transferCreator.hidden = galleries;
    transfersPanel.hidden = galleries;
}

byId("showGalleries").addEventListener("click", () => showProduct("galleries"));
byId("showTransfers").addEventListener("click", () => showProduct("transfers"));
showProduct("transfers");

function transferFileExtension(file) {
    return file.name.split(".").pop()?.toLowerCase() || "";
}

function addTransferFiles(files) {
    hideError();
    const blocked = files.find((file) => blockedTransferExtensions.has(transferFileExtension(file)));
    if (blocked) return showError(`${blocked.name} no está permitido por seguridad`);
    const oversized = files.find((file) => file.size > MAX_TRANSFER_FILE_SIZE);
    if (oversized) return showError(`${oversized.name} supera el máximo de 50 GB`);
    const existing = new Set(selectedTransferFiles.map(fileKey));
    const unique = files.filter((file) => !existing.has(fileKey(file)));
    if (selectedTransferFiles.length + unique.length > 500) {
        return showError("Cada transferencia admite como máximo 500 archivos");
    }
    const total = [...selectedTransferFiles, ...unique]
        .reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_TRANSFER_TOTAL_SIZE) {
        return showError("La transferencia no puede superar 50 GB");
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
        byId("transferLinkInput").value = data.link;
        byId("transferResultSummary").textContent = `${data.fileCount} archivo${data.fileCount === 1 ? "" : "s"} · ${formatBytes(data.totalBytes)}`;
        byId("transferResult").hidden = false;
        selectedTransferFiles = [];
        renderTransferSelection();
        for (const id of ["transferTitle", "transferRecipient", "transferMessage", "transferPassword"]) byId(id).value = "";
        await Promise.all([loadTransfers(), loadAccount()]);
    } catch (error) {
        showTransferError(`${error.message || "No se pudo completar la subida"} Puedes volver a intentarlo con los mismos archivos.`);
    } finally {
        byId("createTransfer").disabled = false;
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

Promise.all([
    loadBrandProfile(), loadDeliveries(), loadTransfers(), loadAccount()
]).then(() => {
    const url = new URL(window.location.href);
    const billingResult = url.searchParams.get("billing");
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
