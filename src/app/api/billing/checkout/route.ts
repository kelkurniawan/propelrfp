import { z } from "zod";
import { withErrorHandling, ok, fail } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { getStripe } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/server";

const bodySchema = z.object({ price_id: z.string().min(1) });

export const POST = withErrorHandling(async (req) => {
  const { orgId } = await requireRole(["owner", "admin"]);
  const { price_id } = bodySchema.parse(await req.json());

  const serviceClient = await createServiceClient();
  const { data: sub } = await serviceClient
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("org_id", orgId)
    .single();

  let customerId = sub?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await getStripe().customers.create({ metadata: { org_id: orgId } });
    customerId = customer.id;
    await serviceClient
      .from("subscriptions")
      .update({ stripe_customer_id: customerId })
      .eq("org_id", orgId);
  }

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: price_id, quantity: 1 }],
    subscription_data: { metadata: { org_id: orgId } },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?canceled=1`,
  });

  if (!session.url) return fail("checkout_error", "Could not create checkout session", 500);
  return ok({ url: session.url });
});
