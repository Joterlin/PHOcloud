const { randomBytes } = require("node:crypto");
const Stripe = require("stripe");

const STRIPE_API_VERSION = "2026-08-26.dahlia";
const PAID_PLANS = Object.freeze({
    professional: {
        name: "Creador",
        monthlyAmount: 499,
        priceEnvironmentKey: "STRIPE_CREATOR_PRICE_ID"
    },
    studio: {
        name: "Pro",
        monthlyAmount: 999,
        priceEnvironmentKey: "STRIPE_PRO_PRICE_ID"
    }
});

function enabledValue(value) {
    return ["1", "true", "yes", "on"].includes(
        String(value || "").trim().toLowerCase()
    );
}

function integrationIdentifier() {
    const alphabet = "abcdefghijklmnopqrstuvwxyz";
    const bytes = randomBytes(8);
    return `realgallery_${Array.from(bytes, (byte) => (
        alphabet[byte % alphabet.length]
    )).join("")}`;
}

function checkoutFailure(error) {
    const type = String(error?.type || "");
    const code = String(error?.code || "");
    const param = String(error?.param || "");
    const statusCode = Number(error?.statusCode) || 0;
    const diagnostic = [type, code, param].filter(Boolean).join("/");

    if (statusCode === 403 || type === "StripePermissionError") {
        return {
            code: "STRIPE_PERMISSION_DENIED",
            message: "La clave restringida de Stripe todavía no tiene permisos para crear suscripciones."
        };
    }
    if (statusCode === 401 || type === "StripeAuthenticationError") {
        return {
            code: "STRIPE_AUTHENTICATION_FAILED",
            message: "Stripe ha rechazado la clave de producción configurada en Railway."
        };
    }
    if (code === "resource_missing" && param.includes("price")) {
        return {
            code: "STRIPE_PRICE_NOT_FOUND",
            message: "El precio configurado no pertenece a la cuenta activa de Stripe."
        };
    }
    if (type === "StripeInvalidRequestError") {
        return {
            code: "STRIPE_INVALID_CHECKOUT",
            message: `Stripe rechazó la configuración del pago${diagnostic ? ` (${diagnostic})` : ""}.`
        };
    }
    return {
        code: "STRIPE_CHECKOUT_FAILED",
        message: `No se pudo abrir el pago${diagnostic ? ` (${diagnostic})` : ""}. Inténtalo de nuevo.`
    };
}

function createBilling(env = process.env) {
    const explicitlyEnabled = enabledValue(env.PHOCLOUD_BILLING_ENABLED);
    const apiKey = (env.STRIPE_RESTRICTED_KEY || env.STRIPE_SECRET_KEY || "").trim();
    const webhookSecret = (env.STRIPE_WEBHOOK_SECRET || "").trim();
    const priceIds = Object.fromEntries(Object.entries(PAID_PLANS).map(
        ([plan, details]) => [plan, (env[details.priceEnvironmentKey] || "").trim()]
    ));
    const missing = [
        ["STRIPE_RESTRICTED_KEY", apiKey],
        ["STRIPE_WEBHOOK_SECRET", webhookSecret],
        ["STRIPE_CREATOR_PRICE_ID", priceIds.professional],
        ["STRIPE_PRO_PRICE_ID", priceIds.studio]
    ].filter(([, value]) => !value).map(([key]) => key);
    const configured = explicitlyEnabled && missing.length === 0;
    const client = apiKey ? new Stripe(apiKey, {
        apiVersion: STRIPE_API_VERSION,
        maxNetworkRetries: 2,
        timeout: 10_000,
        appInfo: { name: "The Real Gallery", version: "1.0.0" }
    }) : null;

    function requireConfigured() {
        if (!configured || !client) {
            const error = new Error("Los pagos todavía no están disponibles");
            error.code = "BILLING_NOT_CONFIGURED";
            throw error;
        }
    }

    function planFromPriceId(priceId) {
        return Object.keys(PAID_PLANS).find(
            (plan) => priceIds[plan] && priceIds[plan] === priceId
        ) || null;
    }

    async function createCheckoutSession({ user, plan, baseUrl }) {
        requireConfigured();
        if (!PAID_PLANS[plan] || !priceIds[plan]) {
            const error = new Error("El plan seleccionado no es válido");
            error.code = "INVALID_PLAN";
            throw error;
        }
        const customer = user.stripeCustomerId
            ? { customer: user.stripeCustomerId }
            : { customer_email: user.email };
        const session = await client.checkout.sessions.create({
            mode: "subscription",
            line_items: [{ price: priceIds[plan], quantity: 1 }],
            ...customer,
            client_reference_id: String(user.id),
            allow_promotion_codes: true,
            success_url: `${baseUrl}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/?billing=cancel`,
            metadata: {
                phocloud_user_id: String(user.id),
                phocloud_plan: plan
            },
            subscription_data: {
                billing_mode: { type: "flexible" },
                metadata: {
                    phocloud_user_id: String(user.id),
                    phocloud_plan: plan
                }
            },
            integration_identifier: integrationIdentifier()
        });
        return session;
    }

    async function createPortalSession({ customerId, baseUrl }) {
        requireConfigured();
        if (!customerId) {
            const error = new Error("La cuenta todavía no tiene una suscripción");
            error.code = "CUSTOMER_NOT_FOUND";
            throw error;
        }
        return client.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${baseUrl}/`
        });
    }

    function constructWebhookEvent(payload, signature) {
        requireConfigured();
        if (!signature) throw new Error("Falta la firma de Stripe");
        return client.webhooks.constructEvent(payload, signature, webhookSecret);
    }

    function publicConfiguration() {
        return {
            enabled: configured,
            mode: apiKey.startsWith("rk_live_") || apiKey.startsWith("sk_live_")
                ? "live"
                : "test",
            plans: Object.fromEntries(Object.entries(PAID_PLANS).map(
                ([plan, details]) => [plan, {
                    name: details.name,
                    monthlyAmount: details.monthlyAmount,
                    currency: "eur",
                    available: configured && Boolean(priceIds[plan])
                }]
            ))
        };
    }

    return {
        configured,
        explicitlyEnabled,
        missing,
        priceIds,
        planFromPriceId,
        checkoutFailure,
        createCheckoutSession,
        createPortalSession,
        constructWebhookEvent,
        publicConfiguration
    };
}

module.exports = {
    STRIPE_API_VERSION,
    PAID_PLANS,
    checkoutFailure,
    createBilling
};
