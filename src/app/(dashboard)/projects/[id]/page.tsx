import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

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

  const { data: project } = await supabase
    .from("rfp_projects")
    .select("id, title, status, rfp_sections(id, title, status, position)")
    .eq("id", id)
    .order("position", { ascending: true, referencedTable: "rfp_sections" })
    .single();

  if (!project) notFound();

  const sections = project.rfp_sections ?? [];
  const approvedCount = sections.filter((s) => s.status === "approved").length;

  return (
    <main className="mx-auto max-w-3xl p-6 md:p-10">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/projects"
            className="text-xs text-muted-foreground hover:underline"
          >
            ← Proposals
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{project.title}</h1>
        </div>
        <Link href={`/projects/${id}/sections`}>
          <Button variant="outline" size="sm">
            Review sections
          </Button>
        </Link>
      </div>

      <p className="mt-4 text-sm text-muted-foreground rounded-lg border border-dashed p-6 text-center">
        AI editor coming in Week 5.
        <br />
        <span className="font-medium text-foreground">
          {approvedCount}/{sections.length} sections approved.
        </span>
      </p>

      {sections.length > 0 && (
        <ul className="mt-6 divide-y rounded-lg border">
          {sections.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${
                  s.status === "approved"
                    ? "bg-green-500"
                    : s.status === "generated"
                    ? "bg-blue-400"
                    : "bg-gray-300"
                }`}
              />
              <span className="flex-1 text-sm">{s.title}</span>
              <span className="text-xs text-muted-foreground capitalize">
                {s.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
