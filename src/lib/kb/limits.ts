// src/lib/kb/limits.ts
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
  const plan = (sub?.plan ?? "starter") as Plan;
  const limitMb = PLAN_LIMITS[plan].storageMb;
  const limitBytes = limitMb === Infinity ? Infinity : limitMb * 1024 * 1024;

  if (used + incomingBytes > limitBytes) {
    throw new ApiError(
      "limit_reached",
      `KB storage limit reached. ${formatMb(used)} / ${formatMb(limitBytes)} used.`,
      429,
    );
  }

  return { used, limitBytes };
}
