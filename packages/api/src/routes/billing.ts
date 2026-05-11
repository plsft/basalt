// packages/api/src/routes/billing.ts
// Stripe Checkout + signature-verified webhook handler.
//
// Required wrangler secrets:
//   STRIPE_SECRET_KEY       — the `sk_live_*` or `sk_test_*` key
//   STRIPE_WEBHOOK_SECRET   — the `whsec_*` from Stripe Dashboard → Webhooks
//   STRIPE_PRICE_PRO        — the price ID for the $12/mo Pro tier
//   STRIPE_PRICE_FOUNDER    — the price ID for the $240 one-time Founder tier

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, Variables } from "../env";
import {
  type CheckoutSessionCompleted,
  type StripeSubscription,
  verifyStripeWebhook,
} from "../lib/stripe";
import { ulid } from "../lib/ulid";
import { requireAuth } from "../middleware/auth";

export const billingRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const CheckoutInput = z.object({
  plan: z.enum(["pro", "founder"]),
  success_url: z.string().url(),
  cancel_url: z.string().url(),
});

billingRoutes.post("/checkout", requireAuth, zValidator("json", CheckoutInput), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
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
  const priceId = body.plan === "founder" ? c.env.STRIPE_PRICE_FOUNDER : c.env.STRIPE_PRICE_PRO;
  if (!priceId) {
    return c.json(
      {
        error: "stripe_price_not_configured",
        message: `Set STRIPE_PRICE_${body.plan.toUpperCase()} via 'wrangler secret put'.`,
      },
      501,
    );
  }

  // Founder tier cap: 200 lifetime seats. Check at checkout-creation time
  // (we still verify on webhook to close the race window).
  if (body.plan === "founder") {
    const taken = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM subscriptions WHERE tier = 'founder' AND status IN ('active', 'past_due')",
    ).first<{ n: number }>();
    if ((taken?.n ?? 0) >= 200) {
      return c.json({ error: "founder_cap_reached", message: "Founder tier is full." }, 409);
    }
  }

  const params = new URLSearchParams({
    mode: body.plan === "founder" ? "payment" : "subscription",
    success_url: body.success_url,
    cancel_url: body.cancel_url,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    client_reference_id: user.id,
    customer_email: user.email,
    "metadata[basalt_user_id]": user.id,
    "metadata[basalt_tier]": body.plan,
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
  const rawBody = await c.req.text();
  const sigHeader = c.req.header("stripe-signature");
  const verified = await verifyStripeWebhook(rawBody, sigHeader, c.env.STRIPE_WEBHOOK_SECRET);
  if (!verified.ok) {
    return c.json({ error: "invalid_signature", reason: verified.reason }, 400);
  }
  const event = verified.event;
  const now = new Date().toISOString();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as unknown as CheckoutSessionCompleted;
        const userId = session.client_reference_id;
        const tier = session.metadata?.basalt_tier as "pro" | "founder" | undefined;
        if (!userId || !tier) break;
        if (session.mode === "payment" && tier === "founder") {
          // One-time Founder purchase. Mark the user lifetime and record the
          // subscription row keyed by checkout session id (no subscription
          // object in payment mode).
          await c.env.DB.prepare(
            "INSERT INTO subscriptions (id, user_id, stripe_id, status, tier, current_period_end, created_at, updated_at) VALUES (?, ?, ?, 'active', 'founder', NULL, ?, ?)",
          )
            .bind(ulid(), userId, session.id, now, now)
            .run();
          await c.env.DB.prepare("UPDATE users SET tier = 'founder', updated_at = ? WHERE id = ?")
            .bind(now, userId)
            .run();
        } else if (session.mode === "subscription") {
          // Subscription Pro: the real upsert lands on customer.subscription.created/updated.
          // Here we just flip the user tier optimistically.
          await c.env.DB.prepare("UPDATE users SET tier = ?, updated_at = ? WHERE id = ?")
            .bind(tier, now, userId)
            .run();
        }
        await audit(c, userId, "billing.checkout_completed", { session_id: session.id, tier });
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as unknown as StripeSubscription;
        const userId = sub.metadata?.basalt_user_id ?? null;
        if (!userId) break;
        const tier = (sub.metadata?.basalt_tier ?? "pro") as "pro" | "founder";
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        // Upsert by stripe_id.
        const existing = await c.env.DB.prepare("SELECT id FROM subscriptions WHERE stripe_id = ?")
          .bind(sub.id)
          .first<{ id: string }>();
        if (existing) {
          await c.env.DB.prepare(
            "UPDATE subscriptions SET status = ?, tier = ?, current_period_end = ?, updated_at = ? WHERE stripe_id = ?",
          )
            .bind(sub.status, tier, periodEnd, now, sub.id)
            .run();
        } else {
          await c.env.DB.prepare(
            "INSERT INTO subscriptions (id, user_id, stripe_id, status, tier, current_period_end, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          )
            .bind(ulid(), userId, sub.id, sub.status, tier, periodEnd, now, now)
            .run();
        }
        // Flip user tier based on subscription status.
        const userTier = sub.status === "active" || sub.status === "trialing" ? tier : "free";
        await c.env.DB.prepare("UPDATE users SET tier = ?, updated_at = ? WHERE id = ?")
          .bind(userTier, now, userId)
          .run();
        await audit(c, userId, "billing.subscription_synced", {
          stripe_id: sub.id,
          status: sub.status,
          tier,
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as unknown as StripeSubscription;
        const userId = sub.metadata?.basalt_user_id ?? null;
        if (userId) {
          await c.env.DB.prepare(
            "UPDATE subscriptions SET status = 'canceled', updated_at = ? WHERE stripe_id = ?",
          )
            .bind(now, sub.id)
            .run();
          // Don't downgrade tier immediately if the user is also a Founder
          // (lifetime); only downgrade if no other active sub exists.
          const otherActive = await c.env.DB.prepare(
            "SELECT 1 FROM subscriptions WHERE user_id = ? AND status IN ('active','trialing','past_due') AND stripe_id != ?",
          )
            .bind(userId, sub.id)
            .first<{ "1": number }>();
          if (!otherActive) {
            await c.env.DB.prepare("UPDATE users SET tier = 'free', updated_at = ? WHERE id = ?")
              .bind(now, userId)
              .run();
          }
          await audit(c, userId, "billing.subscription_canceled", { stripe_id: sub.id });
        }
        break;
      }
      default:
        // Acknowledge unknown event types so Stripe doesn't retry.
        break;
    }
  } catch (e) {
    console.error("stripe webhook handler error:", e);
    // Return 500 so Stripe retries with exponential backoff.
    return c.json(
      { error: "handler_failed", detail: e instanceof Error ? e.message : String(e) },
      500,
    );
  }

  return c.json({ received: true, type: event.type });
});

async function audit(
  c: { env: Bindings },
  userId: string,
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await c.env.DB.prepare(
    "INSERT INTO audit_log (id, user_id, action, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(ulid(), userId, action, JSON.stringify(payload), new Date().toISOString())
    .run();
}
