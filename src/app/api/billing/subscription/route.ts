import { withErrorHandling, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { PLAN_LIMITS } from "@/types";
import type { Plan } from "@/types";

export const GET = withErrorHandling(async () => {
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);

  const [{ data: sub }, { data: docs }, { count: memberCount }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan, status, current_period_end, proposals_used")
      .eq("org_id", orgId)
      .single(),
    supabase.from("knowledge_docs").select("file_size_bytes").eq("org_id", orgId),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("org_id", orgId),
  ]);

  if (!sub) throw new Error("No subscription found");

  const plan = sub.plan as Plan;
  const limits = PLAN_LIMITS[plan];
  const storageUsed = (docs ?? []).reduce((sum, d) => sum + (d.file_size_bytes ?? 0), 0);
  const storageLimitBytes = isFinite(limits.storageMb) ? limits.storageMb * 1024 * 1024 : Infinity;

  return ok({
    plan: sub.plan,
    status: sub.status,
    current_period_end: sub.current_period_end,
    usage: {
      proposals: { current: sub.proposals_used, limit: limits.proposals },
      storage_bytes: { current: storageUsed, limit: storageLimitBytes },
      members: { current: memberCount ?? 0, limit: limits.users },
    },
  });
});
