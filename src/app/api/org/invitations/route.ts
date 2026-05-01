import { NextResponse } from "next/server";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { inviteCreateSchema } from "@/lib/schemas/org";
import { sendInvite } from "@/lib/email/sendInvite";

function cryptoRandomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export const POST = withErrorHandling(async (req) => {
  const { userId, orgId, supabase } = await requireRole(["owner", "admin"]);
  const body = inviteCreateSchema.parse(await req.json());

  const { data: existingUser } = await supabase
    .from("users")
    .select("id")
    .eq("org_id", orgId)
    .eq("email", body.email)
    .maybeSingle();
  if (existingUser) {
    return fail("conflict", "That email is already a member of this organization", 409);
  }

  const { data: existing } = await supabase
    .from("invitations")
    .select("id")
    .eq("org_id", orgId)
    .eq("email", body.email)
    .maybeSingle();

  let invitation;
  if (existing) {
    const { data, error } = await supabase
      .from("invitations")
      .update({
        role: body.role,
        invited_by: userId,
        token: cryptoRandomToken(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: "pending",
      })
      .eq("id", existing.id)
      .select("id, token, role")
      .single();
    if (error || !data) throw error ?? new Error("update_failed");
    invitation = data;
  } else {
    const { data, error } = await supabase
      .from("invitations")
      .insert({
        org_id: orgId,
        email: body.email,
        role: body.role,
        invited_by: userId,
        token: cryptoRandomToken(),
      })
      .select("id, token, role")
      .single();
    if (error || !data) throw error ?? new Error("insert_failed");
    invitation = data;
  }

  const [{ data: org }, { data: inviter }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).single(),
    supabase.from("users").select("full_name, email").eq("id", userId).single(),
  ]);

  try {
    await sendInvite({
      to: body.email,
      orgName: org?.name ?? "your team",
      inviterName: inviter?.full_name ?? inviter?.email ?? "A teammate",
      token: invitation.token,
    });
  } catch (err) {
    console.error("[invitations.send] email failed", err);
    return NextResponse.json(
      {
        data: { invitation },
        error: {
          code: "email_failed",
          message: "Invite saved but email failed to send. Click Resend to try again.",
        },
      },
      { status: 200 }
    );
  }

  return ok({ invitation });
});

export const DELETE = withErrorHandling(async (req) => {
  const { orgId, supabase } = await requireRole(["owner", "admin"]);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("validation_failed", "Missing id", 400);
  const { error } = await supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) {
    console.error("[invitations.delete]", error);
    throw error;
  }
  return ok(null);
});
