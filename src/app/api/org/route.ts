import { ok, withErrorHandling } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { orgUpdateSchema } from "@/lib/schemas/org";

export const PATCH = withErrorHandling(async (req) => {
  const { orgId, supabase } = await requireRole(["owner"]);
  const body = orgUpdateSchema.parse(await req.json());
  const { data, error } = await supabase
    .from("organizations")
    .update({
      name: body.name,
      industry: body.industry,
      website: body.website ?? null,
      size: body.size ?? null,
    })
    .eq("id", orgId)
    .select("id, name, industry, website, size")
    .single();
  if (error || !data) {
    console.error("[org.patch]", error);
    throw new Error("update_failed");
  }
  return ok(data);
});

export const DELETE = withErrorHandling(async () => {
  const { orgId, supabase } = await requireRole(["owner"]);
  const { error } = await supabase.from("organizations").delete().eq("id", orgId);
  if (error) {
    console.error("[org.delete]", error);
    throw new Error("delete_failed");
  }
  return ok(null);
});
