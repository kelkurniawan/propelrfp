import { z } from "zod";
import { withErrorHandling, ok, fail } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";

const retrySchema = z.object({ action: z.literal("retry") });

export const POST = withErrorHandling(async (req, ctx) => {
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const { id } = await ctx.params;
  const body = retrySchema.parse(await req.json());

  if (body.action !== "retry") return fail("validation_failed", "Unknown action", 400);

  const { error } = await supabase
    .from("knowledge_docs")
    .update({ status: "queued", error_message: null })
    .eq("id", id)
    .eq("org_id", orgId)
    .eq("status", "failed");

  if (error) throw error;

  // Re-trigger the processor
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  fetch(`${appUrl}/api/kb/process`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch(() => {});

  return ok(null);
});
