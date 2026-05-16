import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PLAN_LIMITS } from "@/types";
import type { Plan } from "@/types";
import { UsageCards } from "./UsageCards";
import { PlanTiles } from "./PlanTiles";
import { CheckoutFeedback } from "./CheckoutFeedback";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userRow } = await supabase
    .from("users")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!userRow) redirect("/login");

  const orgId = userRow.org_id;

  const [{ data: sub }, { data: docs }, { count: memberCount }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan, status, current_period_end, proposals_used")
      .eq("org_id", orgId)
      .single(),
    supabase.from("knowledge_docs").select("file_size_bytes").eq("org_id", orgId),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("org_id", orgId),
  ]);

  const plan = (sub?.plan ?? "free") as Plan;
  const limits = PLAN_LIMITS[plan];
  const storageUsed = (docs ?? []).reduce((sum, d) => sum + (d.file_size_bytes ?? 0), 0);
  const storageLimitBytes = isFinite(limits.storageMb) ? limits.storageMb * 1024 * 1024 : Infinity;

  const usage = {
    proposals: { current: sub?.proposals_used ?? 0, limit: limits.proposals },
    storage_bytes: { current: storageUsed, limit: storageLimitBytes },
    members: { current: memberCount ?? 0, limit: limits.users },
  };

  return (
    <div className="space-y-10">
      <Suspense fallback={null}>
        <CheckoutFeedback />
      </Suspense>
      <UsageCards usage={usage} />
      <PlanTiles
        plan={plan}
        starterPriceId={process.env.STRIPE_STARTER_PRICE_ID ?? ""}
        growthPriceId={process.env.STRIPE_GROWTH_PRICE_ID ?? ""}
      />
    </div>
  );
}
