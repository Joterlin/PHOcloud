const byId = (id) => document.getElementById(id);
const DB_NAME = "the-real-gallery-pending";
const STORE_NAME = "pending-transfers";
const RECORD_KEY = "guest-selection";
let capabilities = null;
let selectedFiles = [];

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                request.result.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveSelection() {
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put({
            files: selectedFiles,
            savedAt: Date.now()
        }, RECORD_KEY);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    });
    database.close();
}

function renderSelection() {
    const total = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    byId("selection").hidden = selectedFiles.length === 0;
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
    byId("continueButton").disabled = selectedFiles.length === 0;
}

function selectFiles(files) {
    byId("sendError").hidden = true;
    const next = Array.from(files);
    const total = next.reduce((sum, file) => sum + file.size, 0);
    if (capabilities && next.length > capabilities.maxFiles) {
        byId("sendError").textContent = `Puedes seleccionar hasta ${capabilities.maxFiles} archivos.`;
        byId("sendError").hidden = false;
        return;
    }
    if (capabilities && next.some((file) => file.size > capabilities.maxFileSize)) {
        byId("sendError").textContent = "Uno de los archivos supera el tamaño permitido.";
        byId("sendError").hidden = false;
        return;
    }
    if (capabilities && total > capabilities.maxTotalSize) {
        byId("sendError").textContent = `La selección supera ${formatBytes(capabilities.maxTotalSize)}.`;
        byId("sendError").hidden = false;
        return;
    }
    selectedFiles = next;
    renderSelection();
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
byId("continueButton").addEventListener("click", async () => {
    const button = byId("continueButton");
    button.disabled = true;
    button.textContent = "Guardando selección…";
    try {
        await saveSelection();
        window.location.href = "/login?mode=register&next=%2F%3Fview%3Dtransfers%26resumeGuest%3D1";
    } catch {
        byId("sendError").textContent = "Este navegador no pudo conservar los archivos. Inicia sesión y selecciónalos de nuevo.";
        byId("sendError").hidden = false;
        button.disabled = false;
        button.textContent = "Continuar para enviar";
    }
});

fetch("/guest-transfer-capabilities").then((response) => response.json()).then((data) => {
    capabilities = data;
    byId("limits").textContent = `Hasta ${data.maxFiles} archivos · ${formatBytes(data.maxTotalSize)} por envío · disponibles ${data.retentionHours} horas`;
}).catch(() => {
    byId("limits").textContent = "No pudimos consultar los límites. Inténtalo de nuevo.";
});
