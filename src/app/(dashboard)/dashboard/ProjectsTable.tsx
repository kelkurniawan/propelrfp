"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/app/(dashboard)/projects/ExportButton";
import type { RfpProject, ProjectStatus } from "@/types";

interface ProjectWithCounts extends RfpProject {
  section_count: number;
  approved_count: number;
}

const STATUS_COLORS: Record<ProjectStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  in_review: "bg-blue-100 text-blue-700",
  submitted: "bg-yellow-100 text-yellow-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  in_review: "In Review",
  submitted: "Submitted",
  won: "Won",
  lost: "Lost",
};

export function ProjectsTable({
  projects: initialProjects,
}: {
  projects: ProjectWithCounts[];
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [filter, setFilter] = useState<string>("all");

  const visible =
    filter === "all" ? projects : projects.filter((p) => p.status === filter);

  async function handleStatusChange(projectId: string, newStatus: ProjectStatus) {
    const prev = projects.find((p) => p.id === projectId)?.status;
    setProjects((ps) =>
      ps.map((p) => (p.id === projectId ? { ...p, status: newStatus } : p))
    );
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) {
      setProjects((ps) =>
        ps.map((p) =>
          p.id === projectId ? { ...p, status: prev ?? p.status } : p
        )
      );
      toast.error("Failed to update status. Please try again.");
    }
  }

  if (projects.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-dashed p-12 text-center">
        <p className="text-lg font-medium">No proposals yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your first proposal to get started.
        </p>
        <ol className="mt-6 mx-auto max-w-xs text-left text-sm text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Upload past proposals to Knowledge Base</li>
          <li>Create a new RFP project</li>
          <li>Paste your RFP and detect sections</li>
          <li>Generate AI drafts and approve them</li>
        </ol>
        <Link href="/projects/new" className="mt-6 inline-block">
          <Button>Create first proposal</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-md border px-3 py-1.5 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="in_review">In Review</option>
          <option value="submitted">Submitted</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
        <span className="text-sm text-muted-foreground">
          {visible.length} project{visible.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="mt-3 divide-y rounded-lg border">
        {visible.map((p) => {
          const pct =
            p.section_count > 0
              ? Math.round((p.approved_count / p.section_count) * 100)
              : 0;
          const allApproved =
            p.section_count > 0 && p.approved_count === p.section_count;

          return (
            <div key={p.id} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1 min-w-0">
                <Link
                  href={`/projects/${p.id}`}
                  className="font-medium hover:underline truncate block"
                >
                  {p.title}
                </Link>
                {p.client_name && (
                  <p className="text-xs text-muted-foreground">
                    {p.client_name}
                  </p>
                )}
              </div>

              {/* Status dropdown */}
              <select
                value={p.status}
                onChange={(e) =>
                  handleStatusChange(p.id, e.target.value as ProjectStatus)
                }
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring ${STATUS_COLORS[p.status] ?? ""}`}
              >
                {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>

              {p.deadline && (
                <span className="shrink-0 text-xs text-muted-foreground w-24 text-right">
                  {new Date(p.deadline).toLocaleDateString()}
                </span>
              )}

              {/* Progress bar */}
              <div className="shrink-0 flex items-center gap-1 w-28">
                <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${pct === 100 ? "bg-green-500" : "bg-blue-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-10 text-right">
                  {p.approved_count}/{p.section_count}
                </span>
              </div>

              {/* Export button (only when all sections approved) */}
              {allApproved ? (
                <ExportButton projectId={p.id} projectTitle={p.title} />
              ) : (
                <div className="w-16 shrink-0" />
              )}

              <Link href={`/projects/${p.id}`}>
                <Button variant="ghost" size="sm">
                  Open
                </Button>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
