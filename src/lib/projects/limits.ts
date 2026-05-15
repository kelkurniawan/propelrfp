import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { PLAN_LIMITS } from "@/types/index";
import { ApiError } from "@/lib/auth/requireRole";

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

  return limit;
}

export async function atomicIncrementProposals(
  supabase: SupabaseClient<Database>,
  orgId: string,
  limit: number
): Promise<void> {
  const { data: newCount, error } = await supabase.rpc(
    "increment_proposals_if_under_limit",
    { p_org_id: orgId, p_limit: limit }
  );

  if (error) {
    throw new ApiError("internal_error", "Could not update proposal count", 500);
  }

  if (newCount === -1) {
    throw new ApiError(
      "limit_reached",
      "Proposal limit reached. Upgrade to create more proposals.",
      429
    );
  }
}
