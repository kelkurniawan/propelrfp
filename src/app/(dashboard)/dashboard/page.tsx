import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { StatsCards } from "./StatsCards";
import { ProjectsTable } from "./ProjectsTable";
import type { RfpProject } from "@/types";

interface ProjectRow extends RfpProject {
  rfp_sections: { status: string }[];
}

export default async function DashboardPage() {
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

  const [projectsResult, kbResult] = await Promise.all([
    supabase
      .from("rfp_projects")
      .select("*, rfp_sections(status)")
      .eq("org_id", me.org_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("knowledge_docs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", me.org_id)
      .eq("status", "ready"),
  ]);

  const rawProjects = (projectsResult.data ?? []) as unknown as ProjectRow[];
  const kbDocCount = kbResult.count ?? 0;

  const projects = rawProjects.map(({ rfp_sections, ...p }) => ({
    ...p,
    section_count: rfp_sections?.length ?? 0,
    approved_count: (rfp_sections ?? []).filter((s) => s.status === "approved").length,
  }));

  const activeProposals = projects.filter(
    (p) => p.status !== "won" && p.status !== "lost"
  ).length;

  const wonCount = projects.filter((p) => p.status === "won").length;
  const lostCount = projects.filter((p) => p.status === "lost").length;
  const winRate =
    wonCount + lostCount > 0
      ? (wonCount / (wonCount + lostCount)) * 100
      : null;

  const timeSavedHours = Math.round(
    projects.reduce((sum, p) => sum + p.approved_count, 0) * 2.5
  );

  return (
    <main className="mx-auto max-w-5xl p-6 md:p-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/kb">
            <Button variant="outline" size="sm">Knowledge Base</Button>
          </Link>
          <Link href="/projects/new">
            <Button size="sm">New proposal</Button>
          </Link>
        </div>
      </div>
      <div className="mt-6">
        <StatsCards
          activeProposals={activeProposals}
          kbDocCount={kbDocCount}
          winRate={winRate}
          timeSavedHours={timeSavedHours}
        />
      </div>
      <h2 className="mt-8 text-lg font-medium">Proposals</h2>
      <ProjectsTable projects={projects} />
    </main>
  );
}
