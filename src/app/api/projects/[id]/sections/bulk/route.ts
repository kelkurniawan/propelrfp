import { withErrorHandling, ok, ApiErrors } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { bulkSectionsSchema } from "@/lib/schemas/projects";

export const POST = withErrorHandling(async (req, ctx) => {
  const { id } = await ctx.params;
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const { sections } = bulkSectionsSchema.parse(await req.json());

  const { data: project } = await supabase
    .from("rfp_projects")
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  if (!project) return ApiErrors.NotFound("Project");

  const { error: deleteError } = await supabase
    .from("rfp_sections")
    .delete()
    .eq("project_id", id);

  if (deleteError) throw deleteError;

  const rows = sections.map((s, i) => ({
    project_id: id,
    title: s.title,
    rfp_content: s.rfp_content ?? null,
    position: s.position ?? i,
  }));

  const { data: insertedSections, error: insertError } = await supabase
    .from("rfp_sections")
    .insert(rows)
    .select()
    .order("position", { ascending: true });

  if (insertError) throw insertError;

  return ok(insertedSections ?? []);
});
