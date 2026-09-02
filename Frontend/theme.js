const PHOCLOUD_THEME_KEY = "phocloud-theme";

function savedTheme() {
    try {
        const value = localStorage.getItem(PHOCLOUD_THEME_KEY);
        if (value === "light" || value === "dark") return value;
    } catch {}
    return "light";
}

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
}

applyTheme(savedTheme());

document.addEventListener("DOMContentLoaded", () => {
    const button = document.getElementById("themeToggle");
    if (!button) return;

    function updateButton() {
        const dark = document.documentElement.dataset.theme === "dark";
        button.innerHTML = `<span aria-hidden="true">${dark ? "☀" : "☾"}</span><span>${dark ? "Modo claro" : "Modo oscuro"}</span>`;
        button.setAttribute("aria-label", dark
            ? "Cambiar a modo claro"
            : "Cambiar a modo oscuro");
        button.title = button.getAttribute("aria-label");
    }

    button.addEventListener("click", () => {
        const next = document.documentElement.dataset.theme === "dark"
            ? "light"
            : "dark";
        applyTheme(next);
        try { localStorage.setItem(PHOCLOUD_THEME_KEY, next); } catch {}
        updateButton();
    });

    updateButton();
});
