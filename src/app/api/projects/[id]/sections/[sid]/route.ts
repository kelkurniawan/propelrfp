import { withErrorHandling, ok, ApiErrors } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { updateSectionSchema } from "@/lib/schemas/projects";

export const PUT = withErrorHandling(async (req, ctx) => {
  const { id, sid } = await ctx.params;
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const body = updateSectionSchema.parse(await req.json());

  const { data: project } = await supabase
    .from("rfp_projects")
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  if (!project) return ApiErrors.NotFound("Project");

  const { data: section, error } = await supabase
    .from("rfp_sections")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", sid)
    .eq("project_id", id)
    .select()
    .single();

  if (error || !section) return ApiErrors.NotFound("Section");

  return ok(section);
});

export const DELETE = withErrorHandling(async (_req, ctx) => {
  const { id, sid } = await ctx.params;
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);

  const { data: project } = await supabase
    .from("rfp_projects")
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  if (!project) return ApiErrors.NotFound("Project");

  const { error } = await supabase
    .from("rfp_sections")
    .delete()
    .eq("id", sid)
    .eq("project_id", id);

  if (error) throw error;

  return ok(null);
});
