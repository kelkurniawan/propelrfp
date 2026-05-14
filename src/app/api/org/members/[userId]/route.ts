import { ok, fail, withErrorHandling } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { memberRoleSchema, memberActionSchema } from "@/lib/schemas/org";

export const PATCH = withErrorHandling(async (req, ctx) => {
  const { userId: actorId, orgId, supabase } = await requireRole(["owner"]);
  const { userId } = await ctx.params;
  if (userId === actorId) return fail("forbidden", "Cannot change your own role", 403);
  const body = memberRoleSchema.parse(await req.json());

  const { data: target } = await supabase
    .from("users")
    .select("id, role, org_id")
    .eq("id", userId)
    .single();
  if (!target || target.org_id !== orgId) return fail("not_found", "Member not found", 404);
  if (target.role === "owner") return fail("forbidden", "Cannot demote the owner directly", 403);

  const { error } = await supabase.from("users").update({ role: body.role }).eq("id", userId);
  if (error) {
    console.error("[members.patch]", error);
    throw error;
  }
  return ok(null);
});

export const POST = withErrorHandling(async (req, ctx) => {
  const { userId: actorId, orgId, supabase } = await requireRole(["owner"]);
  const { userId } = await ctx.params;
  const body = memberActionSchema.parse(await req.json());

  if (body.action === "transfer-ownership") {
    if (userId === actorId) return fail("forbidden", "You are already the owner", 403);
    const { data: target } = await supabase
      .from("users")
      .select("id, org_id")
      .eq("id", userId)
      .single();
    if (!target || target.org_id !== orgId) return fail("not_found", "Member not found", 404);

    const { error: e1 } = await supabase.from("users").update({ role: "owner" }).eq("id", userId);
    if (e1) throw e1;
    const { error: e2 } = await supabase.from("users").update({ role: "admin" }).eq("id", actorId);
    if (e2) throw e2;
    return ok(null);
  }

  return fail("validation_failed", "Unknown action", 400);
});

export const DELETE = withErrorHandling(async (_req, ctx) => {
  const { userId: actorId, orgId, role: actorRole, supabase } = await requireRole([
    "owner",
    "admin",
  ]);
  const { userId } = await ctx.params;
  if (userId === actorId) return fail("forbidden", "Cannot remove yourself", 403);

  const { data: target } = await supabase
    .from("users")
    .select("id, role, org_id")
    .eq("id", userId)
    .single();
  if (!target || target.org_id !== orgId) return fail("not_found", "Member not found", 404);

  if (actorRole === "admin" && target.role !== "member") {
    return fail("forbidden", "Admins can only remove members", 403);
  }
  if (target.role === "owner") return fail("forbidden", "Cannot remove the owner", 403);

  const { error } = await supabase.from("users").delete().eq("id", userId);
  if (error) {
    console.error("[members.delete]", error);
    throw error;
  }
  return ok(null);
});
