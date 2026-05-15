import { withErrorHandling, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { createProjectSchema } from "@/lib/schemas/projects";
import { assertProposalLimit, atomicIncrementProposals } from "@/lib/projects/limits";
import { detectSections } from "@/lib/ai/generate";

export const GET = withErrorHandling(async () => {
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);

  const { data, error } = await supabase
    .from("rfp_projects")
    .select("*, rfp_sections(status)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const projects = ((data ?? []) as Array<Record<string, unknown> & { rfp_sections?: Array<{ status: string }> }>).map((p) => {
    const sections = p.rfp_sections ?? [];
    return {
      ...p,
      rfp_sections: undefined,
      section_count: sections.length,
      approved_count: sections.filter((s) => s.status === "approved").length,
    };
  });

  return ok(projects);
});

export const POST = withErrorHandling(async (req) => {
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const body = createProjectSchema.parse(await req.json());

  const planLimit = await assertProposalLimit(supabase, orgId);

  const { data: project, error: insertError } = await supabase
    .from("rfp_projects")
    .insert({
      org_id: orgId,
      title: body.title,
      client_name: body.client_name ?? null,
      deadline: body.deadline ?? null,
      notes: body.notes ?? null,
      rfp_raw_text: body.rfp_text ?? null,
    })
    .select()
    .single();

  if (insertError || !project) throw insertError ?? new Error("Insert failed");

  let sections: unknown[] = [];
  if (body.rfp_text) {
    try {
      const detected = await detectSections(body.rfp_text);
      if (detected.length > 0) {
        const rows = detected.map((s, i) => ({
          project_id: project.id,
          title: s.title,
          rfp_content: s.rfp_content ?? null,
          position: i,
        }));
        const { data: insertedSections, error: sectionsError } = await supabase
          .from("rfp_sections")
          .insert(rows)
          .select();
        if (sectionsError) throw sectionsError;
        sections = insertedSections ?? [];
      }
    } catch {
      // AI detection failure: project is still created, sections can be added manually
    }
  }

  await atomicIncrementProposals(supabase, orgId, planLimit);

  return ok({ project, sections }, 201);
});
