const test = require("node:test");
const assert = require("node:assert/strict");
const {
    createBilling, checkoutFailure, PAID_PLANS, STRIPE_API_VERSION
} = require("./billing");

test("billing remains disabled until the explicit switch and every secret are present", () => {
    const billing = createBilling({});
    assert.equal(billing.configured, false);
    assert.equal(billing.publicConfiguration().enabled, false);
    assert.equal(billing.publicConfiguration().plans.professional.monthlyAmount, 499);
    assert.equal(billing.publicConfiguration().plans.studio.monthlyAmount, 999);
    assert.equal(PAID_PLANS.professional.name, "Creador");
    assert.equal(STRIPE_API_VERSION, "2026-08-26.dahlia");
});

test("billing maps configured Stripe prices to the internal plans", () => {
    const billing = createBilling({
        PHOCLOUD_BILLING_ENABLED: "true",
        STRIPE_RESTRICTED_KEY: "rk_test_example",
        STRIPE_WEBHOOK_SECRET: "whsec_example",
        STRIPE_CREATOR_PRICE_ID: "price_creator",
        STRIPE_PRO_PRICE_ID: "price_pro"
    });
    assert.equal(billing.configured, true);
    assert.equal(billing.publicConfiguration().mode, "test");
    assert.equal(billing.planFromPriceId("price_creator"), "professional");
    assert.equal(billing.planFromPriceId("price_pro"), "studio");
    assert.equal(billing.planFromPriceId("price_unknown"), null);
});

test("billing refuses Checkout while it is inactive", async () => {
    const billing = createBilling({});
    await assert.rejects(
        billing.createCheckoutSession({
            user: { id: 1, email: "photo@example.com" },
            plan: "professional",
            baseUrl: "https://example.com"
        }),
        (error) => error.code === "BILLING_NOT_CONFIGURED"
    );
});

test("billing translates Stripe failures without exposing secret values", () => {
    assert.deepEqual(checkoutFailure({
        type: "StripePermissionError",
        statusCode: 403,
        message: "Key rk_live_private cannot access this resource"
    }), {
        code: "STRIPE_PERMISSION_DENIED",
        message: "La clave restringida de Stripe todavía no tiene permisos para crear suscripciones."
    });
    assert.deepEqual(checkoutFailure({
        type: "StripeInvalidRequestError",
        code: "resource_missing",
        param: "line_items[0][price]"
    }), {
        code: "STRIPE_PRICE_NOT_FOUND",
        message: "El precio configurado no pertenece a la cuenta activa de Stripe."
    });
});
