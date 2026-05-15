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
    PLAN_LIMITS[sub.plan as keyof typeof PLAN_LIMITS]?.proposals ?? 3;

  if (isFinite(limit) && sub.proposals_used >= limit) {
    throw new ApiError(
      "QUOTA_EXCEEDED",
      `Proposal limit reached (${sub.proposals_used}/${limit}). Upgrade to create more proposals.`,
      402,
      {
        limit_type: "proposals",
        current: sub.proposals_used,
        limit,
        plan: sub.plan,
      }
    );
  }

  return limit;
}

export async function atomicIncrementProposals(
  supabase: SupabaseClient<Database>,
  orgId: string,
  limit: number
): Promise<void> {
  // Postgres INT max — used when plan has unlimited proposals so the RPC doesn't error
  const safeLimit = isFinite(limit) ? limit : 2147483647;

  const { data: newCount, error } = await supabase.rpc(
    "increment_proposals_if_under_limit",
    { p_org_id: orgId, p_limit: safeLimit }
  );

  if (error) {
    throw new ApiError("internal_error", "Could not update proposal count", 500);
  }

  if (newCount === -1) {
    throw new ApiError(
      "QUOTA_EXCEEDED",
      "Proposal limit reached. Upgrade to create more proposals.",
      402,
      { limit_type: "proposals" }
    );
  }
}
