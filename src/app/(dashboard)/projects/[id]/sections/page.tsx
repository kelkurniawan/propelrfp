import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SectionList } from "@/app/(dashboard)/projects/[id]/sections/SectionList";

export default async function SectionReviewPage({
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
    .select("*")
    .eq("project_id", id)
    .order("position", { ascending: true });

  if (sectionsError) throw sectionsError;

  return (
    <main className="mx-auto max-w-2xl p-6 md:p-10">
      <Link
        href={`/projects/${id}`}
        className="text-xs text-muted-foreground hover:underline"
      >
        ← {project.title}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Review detected sections</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Drag to reorder, click a title to rename, or add/remove sections.
        Hit <strong>Confirm</strong> when you&apos;re ready.
      </p>

      <div className="mt-8">
        <SectionList
          initialSections={sections ?? []}
          projectId={id}
        />
      </div>
    </main>
  );
}
