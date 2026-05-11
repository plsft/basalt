// packages/api/src/routes/billing.ts
// Stripe Checkout + webhook handler. Requires:
//   - wrangler secret put STRIPE_SECRET_KEY
//   - wrangler secret put STRIPE_WEBHOOK_SECRET
// Both are surfaced via structured error until secrets land.

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, Variables } from "../env";
import { requireAuth } from "../middleware/auth";

export const billingRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const CheckoutInput = z.object({
  plan: z.enum(["pro", "founder"]),
  success_url: z.string().url(),
  cancel_url: z.string().url(),
});

billingRoutes.post("/checkout", requireAuth, zValidator("json", CheckoutInput), async (c) => {
  const user = c.get("user")!;
  if (!c.env.STRIPE_SECRET_KEY) {
    return c.json(
      {
        error: "stripe_not_configured",
        message: "Set STRIPE_SECRET_KEY via 'wrangler secret put STRIPE_SECRET_KEY'.",
      },
      501,
    );
  }
  const body = c.req.valid("json");
  const priceId = body.plan === "founder" ? "FOUNDER_PRICE_ID" : "PRO_PRICE_ID";
  const params = new URLSearchParams({
    mode: body.plan === "founder" ? "payment" : "subscription",
    success_url: body.success_url,
    cancel_url: body.cancel_url,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    client_reference_id: user.id,
    customer_email: user.email,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  if (!res.ok) {
    return c.json({ error: "stripe_error", status: res.status, body: await res.text() }, 502);
  }
  const session = (await res.json()) as { id: string; url: string };
  return c.json({ id: session.id, url: session.url });
});

billingRoutes.post("/webhook", async (c) => {
  if (!c.env.STRIPE_WEBHOOK_SECRET) {
    return c.json({ error: "webhook_not_configured" }, 501);
  }
  // TODO(TASK-3.7): verify Stripe signature, handle
  // checkout.session.completed / customer.subscription.updated /
  // customer.subscription.deleted. Upsert subscriptions row, flip
  // users.tier as needed. Use the stripe-sdk-light pattern (HMAC SHA256
  // over the raw body with the secret) to stay within Workers' bundle
  // budget.
  return c.json({ received: true, status: "stub" }, 200);
});
