import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditorShell } from "./EditorShell";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("users")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!me) redirect("/signup/org");

  const { data: project, error: projectError } = await supabase
    .from("rfp_projects")
    .select("id, title")
    .eq("id", id)
    .eq("org_id", me.org_id)
    .single();

  if (projectError && projectError.code !== "PGRST116") throw projectError;
  if (!project) notFound();

  const { data: sections, error: sectionsError } = await supabase
    .from("rfp_sections")
    .select("id, title, position, rfp_content, ai_draft, final_content, status, updated_at")
    .eq("project_id", id)
    .order("position", { ascending: true });

  if (sectionsError) throw sectionsError;

  return (
    <EditorShell
      projectId={id}
      projectTitle={project.title}
      sections={sections ?? []}
    />
  );
}
