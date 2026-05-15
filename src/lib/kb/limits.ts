import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { PLAN_LIMITS } from "@/types";
import type { Plan } from "@/types";
import { ApiError } from "@/lib/auth/requireRole";

export function formatMb(bytes: number): string {
  if (!isFinite(bytes)) return "∞ MB";
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

export async function assertWithinLimit(
  supabase: SupabaseClient<Database>,
  orgId: string,
  incomingBytes: number,
): Promise<{ used: number; limitBytes: number }> {
  const [{ data: sub }, { data: rows }] = await Promise.all([
    supabase.from("subscriptions").select("plan").eq("org_id", orgId).single(),
    supabase.from("knowledge_docs").select("file_size_bytes").eq("org_id", orgId),
  ]);

  const used = (rows ?? []).reduce((acc, r) => acc + (r.file_size_bytes ?? 0), 0);
  const plan = (sub?.plan ?? "free") as Plan;
  const limitMb = PLAN_LIMITS[plan].storageMb;
  const limitBytes = isFinite(limitMb) ? limitMb * 1024 * 1024 : Infinity;

  if (isFinite(limitBytes) && used + incomingBytes > limitBytes) {
    throw new ApiError(
      "QUOTA_EXCEEDED",
      `KB storage limit reached. ${formatMb(used)} / ${formatMb(limitBytes)} used.`,
      402,
      {
        limit_type: "storage",
        current: used,
        limit: limitBytes,
        plan,
      }
    );
  }

  return { used, limitBytes };
}
