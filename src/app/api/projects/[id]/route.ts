import { withErrorHandling, ok, ApiErrors } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { updateProjectSchema } from "@/lib/schemas/projects";
import type { Database } from "@/types/database";

type ProjectRow = Database["public"]["Tables"]["rfp_projects"]["Row"];
type SectionRow = Database["public"]["Tables"]["rfp_sections"]["Row"];
type ProjectWithSections = ProjectRow & { rfp_sections: SectionRow[] };

export const GET = withErrorHandling(async (_req, ctx) => {
  const { id } = await ctx.params;
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);

  const { data: project, error } = await supabase
    .from("rfp_projects")
    .select("*, rfp_sections(*)")
    .eq("id", id)
    .eq("org_id", orgId)
    .order("position", { ascending: true, referencedTable: "rfp_sections" })
    .single();

  if (error || !project) return ApiErrors.NotFound("Project");

  return ok(project as unknown as ProjectWithSections);
});

export const PUT = withErrorHandling(async (req, ctx) => {
  const { id } = await ctx.params;
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const body = updateProjectSchema.parse(await req.json());

  const { data: project, error } = await supabase
    .from("rfp_projects")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();

  if (error || !project) return ApiErrors.NotFound("Project");

  return ok(project);
});

export const DELETE = withErrorHandling(async (_req, ctx) => {
  const { id } = await ctx.params;
  const { orgId, supabase } = await requireRole(["owner", "admin"]);

  const { error } = await supabase
    .from("rfp_projects")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) throw error;

  return ok(null);
});
