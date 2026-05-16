import { withErrorHandling, ok, fail } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { stripe } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/server";

export const POST = withErrorHandling(async () => {
  const { orgId } = await requireRole(["owner", "admin"]);

  const serviceClient = await createServiceClient();
  const { data: sub } = await serviceClient
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("org_id", orgId)
    .single();

  if (!sub?.stripe_customer_id) {
    return fail("not_found", "No billing account found. Subscribe to a plan first.", 404);
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
  });

  return ok({ url: session.url });
});
