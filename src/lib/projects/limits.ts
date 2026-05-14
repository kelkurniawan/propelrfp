import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { PLAN_LIMITS } from "@/types/index";
import { ApiError } from "@/lib/errors";

export async function assertProposalLimit(
  supabase: SupabaseClient<Database>,
  orgId: string
): Promise<number> {
  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("plan, proposals_used")
    .eq("org_id", orgId)
    .single();

  if (error || !sub) {
    throw new ApiError("internal_error", "Could not retrieve subscription", 500);
  }

  const limit =
    PLAN_LIMITS[sub.plan as keyof typeof PLAN_LIMITS]?.proposals ?? 10;

  if (sub.proposals_used >= limit) {
    throw new ApiError(
      "limit_reached",
      `Proposal limit reached. Used ${sub.proposals_used} of ${limit} this cycle. Upgrade to create more proposals.`,
      429
    );
  }

  return sub.proposals_used;
}

export async function incrementProposalsUsed(
  supabase: SupabaseClient<Database>,
  orgId: string,
  currentCount: number
): Promise<void> {
  await supabase
    .from("subscriptions")
    .update({ proposals_used: currentCount + 1 })
    .eq("org_id", orgId);
}
