import { ok, fail, withErrorHandling } from "@/lib/api";
import { ApiError } from "@/lib/auth/requireRole";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const POST = withErrorHandling(async (_req, ctx) => {
  const { token } = await ctx.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ApiError("unauthorized", "Authentication required", 401);

  // Use service client to look up by token (no RLS token-lookup policy)
  const serviceClient = await createServiceClient();
  const { data: invite } = await serviceClient
    .from("invitations")
    .select("id, org_id, email, role, status, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return fail("not_found", "Invite not found", 404);
  if (invite.status !== "pending") return fail("expired", "This invite is no longer valid", 410);
  if (new Date(invite.expires_at) < new Date()) {
    await serviceClient.from("invitations").update({ status: "expired" }).eq("id", invite.id);
    return fail("expired", "This invite has expired", 410);
  }
  if (invite.email.toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return fail(
      "forbidden",
      `This invite was sent to ${invite.email}. Sign in as that user to accept.`,
      403
    );
  }

  const { data: existing } = await supabase
    .from("users")
    .select("id, org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (existing) {
    return fail(
      "conflict",
      "You're already in another organization. Leave that org to accept this invite.",
      409
    );
  }

  const { error: insertError } = await supabase.from("users").insert({
    id: user.id,
    org_id: invite.org_id,
    email: user.email!,
    full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
    role: invite.role,
  });
  if (insertError) {
    console.error("[invite.accept] users insert", insertError);
    throw insertError;
  }

  await serviceClient
    .from("invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  return ok({ orgId: invite.org_id });
});
