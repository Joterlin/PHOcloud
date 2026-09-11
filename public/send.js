const byId = (id) => document.getElementById(id);
let capabilities = null;
let selectedFiles = [];
let senderVerifiedEmail = "";
let authenticated = false;
let latestTransferId = "";
let conversionPreviewUrls = [];
const PENDING_TRANSFER_CLAIM_KEY = "straclase-pending-transfer-claim";
const GALLERY_PHOTO_EXTENSIONS = new Set([
    "jpg", "jpeg", "png", "gif", "webp", "avif", "heic", "heif"
]);

function isGalleryPhotoFile(file) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    return GALLERY_PHOTO_EXTENSIONS.has(extension);
}

function isPhotoOnlyGallerySelection(files) {
    return files.length > 0
        && files.length <= 500
        && files.every((file) => isGalleryPhotoFile(file)
            && file.size <= 50 * 1024 * 1024)
        && files.reduce((sum, file) => sum + file.size, 0)
            <= 10 * 1024 * 1024 * 1024;
}

function renderConversionPreview(files) {
    for (const url of conversionPreviewUrls) URL.revokeObjectURL(url);
    conversionPreviewUrls = [];
    const preview = byId("conversionPreview");
    preview.replaceChildren();
    if (!isPhotoOnlyGallerySelection(files)) return false;
    for (const file of files.slice(0, 4)) {
        const tile = document.createElement("span");
        tile.className = "conversion-preview-tile";
        const image = document.createElement("img");
        const url = URL.createObjectURL(file);
        conversionPreviewUrls.push(url);
        image.src = url;
        image.alt = "";
        image.addEventListener("error", () => {
            image.remove();
            tile.classList.add("is-fallback");
            tile.textContent = "FOTO";
        }, { once: true });
        tile.appendChild(image);
        preview.appendChild(tile);
    }
    if (files.length > 4) {
        const more = document.createElement("span");
        more.className = "conversion-preview-more";
        more.textContent = `+${files.length - 4}`;
        preview.appendChild(more);
    }
    return true;
}

function shareMethod() {
    return document.querySelector('input[name="shareMethod"]:checked')?.value || "link";
}

function updateShareMethod() {
    const byEmail = shareMethod() === "email";
    byId("recipientEmailGroup").hidden = !byEmail;
    byId("senderEmailGroup").hidden = !byEmail;
    byId("recipientEmail").required = byEmail;
    byId("senderEmail").required = byEmail;
    if (!byEmail) {
        byId("senderVerification").hidden = true;
        byId("senderVerificationStatus").hidden = true;
    } else if (senderVerifiedEmail === normalizedSenderEmail()) {
        setVerificationStatus(
            "Correo confirmado. El destinatario podrá responderte directamente.",
            "success"
        );
    }
    byId("continueButton").textContent = byEmail
        ? "Subir y enviar por correo"
        : "Crear enlace";
}

function normalizedSenderEmail() {
    return byId("senderEmail").value.trim().toLowerCase();
}

function setVerificationStatus(message, state = "") {
    const status = byId("senderVerificationStatus");
    status.textContent = message;
    status.className = `verification-status ${state}`.trim();
    status.hidden = !message;
}

function markSenderVerified(email) {
    senderVerifiedEmail = email.toLowerCase();
    byId("senderVerification").hidden = true;
    byId("requestSenderCode").textContent = "Verificado ✓";
    byId("requestSenderCode").disabled = true;
    if (shareMethod() === "email") {
        setVerificationStatus(
            "Correo confirmado. El destinatario podrá responderte directamente.",
            "success"
        );
    }
}

function invalidateSenderVerification() {
    if (normalizedSenderEmail() === senderVerifiedEmail) return;
    senderVerifiedEmail = "";
    byId("requestSenderCode").textContent = "Verificar correo";
    byId("requestSenderCode").disabled = false;
    byId("senderVerification").hidden = true;
    setVerificationStatus("");
}

async function requestSenderVerification() {
    const input = byId("senderEmail");
    if (!input.checkValidity()) {
        input.reportValidity();
        return false;
    }
    const button = byId("requestSenderCode");
    button.disabled = true;
    button.textContent = "Enviando…";
    byId("sendError").hidden = true;
    try {
        const data = await readResponse(await fetch(
            "/transfer-sender-verification/request",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: normalizedSenderEmail() })
            }
        ));
        if (data.verified) {
            markSenderVerified(data.email);
            return true;
        }
        byId("senderVerification").hidden = false;
        byId("senderCode").value = data.devCode || "";
        byId("senderCode").focus();
        setVerificationStatus(
            data.delivered
                ? "Te hemos enviado un código. Caduca en 10 minutos."
                : "Introduce el código de prueba para continuar."
        );
        button.textContent = "Reenviar en 1 min";
        setTimeout(() => {
            if (!senderVerifiedEmail) {
                button.disabled = false;
                button.textContent = "Reenviar código";
            }
        }, 60_000);
        return false;
    } catch (error) {
        button.disabled = false;
        button.textContent = "Verificar correo";
        showError(error.message || "No se pudo enviar el código");
        return false;
    }
}

async function confirmSenderCode() {
    const input = byId("senderCode");
    if (!input.checkValidity()) {
        input.reportValidity();
        return false;
    }
    const button = byId("verifySenderCode");
    button.disabled = true;
    button.textContent = "Comprobando…";
    byId("sendError").hidden = true;
    try {
        const data = await readResponse(await fetch(
            "/transfer-sender-verification/verify",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: normalizedSenderEmail(),
                    code: input.value.trim()
                })
            }
        ));
        markSenderVerified(data.email);
        return true;
    } catch (error) {
        showError(error.message || "No se pudo confirmar el código");
        return false;
    } finally {
        button.disabled = false;
        button.textContent = "Confirmar código";
    }
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

async function readResponse(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "No se pudo completar la operación");
    return data;
}

function showError(message) {
    byId("sendError").textContent = message;
    byId("sendError").hidden = false;
}

function setProgress(percent, message) {
    byId("uploadStatus").hidden = false;
    byId("uploadProgress").style.width = `${Math.max(0, Math.min(100, percent))}%`;
    byId("uploadText").textContent = message;
}

function renderSelection() {
    const total = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    const hasFiles = selectedFiles.length > 0;
    byId("selection").hidden = !hasFiles;
    byId("sendOptions").hidden = !hasFiles;
    byId("selectionCount").textContent = `${selectedFiles.length} archivo${selectedFiles.length === 1 ? "" : "s"}`;
    byId("selectionSize").textContent = formatBytes(total);
    byId("fileList").replaceChildren(...selectedFiles.slice(0, 30).map((file) => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        const size = document.createElement("span");
        name.textContent = file.name;
        size.textContent = formatBytes(file.size);
        item.append(name, size);
        return item;
    }));
    byId("continueButton").disabled = !hasFiles || !capabilities?.enabled;
}

function selectFiles(files) {
    byId("sendError").hidden = true;
    const next = Array.from(files);
    const total = next.reduce((sum, file) => sum + file.size, 0);
    if (capabilities && next.length > capabilities.maxFiles) {
        return showError(`Puedes seleccionar hasta ${capabilities.maxFiles} archivos.`);
    }
    if (capabilities && next.some((file) => file.size > capabilities.maxFileSize)) {
        return showError("Uno de los archivos supera el tamaño permitido.");
    }
    if (capabilities && total > capabilities.maxTotalSize) {
        return showError(`La selección supera ${formatBytes(capabilities.maxTotalSize)}.`);
    }
    selectedFiles = next;
    renderSelection();
}

function defaultTitle() {
    const first = selectedFiles[0]?.name?.replace(/\.[^.]+$/, "").trim();
    return first ? first.slice(0, 100) : "Transferencia";
}

async function retryPart(url, body, attempts = 3) {
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

async function runPool(items, concurrency, worker) {
    let nextIndex = 0;
    async function run() {
        while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;
            await worker(items[index]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
}

async function createMultipartTransfer(metadata) {
    let prepared;
    try {
        prepared = await readResponse(await fetch("/transfers/multipart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...metadata,
                files: selectedFiles.map((file) => ({
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
            const sourceFile = selectedFiles[fileIndex];
            const endpoint = `/transfers/${encodeURIComponent(prepared.transferId)}/files/${encodeURIComponent(remoteFile.id)}`;
            const start = await readResponse(await fetch(`${endpoint}/start`, { method: "POST" }));
            if (!start.ready) {
                const partNumbers = Array.from({ length: start.partCount }, (_, index) => index + 1);
                for (let index = 0; index < partNumbers.length; index += 9) {
                    const batch = partNumbers.slice(index, index + 9);
                    const signed = await readResponse(await fetch(`${endpoint}/parts`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ partNumbers: batch })
                    }));
                    await runPool(signed.urls, 3, async ({ partNumber, url }) => {
                        const startByte = (partNumber - 1) * start.partSize;
                        const blob = sourceFile.slice(startByte, Math.min(sourceFile.size, startByte + start.partSize));
                        await retryPart(url, blob);
                        uploadedBytes += blob.size;
                        const percent = Math.round(uploadedBytes / totalBytes * 100);
                        setProgress(percent, `Subiendo ${remoteFile.name}… ${percent}%`);
                    });
                }
                await readResponse(await fetch(`${endpoint}/complete`, { method: "POST" }));
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

function createLocalTransfer(metadata) {
    return new Promise((resolve, reject) => {
        const form = new FormData();
        for (const [key, value] of Object.entries(metadata)) form.append(key, value);
        for (const file of selectedFiles) form.append("files", file);
        const request = new XMLHttpRequest();
        request.open("POST", "/transfers");
        request.responseType = "json";
        request.upload.addEventListener("progress", (event) => {
            if (!event.lengthComputable) return;
            const percent = Math.round(event.loaded / event.total * 100);
            setProgress(percent, `Subiendo archivos… ${percent}%`);
        });
        request.addEventListener("load", () => {
            const data = request.response || {};
            if (request.status >= 200 && request.status < 300) resolve(data);
            else reject(new Error(data.error || "No se pudo crear la transferencia"));
        });
        request.addEventListener("error", () => reject(new Error("Se perdió la conexión durante la subida")));
        request.send(form);
    });
}

function showResult(data, deliveryStatus = null) {
    for (const id of ["dropZone", "selection", "sendOptions", "limits", "continueButton", "uploadStatus"]) {
        byId(id).hidden = true;
    }
    byId("resultLink").value = data.link;
    byId("resultSummary").textContent = `${data.fileCount} archivo${data.fileCount === 1 ? "" : "s"} · ${formatBytes(data.totalBytes)} · disponible 24 horas`;
    byId("resultTitle").textContent = deliveryStatus?.delivered
        ? "Transferencia enviada"
        : "Tu transferencia está lista";
    byId("resultDeliveryStatus").hidden = !deliveryStatus;
    byId("resultDeliveryStatus").textContent = deliveryStatus?.message || "";
    byId("resultDeliveryStatus").classList.toggle(
        "warning", Boolean(deliveryStatus?.warning)
    );
    latestTransferId = data.transferId;
    const canConvert = renderConversionPreview(selectedFiles);
    byId("conversionOffer").hidden = !canConvert;
    byId("convertGuestTransfer").textContent = authenticated
        ? "Convertir en galería"
        : "Crear cuenta y convertir en galería";
    byId("conversionOfferText").textContent = authenticated
        ? "Personaliza estas fotos como una galería sin volver a subirlas."
        : "Crea una cuenta gratis y personaliza estas fotos sin volver a subirlas.";
    byId("sendResult").hidden = false;
}

async function emailTransfer(data, email) {
    return readResponse(await fetch(
        `/transfers/${encodeURIComponent(data.transferId)}/send`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        }
    ));
}

byId("guestFiles").addEventListener("change", (event) => selectFiles(event.target.files));
byId("clearFiles").addEventListener("click", () => {
    selectedFiles = [];
    byId("guestFiles").value = "";
    renderSelection();
});
for (const eventName of ["dragenter", "dragover"]) {
    byId("dropZone").addEventListener(eventName, (event) => {
        event.preventDefault();
        byId("dropZone").classList.add("is-over");
    });
}
for (const eventName of ["dragleave", "drop"]) {
    byId("dropZone").addEventListener(eventName, (event) => {
        event.preventDefault();
        byId("dropZone").classList.remove("is-over");
    });
}
byId("dropZone").addEventListener("drop", (event) => selectFiles(event.dataTransfer.files));
for (const input of document.querySelectorAll('input[name="shareMethod"]')) {
    input.addEventListener("change", updateShareMethod);
}
byId("senderEmail").addEventListener("input", invalidateSenderVerification);
byId("requestSenderCode").addEventListener("click", requestSenderVerification);
byId("verifySenderCode").addEventListener("click", confirmSenderCode);
updateShareMethod();

byId("continueButton").addEventListener("click", async () => {
    if (!selectedFiles.length || !capabilities?.enabled) return;
    const button = byId("continueButton");
    button.disabled = true;
    button.textContent = "Enviando…";
    byId("sendError").hidden = true;
    const selectedMethod = shareMethod();
    const recipientEmail = selectedMethod === "email"
        ? byId("recipientEmail").value.trim()
        : "";
    if (selectedMethod === "email" && !byId("recipientEmail").checkValidity()) {
        byId("recipientEmail").reportValidity();
        button.disabled = false;
        updateShareMethod();
        byId("uploadStatus").hidden = true;
        return;
    }
    const senderEmail = selectedMethod === "email"
        ? normalizedSenderEmail()
        : "";
    if (selectedMethod === "email" && !byId("senderEmail").checkValidity()) {
        byId("senderEmail").reportValidity();
        button.disabled = false;
        updateShareMethod();
        return;
    }
    if (selectedMethod === "email" && senderVerifiedEmail !== senderEmail) {
        await requestSenderVerification();
        button.disabled = false;
        updateShareMethod();
        return;
    }
    const metadata = {
        title: byId("sendTitleInput").value.trim() || defaultTitle(),
        message: byId("sendMessage").value.trim(),
        recipientEmail,
        senderEmail,
        password: byId("sendPassword").value
    };
    try {
        setProgress(0, "Preparando transferencia…");
        const data = capabilities.uploadMode === "multipart"
            ? await createMultipartTransfer(metadata)
            : await createLocalTransfer(metadata);
        if (selectedMethod === "email") {
            setProgress(100, "Enviando el correo al destinatario…");
            try {
                const mail = await emailTransfer(data, recipientEmail);
                showResult(data, {
                    delivered: mail.delivered,
                    warning: !mail.delivered,
                    message: mail.message
                });
            } catch (emailError) {
                showResult(data, {
                    delivered: false,
                    warning: true,
                    message: "Los archivos están listos, pero el correo no pudo enviarse. Copia el enlace y compártelo manualmente."
                });
            }
        } else {
            showResult(data);
        }
    } catch (error) {
        showError(`${error.message || "No se pudo completar el envío"}. Puedes intentarlo de nuevo con los mismos archivos.`);
        byId("uploadStatus").hidden = true;
        button.disabled = false;
        updateShareMethod();
    }
});

byId("copyLink").addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(byId("resultLink").value);
        byId("copyLink").textContent = "Enlace copiado ✓";
    } catch {
        byId("resultLink").select();
    }
});
byId("newTransfer").addEventListener("click", () => window.location.reload());
byId("convertGuestTransfer").addEventListener("click", () => {
    if (!latestTransferId) return;
    if (authenticated) {
        window.location.assign(
            `/app?convertTransfer=${encodeURIComponent(latestTransferId)}`
        );
        return;
    }
    try {
        localStorage.setItem(PENDING_TRANSFER_CLAIM_KEY, latestTransferId);
    } catch {}
    const next = `/app?claimTransfer=${encodeURIComponent(latestTransferId)}`;
    window.location.assign(
        `/login?mode=register&next=${encodeURIComponent(next)}`
    );
});

Promise.all([
    fetch("/guest-transfer-capabilities").then(readResponse),
    fetch("/auth/status").then(readResponse)
]).then(([limits, auth]) => {
    capabilities = limits;
    authenticated = Boolean(auth.authenticated);
    byId("limits").textContent = `Hasta ${limits.maxFiles} archivos · ${formatBytes(limits.maxTotalSize)} por envío · disponibles ${limits.retentionHours} horas`;
    if (!limits.enabled) showError(limits.message);
    if (auth.authenticated) {
        byId("loginLink").hidden = true;
        byId("registerLink").hidden = true;
        byId("workspaceLink").hidden = false;
        if (auth.user?.email) {
            byId("senderEmail").value = auth.user.email;
            markSenderVerified(auth.user.email);
        }
    }
    renderSelection();
}).catch(() => {
    showError("No pudimos consultar los límites. Recarga la página para intentarlo de nuevo.");
});
