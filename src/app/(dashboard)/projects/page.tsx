import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ProjectsTable } from "@/app/(dashboard)/dashboard/ProjectsTable";
import type { RfpProject } from "@/types";

type ProjectRow = RfpProject & { rfp_sections: { status: string }[] };

export default async function ProjectsPage() {
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

  const { data: rawProjects, error: projectsError } = await supabase
    .from("rfp_projects")
    .select("*, rfp_sections(status)")
    .eq("org_id", me.org_id)
    .order("created_at", { ascending: false })
    .returns<ProjectRow[]>();

  if (projectsError) {
    throw new Error("Failed to load projects");
  }

  const projects = (rawProjects ?? []).map(({ rfp_sections, ...p }) => ({
    ...p,
    section_count: rfp_sections?.length ?? 0,
    approved_count: (rfp_sections ?? []).filter((s) => s.status === "approved").length,
  }));

  return (
    <main className="mx-auto max-w-5xl p-6 md:p-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Proposals</h1>
        <Link href="/projects/new">
          <Button>New proposal</Button>
        </Link>
      </div>
      <ProjectsTable projects={projects} />
    </main>
  );
}
