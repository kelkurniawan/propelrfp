import type Stripe from "stripe";
import { getStripe } from "./client";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

function getAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function planFromSubscription(subscription: Stripe.Subscription): "starter" | "growth" {
  const priceId = subscription.items?.data?.[0]?.price?.id;
  if (priceId && priceId === process.env.STRIPE_GROWTH_PRICE_ID) return "growth";
  return "starter";
}

export async function verifyWebhookSignature(
  body: string,
  signature: string
): Promise<Stripe.Event> {
  return getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
}

export async function handleSubscriptionUpsert(subscription: Stripe.Subscription) {
  const orgId = subscription.metadata?.org_id;
  if (!orgId) return;

  const supabase = getAdminClient();

  const item = subscription.items?.data?.[0];
  const periodStart = item?.current_period_start
    ? new Date(item.current_period_start * 1000).toISOString()
    : null;
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000).toISOString()
    : null;

  await supabase.from("subscriptions").upsert(
    {
      org_id: orgId,
      stripe_customer_id: subscription.customer as string,
      stripe_subscription_id: subscription.id,
      status: subscription.status as Database["public"]["Tables"]["subscriptions"]["Row"]["status"],
      plan: planFromSubscription(subscription),
      current_period_start: periodStart,
      current_period_end: periodEnd,
    },
    { onConflict: "org_id" }
  );
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const orgId = subscription.metadata?.org_id;
  if (!orgId) return;

  const supabase = getAdminClient();

  await supabase
    .from("subscriptions")
    .update({ status: "canceled", plan: "free" })
    .eq("org_id", orgId);
}
