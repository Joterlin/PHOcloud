const gallery = document.getElementById("gallery");
const galleryHeading = document.getElementById("galleryHeading");
const galleryContent = document.getElementById("galleryContent");
const info = document.getElementById("info");
const clientName = document.getElementById("clientName");
const galleryMessage = document.getElementById("galleryMessage");
const brandLink = document.getElementById("brandLink");
const brandLogo = document.getElementById("brandLogo");
const brandText = document.getElementById("brandText");
const coverHero = document.getElementById("coverHero");
const coverImage = document.getElementById("coverImage");
const socialLinks = document.getElementById("socialLinks");
const galleryFooter = document.getElementById("galleryFooter");
const footerBrand = document.getElementById("footerBrand");
const scrollToGallery = document.getElementById("scrollToGallery");
const downloadGalleryOriginal = document.getElementById("downloadGalleryOriginal");
const downloadGalleryWeb = document.getElementById("downloadGalleryWeb");
const showFavorites = document.getElementById("showFavorites");
const favoriteNotice = document.getElementById("favoriteNotice");
const selectionNoticeTitle = document.getElementById("selectionNoticeTitle");
const selectionNoticeText = document.getElementById("selectionNoticeText");
const submitSelection = document.getElementById("submitSelection");
const emptySelection = document.getElementById("emptySelection");
const unlockPanel = document.getElementById("unlockPanel");
const unlockForm = document.getElementById("unlockForm");
const galleryPassword = document.getElementById("galleryPassword");
const unlockButton = document.getElementById("unlockButton");
const unlockError = document.getElementById("unlockError");
const galleryState = document.getElementById("galleryState");
const stateTitle = document.getElementById("stateTitle");
const stateMessage = document.getElementById("stateMessage");
const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightboxImage");
const lightboxVideo = document.getElementById("lightboxVideo");
const lightboxCounter = document.getElementById("lightboxCounter");
const downloadPhotoOriginal = document.getElementById("downloadPhotoOriginal");
const downloadPhotoWeb = document.getElementById("downloadPhotoWeb");
const favoritePhoto = document.getElementById("favoritePhoto");
const closeLightbox = document.getElementById("closeLightbox");
const prev = document.getElementById("prev");
const next = document.getElementById("next");
const openPhotoComment = document.getElementById("openPhotoComment");
const photoCommentDialog = document.getElementById("photoCommentDialog");
const photoCommentForm = document.getElementById("photoCommentForm");
const photoComment = document.getElementById("photoComment");
const photoCommentError = document.getElementById("photoCommentError");
const selectionDialog = document.getElementById("selectionDialog");
const selectionForm = document.getElementById("selectionForm");
const selectionDialogSummary = document.getElementById("selectionDialogSummary");
const selectionDialogError = document.getElementById("selectionDialogError");

const folderId = window.location.pathname.split("/").filter(Boolean).pop();
let images = [];
let favorites = new Set();
let options = {};
let current = 0;
let favoritesOnly = false;
let selection = { selectionLimit: 0, status: "open" };
let selectionComments = new Map();

function galleryUrl(suffix = "") {
    return `/gallery/${encodeURIComponent(folderId)}${suffix}`;
}

function imageUrl(filename) {
    return galleryUrl(`/photos/${encodeURIComponent(filename)}`);
}

function previewUrl(filename) {
    return galleryUrl(`/previews/${encodeURIComponent(filename)}`);
}

function downloadUrl(filename, quality = "original") {
    return galleryUrl(
        `/photos/${encodeURIComponent(filename)}/download${quality === "web" ? "/web" : ""}`
    );
}

function isVideo(filename) {
    return options.mediaTypes?.[filename] === "video";
}

function visibleImages() {
    return favoritesOnly
        ? images.filter((filename) => favorites.has(filename))
        : images;
}

async function loadGallery() {
    hideStates();

    try {
        const response = await fetch(galleryUrl());
        const data = await response.json();

        if (response.status === 401 && data.requiresPassword) {
            unlockPanel.hidden = false;
            galleryPassword.focus();
            return;
        }
        if (!response.ok) throw new Error(data.error || "No se pudo cargar la galería");

        images = data.files;
        favorites = new Set(data.favorites || []);
        selection = data.selection || { selectionLimit: 0, status: "open" };
        selectionComments = new Map(
            (data.selectionComments || []).map((item) => [item.filename, item.comment])
        );
        options = data;
        applyBrand(data);
        clientName.textContent = data.clientName || "Galería";
        galleryMessage.textContent = data.message || "";
        galleryMessage.hidden = !data.message;
        document.title = `${data.clientName || "Galería"} · PHOcloud`;
        updateInfo();

        downloadGalleryOriginal.href = galleryUrl("/download");
        downloadGalleryOriginal.hidden = !data.allowOriginalDownload;
        downloadGalleryWeb.href = galleryUrl("/download/web");
        downloadGalleryWeb.hidden = !data.allowWebDownload;
        downloadPhotoOriginal.hidden = !data.allowOriginalDownload;
        downloadPhotoWeb.hidden = !data.allowWebDownload;
        showFavorites.hidden = !data.favoritesEnabled;
        galleryHeading.hidden = false;
        galleryContent.hidden = false;
        galleryFooter.hidden = false;
        updateSelectionUi();
        renderGallery();
    } catch (error) {
        console.error(error);
        showErrorState(error.message);
    }
}

function applyBrand(data) {
    const background = data.backgroundColor || "#080808";
    document.documentElement.style.setProperty(
        "--accent",
        data.accentColor || "#c9aa70"
    );
    document.documentElement.style.setProperty(
        "--gallery-bg",
        background
    );
    document.documentElement.style.backgroundColor = background;
    document.body.style.setProperty("--gallery-bg", background);
    document.body.style.backgroundColor = background;
    const rgb = background.slice(1).match(/.{2}/g).map((part) => parseInt(part, 16));
    const luminance = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
    const tone = luminance > 150 ? "light" : "dark";
    document.body.dataset.tone = tone;
    document.documentElement.style.setProperty(
        "--gallery-text", tone === "light" ? "#171717" : "#f5f3ef"
    );
    document.body.dataset.galleryStyle = data.galleryStyle || "masonry";
    const hasCover = Boolean(data.coverFilename && data.coverStyle !== "none");
    document.body.dataset.coverStyle = data.coverStyle || "immersive";
    document.body.dataset.hasCover = String(hasCover);
    document.documentElement.style.setProperty(
        "--cover-x", `${data.coverPositionX ?? 50}%`
    );
    document.documentElement.style.setProperty(
        "--cover-y", `${data.coverPositionY ?? 50}%`
    );
    const brandName = data.brandName?.trim() || "";
    brandText.textContent = brandName || (data.logoUrl ? "" : "PHOcloud");
    brandText.hidden = Boolean(data.logoUrl && !brandName);
    footerBrand.textContent = brandName || "PHOcloud";
    brandLogo.hidden = !data.logoUrl;
    if (data.logoUrl) {
        brandLogo.src = data.logoUrl;
        brandLogo.style.transform = `translate(${((data.logoPositionX ?? 50) - 50) * .35}%, ${((data.logoPositionY ?? 50) - 50) * .35}%) scale(${(data.logoScale ?? 100) / 100})`;
    }
    const links = Array.isArray(data.socialLinks)
        ? data.socialLinks
        : [
            ["Instagram", data.instagramUrl],
            ["Facebook", data.facebookUrl],
            ["TikTok", data.tiktokUrl],
            ["Web", data.websiteUrl]
        ].filter(([, url]) => Boolean(url)).map(([label, url]) => ({ label, url }));
    const primaryLink = links[0]?.url || "";
    brandLink.href = primaryLink || "#";
    brandLink.target = primaryLink ? "_blank" : "";
    brandLink.rel = primaryLink ? "noopener noreferrer" : "";
    brandLink.setAttribute("aria-label", primaryLink
        ? `Abrir ${links[0].label}`
        : "Marca del fotógrafo");

    coverHero.hidden = !hasCover;
    if (hasCover) {
        coverImage.src = previewUrl(data.coverFilename);
        coverImage.alt = `Portada de ${data.clientName}`;
    }

    socialLinks.replaceChildren();
    for (const item of links) {
        const link = document.createElement("a");
        link.href = item.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = item.label;
        socialLinks.appendChild(link);
    }
    socialLinks.hidden = socialLinks.children.length === 0;
}

scrollToGallery.addEventListener("click", () => {
    galleryContent.scrollIntoView({ behavior: "smooth", block: "start" });
});

function hideStates() {
    unlockPanel.hidden = true;
    galleryState.hidden = true;
    galleryHeading.hidden = true;
    galleryContent.hidden = true;
    galleryFooter.hidden = true;
}

function showErrorState(message) {
    hideStates();
    stateTitle.textContent = message.includes("caducado")
        ? "Esta entrega ha caducado"
        : "Galería no disponible";
    stateMessage.textContent = message.includes("caducado")
        ? "Ponte en contacto con el fotógrafo para solicitar un nuevo acceso."
        : message;
    galleryState.hidden = false;
}

function updateInfo() {
    const parts = [
        `${images.length} ${images.length === 1 ? "fotografía" : "fotografías"}`
    ];
    if (options.expiresAt) {
        parts.push(`Disponible hasta el ${formatDate(options.expiresAt)}`);
    }
    if (options.favoritesEnabled && favorites.size) {
        parts.push(`${favorites.size} seleccionada${favorites.size === 1 ? "" : "s"}`);
    }
    info.textContent = parts.join(" · ");
}

function updateSelectionUi(message = "") {
    const enabled = Boolean(options.favoritesEnabled);
    const submitted = selection.status === "submitted";
    const limit = Number(selection.selectionLimit) || 0;
    favoriteNotice.hidden = !enabled;
    favoritePhoto.hidden = !enabled || submitted;
    submitSelection.hidden = !enabled || submitted;
    if (!enabled) return;

    if (submitted) {
        selectionNoticeTitle.textContent = "Selección enviada";
        selectionNoticeText.textContent = `${favorites.size} fotografía${favorites.size === 1 ? "" : "s"} confirmada${favorites.size === 1 ? "" : "s"}. El fotógrafo ya puede revisarla.`;
        return;
    }
    selectionNoticeTitle.textContent = `${favorites.size}${limit ? ` de ${limit}` : ""} seleccionada${favorites.size === 1 ? "" : "s"}`;
    selectionNoticeText.textContent = message || (limit
        ? "Pulsa el corazón para elegir y envía la selección cuando termines."
        : "Elige tus favoritas y envía la selección cuando termines.");
    submitSelection.disabled = favorites.size === 0;
}

function formatDate(value) {
    return new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(new Date(value));
}

function renderGallery() {
    gallery.replaceChildren();
    const files = visibleImages();
    emptySelection.hidden = !(favoritesOnly && files.length === 0);
    const sections = Array.isArray(options.sections) ? options.sections : [];
    gallery.classList.toggle("has-sections", sections.length > 0);
    const mediaSections = options.mediaSections || {};
    if (!sections.length) {
        files.forEach((filename, index) => gallery.appendChild(createPhotoCard(filename, index)));
        return;
    }

    const groups = [
        ...sections.map((section) => ({
            ...section,
            files: files.filter((filename) => Number(mediaSections[filename]) === section.id)
        })),
        { id: null, name: "Galería", files: files.filter((filename) => !mediaSections[filename]) }
    ].filter((group) => group.files.length);
    for (const group of groups) {
        const section = document.createElement("section");
        section.className = "gallery-section";
        const title = document.createElement("h3");
        title.textContent = group.name;
        const grid = document.createElement("div");
        grid.className = "gallery-section-grid";
        for (const filename of group.files) {
            grid.appendChild(createPhotoCard(filename, files.indexOf(filename)));
        }
        section.append(title, grid);
        gallery.appendChild(section);
    }
}

function createPhotoCard(filename, index) {
        const card = document.createElement("article");
        card.className = "photo-card";

        if (isVideo(filename)) {
            card.classList.add("video-card");
            const video = document.createElement("video");
            video.src = imageUrl(filename);
            video.controls = true;
            video.playsInline = true;
            video.preload = "metadata";
            const expand = document.createElement("button");
            expand.type = "button";
            expand.className = "video-expand";
            expand.textContent = "Ampliar";
            expand.addEventListener("click", () => openLightbox(index));
            card.append(video, expand);
        } else {
            const img = document.createElement("img");
            img.src = previewUrl(filename);
            img.loading = "lazy";
            img.alt = `Fotografía ${index + 1}`;
            img.addEventListener("click", () => openLightbox(index));
            card.appendChild(img);
        }

        if (options.favoritesEnabled && selection.status !== "submitted") {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "favorite-button";
            button.classList.toggle("selected", favorites.has(filename));
            button.textContent = favorites.has(filename) ? "♥" : "♡";
            button.setAttribute(
                "aria-label",
                favorites.has(filename)
                    ? "Quitar de la selección"
                    : "Añadir a la selección"
            );
            button.addEventListener("click", () => toggleFavorite(filename, button));
            card.appendChild(button);
        }

        return card;
}

async function toggleFavorite(filename, button) {
    const wasFavorite = favorites.has(filename);
    if (button) button.disabled = true;

    try {
        const response = await fetch(
            wasFavorite
                ? galleryUrl(`/favorites/${encodeURIComponent(filename)}`)
                : galleryUrl("/favorites"),
            {
                method: wasFavorite ? "DELETE" : "POST",
                headers: wasFavorite
                    ? undefined
                    : { "Content-Type": "application/json" },
                body: wasFavorite ? undefined : JSON.stringify({ filename })
            }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudo guardar la selección");

        if (wasFavorite) favorites.delete(filename);
        else favorites.add(filename);
        updateInfo();
        updateSelectionUi();
        renderGallery();
        updateLightbox();
    } catch (error) {
        console.error(error);
        updateSelectionUi(error.message);
        if (button) button.disabled = false;
    }
}

showFavorites.addEventListener("click", () => {
    favoritesOnly = !favoritesOnly;
    showFavorites.textContent = favoritesOnly
        ? "Ver todas"
        : "Ver selección";
    renderGallery();
});

unlockForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    unlockButton.disabled = true;
    unlockError.hidden = true;

    try {
        const response = await fetch(galleryUrl("/unlock"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: galleryPassword.value })
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "No se pudo abrir la galería");
        }
        galleryPassword.value = "";
        await loadGallery();
    } catch (error) {
        unlockError.textContent = error.message;
        unlockError.hidden = false;
    } finally {
        unlockButton.disabled = false;
    }
});

function openLightbox(index) {
    current = index;
    lightbox.hidden = false;
    document.body.classList.add("no-scroll");
    updateLightbox();
}

function updateLightbox() {
    const files = visibleImages();
    if (files.length === 0) {
        closeViewer();
        return;
    }
    if (current >= files.length) current = files.length - 1;
    const filename = files[current];
    const video = isVideo(filename);
    lightboxImage.hidden = video;
    lightboxVideo.hidden = !video;
    if (video) {
        lightboxImage.src = "";
        lightboxVideo.src = imageUrl(filename);
    } else {
        lightboxVideo.pause();
        lightboxVideo.removeAttribute("src");
        lightboxImage.src = previewUrl(filename);
        lightboxImage.alt = `Fotografía ${current + 1} de ${files.length}`;
    }
    lightboxCounter.textContent = `${current + 1} / ${files.length}`;
    downloadPhotoOriginal.href = downloadUrl(filename);
    downloadPhotoOriginal.download = filename;
    downloadPhotoWeb.href = downloadUrl(filename, "web");
    downloadPhotoWeb.download = `${filename.replace(/\.[^.]+$/, "")}-web.jpg`;
    downloadPhotoWeb.hidden = video || !options.allowWebDownload;
    favoritePhoto.classList.toggle("selected", favorites.has(filename));
    favoritePhoto.textContent = favorites.has(filename)
        ? "♥ Seleccionada"
        : "♡ Seleccionar";
    openPhotoComment.hidden = selection.status === "submitted" || !favorites.has(filename);
    openPhotoComment.textContent = selectionComments.get(filename)
        ? "Editar nota"
        : "Añadir nota";
}

function closeViewer() {
    lightbox.hidden = true;
    lightboxImage.src = "";
    lightboxVideo.pause();
    lightboxVideo.removeAttribute("src");
    document.body.classList.remove("no-scroll");
}

closeLightbox.addEventListener("click", closeViewer);
lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) closeViewer();
});
prev.addEventListener("click", () => {
    const files = visibleImages();
    current = current > 0 ? current - 1 : files.length - 1;
    updateLightbox();
});
next.addEventListener("click", () => {
    const files = visibleImages();
    current = current < files.length - 1 ? current + 1 : 0;
    updateLightbox();
});
favoritePhoto.addEventListener("click", () => {
    const filename = visibleImages()[current];
    if (filename) toggleFavorite(filename, favoritePhoto);
});

openPhotoComment.addEventListener("click", () => {
    const filename = visibleImages()[current];
    if (!filename || !favorites.has(filename)) return;
    photoComment.value = selectionComments.get(filename) || "";
    photoCommentError.hidden = true;
    photoCommentDialog.showModal();
    photoComment.focus();
});

document.getElementById("cancelPhotoComment").addEventListener("click", () => {
    photoCommentDialog.close();
});

photoCommentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const filename = visibleImages()[current];
    if (!filename) return;
    photoCommentError.hidden = true;
    try {
        const response = await fetch(
            galleryUrl(`/favorites/${encodeURIComponent(filename)}/comment`),
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ comment: photoComment.value.trim() })
            }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudo guardar la nota");
        selectionComments.set(filename, data.comment);
        photoCommentDialog.close();
        updateLightbox();
    } catch (error) {
        photoCommentError.textContent = error.message;
        photoCommentError.hidden = false;
    }
});

submitSelection.addEventListener("click", () => {
    selectionDialogSummary.textContent = `Vas a enviar ${favorites.size} fotografía${favorites.size === 1 ? "" : "s"}. Después no podrás modificar la selección salvo que el fotógrafo la reabra.`;
    selectionDialogError.hidden = true;
    selectionDialog.showModal();
    document.getElementById("selectionClientName").focus();
});

document.getElementById("cancelSelectionDialog").addEventListener("click", () => {
    selectionDialog.close();
});

selectionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    selectionDialogError.hidden = true;
    try {
        const response = await fetch(galleryUrl("/selection/submit"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                clientName: document.getElementById("selectionClientName").value.trim(),
                clientEmail: document.getElementById("selectionClientEmail").value.trim()
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudo enviar la selección");
        selection = data.selection;
        selectionDialog.close();
        updateInfo();
        updateSelectionUi();
        renderGallery();
        updateLightbox();
    } catch (error) {
        selectionDialogError.textContent = error.message;
        selectionDialogError.hidden = false;
    }
});

document.addEventListener("keydown", (event) => {
    if (lightbox.hidden) return;
    if (event.key === "Escape") closeViewer();
    if (event.key === "ArrowLeft") prev.click();
    if (event.key === "ArrowRight") next.click();
});

loadGallery();
