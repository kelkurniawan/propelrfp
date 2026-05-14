import { withErrorHandling, ok, ApiErrors } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { createSectionSchema } from "@/lib/schemas/projects";

export const GET = withErrorHandling(async (_req, ctx) => {
  const { id } = await ctx.params;
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);

  const { data: project } = await supabase
    .from("rfp_projects")
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  if (!project) return ApiErrors.NotFound("Project");

  const { data: sections, error } = await supabase
    .from("rfp_sections")
    .select("*")
    .eq("project_id", id)
    .order("position", { ascending: true });

  if (error) throw error;

  return ok(sections ?? []);
});

export const POST = withErrorHandling(async (req, ctx) => {
  const { id } = await ctx.params;
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const body = createSectionSchema.parse(await req.json());

  const { data: project } = await supabase
    .from("rfp_projects")
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  if (!project) return ApiErrors.NotFound("Project");

  const { data: section, error } = await supabase
    .from("rfp_sections")
    .insert({
      project_id: id,
      title: body.title,
      rfp_content: body.rfp_content ?? null,
      position: body.position,
    })
    .select()
    .single();

  if (error || !section) throw error ?? new Error("Insert failed");

  return ok(section, 201);
});
