import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types";

export class ApiError extends Error {
  code: string;
  status: number;
  extra?: Record<string, unknown>;
  constructor(
    code: string,
    message: string,
    status: number,
    extra?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

export async function requireRole(allowed: UserRole[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ApiError("unauthorized", "Authentication required", 401);

  const { data: row, error } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("id", user.id)
    .single();

  if (error || !row) {
    throw new ApiError("forbidden", "Not a member of any organization", 403);
  }
  if (!allowed.includes(row.role as UserRole)) {
    throw new ApiError(
      "forbidden",
      `Requires role: ${allowed.join(" or ")}`,
      403
    );
  }

  return {
    userId: row.id,
    orgId: row.org_id,
    role: row.role as UserRole,
    supabase,
  };
}
