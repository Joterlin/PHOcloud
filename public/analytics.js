(function () {
    "use strict";

    const CONSENT_KEY = "straclase-analytics-consent";
    const VISITOR_KEY = "straclase-analytics-visitor";
    const ALLOWED_EVENTS = new Set([
        "$pageview", "signup_started", "signup_completed", "login_completed",
        "transfer_files_selected", "transfer_verification_started",
        "transfer_email_verified", "transfer_upload_started",
        "transfer_upload_resumed", "transfer_completed", "transfer_failed",
        "transfer_gallery_clicked", "web_vital"
    ]);
    let posthogReady = false;
    let pendingIdentity = "";
    let lastPagePath = "";

    function consent() {
        try { return localStorage.getItem(CONSENT_KEY) || ""; }
        catch { return ""; }
    }

    function safePath() {
        const allowed = new Set(["/", "/enviar", "/send", "/login", "/app", "/app/"]);
        const path = allowed.has(location.pathname) ? location.pathname : "/other";
        return path === "/send" ? "/enviar" : path === "/app/" ? "/app" : path;
    }

    function safeSource() {
        try {
            const source = new URLSearchParams(location.search).get("utm_source");
            if (source && /^[\p{L}\p{N} ._-]{1,64}$/u.test(source)) return source;
            if (!document.referrer) return "Directo";
            const referrer = new URL(document.referrer);
            return referrer.hostname === location.hostname
                ? "Navegación interna"
                : referrer.hostname.slice(0, 100);
        } catch {
            return "Directo";
        }
    }

    function visitorId() {
        try {
            let value = localStorage.getItem(VISITOR_KEY);
            if (!value) {
                value = crypto.randomUUID();
                localStorage.setItem(VISITOR_KEY, value);
            }
            return value;
        } catch {
            return crypto.randomUUID();
        }
    }

    function loadVendor() {
        if (window.posthog?.init) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "/analytics/vendor.js?v=1";
            script.async = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error("PostHog no disponible"));
            document.head.append(script);
        });
    }

    function sanitizePostHogEvent(event) {
        if (!event?.properties) return event;
        const cleanUrl = `${location.origin}${safePath()}`;
        event.properties.$current_url = cleanUrl;
        event.properties.$pathname = safePath();
        event.properties.$referrer = safeSource();
        delete event.properties.$initial_current_url;
        delete event.properties.$initial_referrer;
        delete event.properties.$initial_referring_domain;
        return event;
    }

    async function initializePostHog() {
        try {
            const response = await fetch("/analytics/config", { credentials: "same-origin" });
            if (!response.ok) return;
            const config = await response.json();
            if (!config.enabled || !config.projectApiKey) return;
            await loadVendor();
            window.posthog.init(config.projectApiKey, {
                api_host: config.host,
                defaults: "2026-05-30",
                autocapture: false,
                capture_pageview: false,
                capture_pageleave: false,
                disable_session_recording: true,
                advanced_disable_feature_flags: true,
                person_profiles: "identified_only",
                request_batching: false,
                opt_out_capturing_by_default: true,
                opt_out_capturing_persistence_type: "local_storage",
                before_send: sanitizePostHogEvent
            });
            posthogReady = true;
            if (consent() === "granted") {
                window.posthog.opt_in_capturing();
                if (pendingIdentity) window.posthog.identify(pendingIdentity);
            } else {
                window.posthog.opt_out_capturing();
            }
        } catch {
            posthogReady = false;
        }
    }

    const initialization = initializePostHog();

    function recordInternal(eventName, properties) {
        const payload = {
            eventName,
            visitorId: visitorId(),
            pagePath: safePath(),
            trafficSource: safeSource(),
            dedupeKey: crypto.randomUUID(),
            properties: properties || {}
        };
        fetch("/analytics/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(payload),
            keepalive: true
        }).catch(() => {});
    }

    function safeProperties(properties) {
        const allowedKeys = new Set([
            "file_count", "total_size_mb", "upload_mode", "delivered_by_email",
            "authenticated", "stage", "resumable", "metric", "value", "rating"
        ]);
        return Object.fromEntries(Object.entries(properties || {}).filter(([key, value]) => (
            allowedKeys.has(key)
            && (["string", "number", "boolean"].includes(typeof value))
        )));
    }

    async function capture(eventName, properties = {}) {
        if (!ALLOWED_EVENTS.has(eventName) || consent() !== "granted") return false;
        const safe = safeProperties(properties);
        recordInternal(eventName, safe);
        await initialization.catch(() => {});
        try {
            if (posthogReady) window.posthog.capture(eventName, {
                page_path: safePath(),
                traffic_source: safeSource(),
                ...safe
            });
        } catch {}
        return true;
    }

    async function identify(stableId) {
        if (typeof stableId !== "string" || !stableId) return;
        pendingIdentity = stableId;
        await initialization.catch(() => {});
        try {
            if (posthogReady && consent() === "granted") {
                window.posthog.identify(stableId);
            }
        } catch {}
    }

    function capturePageview() {
        const path = safePath();
        if (path === lastPagePath) return;
        lastPagePath = path;
        capture("$pageview");
    }

    function setConsent(value) {
        try { localStorage.setItem(CONSENT_KEY, value); } catch {}
        initialization.then(() => {
            try {
                if (!posthogReady) return;
                if (value === "granted") window.posthog.opt_in_capturing();
                else window.posthog.opt_out_capturing();
            } catch {}
        });
        if (value === "granted") capturePageview();
    }

    function resetIdentity() {
        pendingIdentity = "";
        try {
            if (posthogReady) window.posthog.reset();
            localStorage.removeItem(VISITOR_KEY);
        } catch {}
    }

    function initWebVitals() {
        if (!("PerformanceObserver" in window)) return;
        const values = { LCP: null, CLS: 0, INP: null };
        const sent = new Set();
        const observe = (type, handler) => {
            try {
                const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) handler(entry);
                });
                observer.observe({ type, buffered: true });
            } catch {}
        };
        observe("largest-contentful-paint", (entry) => {
            values.LCP = entry.startTime;
        });
        observe("layout-shift", (entry) => {
            if (!entry.hadRecentInput) values.CLS += entry.value;
        });
        observe("event", (entry) => {
            if (entry.interactionId && entry.duration > (values.INP || 0)) {
                values.INP = entry.duration;
            }
        });
        const rating = (metric, value) => {
            const limits = {
                LCP: [2500, 4000], CLS: [0.1, 0.25], INP: [200, 500]
            }[metric];
            if (!limits) return "unknown";
            return value <= limits[0] ? "good" : value <= limits[1] ? "needs-improvement" : "poor";
        };
        const flush = () => {
            for (const [metric, rawValue] of Object.entries(values)) {
                if (rawValue === null || sent.has(metric)) continue;
                const value = metric === "CLS"
                    ? Math.round(rawValue * 1000) / 1000
                    : Math.round(rawValue);
                sent.add(metric);
                capture("web_vital", { metric, value, rating: rating(metric, value) });
            }
        };
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") flush();
        });
        window.addEventListener("pagehide", flush);
    }

    function renderConsent() {
        let panel = document.getElementById("analyticsConsent");
        if (!panel) {
            panel = document.createElement("section");
            panel.id = "analyticsConsent";
            panel.className = "analytics-consent";
            panel.setAttribute("aria-label", "Preferencias de analítica");
            panel.innerHTML = '<div><strong>Analítica respetuosa</strong><p>Con tu permiso, medimos visitas y uso básico para mejorar Straclase. No analizamos imágenes, archivos, contraseñas ni pagos. <a href="/privacidad">Más información</a></p></div><div class="analytics-consent-actions"><button type="button" data-consent="denied">Rechazar</button><button type="button" class="accept" data-consent="granted">Aceptar</button></div>';
            document.body.append(panel);
            panel.addEventListener("click", (event) => {
                const choice = event.target.dataset.consent;
                if (!choice) return;
                setConsent(choice);
                panel.hidden = true;
                preferences.hidden = false;
            });
        }
        let preferences = document.getElementById("analyticsPreferences");
        if (!preferences) {
            preferences = document.createElement("button");
            preferences.id = "analyticsPreferences";
            preferences.className = "analytics-preferences";
            preferences.type = "button";
            preferences.textContent = "Preferencias de analítica";
            preferences.addEventListener("click", () => {
                panel.hidden = false;
                preferences.hidden = true;
            });
            document.body.append(preferences);
        }
        panel.hidden = Boolean(consent());
        preferences.hidden = !panel.hidden;
    }

    window.straclaseAnalytics = {
        capture,
        identify,
        reset: resetIdentity,
        ready: initialization,
        consent: () => consent()
    };

    renderConsent();
    initWebVitals();
    if (consent() === "granted") capturePageview();
    window.addEventListener("popstate", capturePageview);
})();
