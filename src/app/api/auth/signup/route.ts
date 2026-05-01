import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ApiErrors, ok, withErrorHandling } from "@/lib/api";
import { signupBodySchema } from "@/lib/schemas/auth";

export const POST = withErrorHandling(async (req) => {
  const body = signupBodySchema.parse(await req.json());
  const supabase = await createClient();

  if (body.action === "create-account") {
    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.password,
      options: { data: { full_name: body.full_name } },
    });
    if (error) {
      return NextResponse.json(
        { data: null, error: { code: "auth_error", message: error.message } },
        { status: 400 }
      );
    }
    return ok({ userId: data.user?.id ?? null });
  }

  // action === "create-org"
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return ApiErrors.Unauthorized();

  const { data: existing } = await supabase
    .from("users")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (existing?.org_id) return ok({ orgId: existing.org_id });

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: body.name, industry: body.industry })
    .select("id")
    .single();
  if (orgError || !org) {
    console.error("[signup] org insert failed", orgError);
    return ApiErrors.InternalError();
  }

  const { error: userError } = await supabase.from("users").insert({
    id: user.id,
    org_id: org.id,
    email: user.email!,
    full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
    role: "owner",
  });
  if (userError) {
    console.error("[signup] users insert failed", userError);
    return ApiErrors.InternalError();
  }

  return ok({ orgId: org.id });
});
