const byId = (id) => document.getElementById(id);
const transferId = window.location.pathname.split("/").filter(Boolean).pop();

function apiUrl(suffix = "") {
    return `/transfer/${encodeURIComponent(transferId)}${suffix}`;
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(value) {
    return new Intl.DateTimeFormat("es-ES", {
        day: "numeric", month: "long", year: "numeric"
    }).format(new Date(value));
}

function extension(filename) {
    const value = filename.split(".").pop();
    return value && value !== filename ? value.slice(0, 5) : "FILE";
}

function hidePanels() {
    byId("unlockPanel").hidden = true;
    byId("errorPanel").hidden = true;
    byId("transferContent").hidden = true;
}

function showError(message) {
    hidePanels();
    byId("errorTitle").textContent = message.includes("caducado")
        ? "Esta transferencia ha caducado"
        : "Transferencia no disponible";
    byId("errorText").textContent = message.includes("caducado")
        ? "Pide al remitente que prepare un nuevo enlace."
        : message;
    byId("errorPanel").hidden = false;
}

async function loadTransfer() {
    hidePanels();
    try {
        const response = await fetch(apiUrl());
        const data = await response.json();
        if (response.status === 401 && data.requiresPassword) {
            byId("unlockPanel").hidden = false;
            byId("transferPassword").focus();
            return;
        }
        if (!response.ok) throw new Error(data.error || "No se pudo abrir la transferencia");
        renderTransfer(data);
    } catch (error) {
        showError(error.message);
    }
}

function renderTransfer(data) {
    document.documentElement.style.setProperty("--accent", data.accentColor || "#c9aa70");
    document.documentElement.style.setProperty("--page-bg", data.backgroundColor || "#ffffff");
    const background = data.backgroundColor || "#ffffff";
    const rgb = background.slice(1).match(/.{2}/g)?.map((part) => parseInt(part, 16)) || [8,8,8];
    const light = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 150;
    document.documentElement.style.setProperty("--text", light ? "#171717" : "#f5f3ef");
    document.documentElement.style.colorScheme = light ? "light" : "dark";
    const transferLogo = byId("transferLogo");
    const customLogo = Boolean(data.logoUrl);
    byId("transferBrand").textContent = data.brandName || "The Real Gallery";
    byId("transferBrand").hidden = customLogo;
    transferLogo.src = customLogo ? data.logoUrl : "/assets/brand-mark.svg";
    transferLogo.classList.toggle("is-platform-mark", !customLogo);
    transferLogo.hidden = false;
    byId("transferTitle").textContent = data.title;
    byId("transferMessage").textContent = data.message || "";
    byId("transferMessage").hidden = !data.message;
    byId("transferSize").textContent = formatBytes(data.totalBytes);
    byId("transferMeta").textContent = `Disponible hasta el ${formatDate(data.expiresAt)}`;
    byId("fileCount").textContent = `${data.fileCount} archivo${data.fileCount === 1 ? "" : "s"}`;
    byId("downloadAll").href = apiUrl("/download");
    const list = byId("fileList");
    list.replaceChildren();
    for (const file of data.files) {
        const row = document.createElement("article");
        row.className = "file-row";
        const icon = document.createElement("span");
        icon.className = "file-icon";
        icon.textContent = extension(file.name);
        const copy = document.createElement("div");
        copy.className = "file-copy";
        const name = document.createElement("strong");
        name.textContent = file.name;
        const size = document.createElement("span");
        size.textContent = formatBytes(file.size);
        copy.append(name, size);
        const download = document.createElement("a");
        download.href = apiUrl(`/files/${encodeURIComponent(file.id || file.name)}/download`);
        download.textContent = "Descargar";
        row.append(icon, copy, download);
        list.appendChild(row);
    }
    document.title = `${data.title} · The Real Gallery`;
    byId("transferContent").hidden = false;
}

byId("unlockForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = byId("unlockError");
    error.hidden = true;
    try {
        const response = await fetch(apiUrl("/unlock"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: byId("transferPassword").value })
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "No se pudo abrir la transferencia");
        }
        byId("transferPassword").value = "";
        await loadTransfer();
    } catch (caught) {
        error.textContent = caught.message;
        error.hidden = false;
    }
});

byId("shareTransfer").addEventListener("click", async () => {
    const data = { title: document.title, url: window.location.href };
    try {
        if (navigator.share) await navigator.share(data);
        else {
            await navigator.clipboard.writeText(window.location.href);
            byId("shareTransfer").textContent = "Enlace copiado ✓";
        }
    } catch {}
});

loadTransfer();
