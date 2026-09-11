const byId = (id) => document.getElementById(id);
const transferId = window.location.pathname.split("/").filter(Boolean).pop();

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

function readableAccent(accent, background) {
    if (contrastRatio(accent, background) >= 4.5) return accent;
    const target = relativeLuminance(background) > .35 ? "#000000" : "#ffffff";
    const source = rgbFromHex(accent);
    const destination = rgbFromHex(target);
    for (let amount = .08; amount <= 1; amount += .08) {
        const candidate = hexFromRgb(source.map((value, index) =>
            value + (destination[index] - value) * amount
        ));
        if (contrastRatio(candidate, background) >= 4.5) return candidate;
    }
    return target;
}

function foregroundFor(color) {
    return contrastRatio(color, "#111111") >= contrastRatio(color, "#ffffff")
        ? "#111111"
        : "#ffffff";
}

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
    const accent = data.accentColor || "#c9aa70";
    const background = data.backgroundColor || "#ffffff";
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-readable", readableAccent(accent, background));
    document.documentElement.style.setProperty("--accent-foreground", foregroundFor(accent));
    document.documentElement.style.setProperty("--page-bg", background);
    const light = relativeLuminance(background) > .36;
    document.documentElement.style.setProperty("--text", light ? "#171717" : "#f5f3ef");
    document.documentElement.style.colorScheme = light ? "light" : "dark";
    const brandName = data.brandName?.trim() || "";
    const usesSystemBrand = !data.logoUrl && (!brandName || brandName.toLowerCase() === "straclase");
    byId("transferSystemLogo").hidden = !usesSystemBrand;
    byId("transferSystemLogo").style.filter = light ? "none" : "invert(1) brightness(1.2)";
    byId("transferBrand").textContent = brandName || "Straclase";
    byId("transferLogo").hidden = !data.logoUrl;
    byId("transferBrand").hidden = Boolean(data.logoUrl);
    if (data.logoUrl) byId("transferLogo").src = data.logoUrl;
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
    document.title = `${data.title} · Straclase`;
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

function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

byId("downloadAll").addEventListener("click", async (event) => {
    event.preventDefault();
    const button = byId("downloadAll");
    const initial = button.innerHTML;
    const status = byId("zipStatus");
    status.hidden = false;
    status.classList.remove("is-error");
    status.textContent = "Preparando un único paquete reutilizable. Puedes seguir descargando archivos por separado.";
    button.setAttribute("aria-disabled", "true");
    button.style.pointerEvents = "none";
    try {
        let response = await fetch(apiUrl("/zip"), { method: "POST" });
        let data = await response.json();
        if (!response.ok && response.status !== 202) {
            throw new Error(data.error || "No se pudo preparar el ZIP");
        }
        for (let attempt = 0; data.status === "building" && attempt < 1200; attempt += 1) {
            button.textContent = "Preparando ZIP…";
            await wait(1500);
            response = await fetch(apiUrl("/zip"));
            data = await response.json();
            if (!response.ok && response.status !== 202) {
                throw new Error(data.error || "No se pudo preparar el ZIP");
            }
        }
        if (data.status !== "ready" || !data.url) {
            throw new Error("El ZIP está tardando demasiado. Puedes descargar los archivos uno a uno.");
        }
        button.textContent = "ZIP listo ✓";
        status.textContent = "ZIP listo. La descarga comenzará ahora.";
        window.location.assign(data.url);
    } catch (error) {
        status.textContent = error.message;
        status.classList.add("is-error");
    } finally {
        button.innerHTML = initial;
        button.removeAttribute("aria-disabled");
        button.style.pointerEvents = "";
    }
});

loadTransfer();
