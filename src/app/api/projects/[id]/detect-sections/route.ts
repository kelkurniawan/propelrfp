import { withErrorHandling, ok, ApiErrors } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { detectSectionsBodySchema } from "@/lib/schemas/projects";
import { detectSections } from "@/lib/ai/generate";

export const POST = withErrorHandling(async (req, ctx) => {
  const { id } = await ctx.params;
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);

  const rawBody = await req.text();
  let rfpText: string | null = null;

  if (rawBody.length > 0) {
    const body = detectSectionsBodySchema.parse(JSON.parse(rawBody));
    rfpText = body.rfp_text;
  }

  const { data: project, error: projectError } = await supabase
    .from("rfp_projects")
    .select("id, rfp_raw_text")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  if (projectError || !project) return ApiErrors.NotFound("Project");

  const textToDetect = rfpText ?? project.rfp_raw_text;
  if (!textToDetect) {
    return ApiErrors.ValidationFailed(
      "No RFP text available. Provide rfp_text in the request body."
    );
  }

  if (rfpText && rfpText !== project.rfp_raw_text) {
    await supabase
      .from("rfp_projects")
      .update({ rfp_raw_text: rfpText })
      .eq("id", id);
  }

  const detected = await detectSections(textToDetect);

  await supabase.from("rfp_sections").delete().eq("project_id", id);

  const rows = detected.map((s, i) => ({
    project_id: id,
    title: s.title,
    rfp_content: s.rfp_content ?? null,
    position: i,
  }));

  const { data: sections, error: insertError } = await supabase
    .from("rfp_sections")
    .insert(rows)
    .select()
    .order("position", { ascending: true });

  if (insertError) throw insertError;

  return ok({ project_id: id, sections: sections ?? [] });
});
