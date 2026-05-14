"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { RfpProject } from "@/types";

interface ProjectWithCounts extends RfpProject {
  section_count: number;
  approved_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  in_review: "bg-blue-100 text-blue-700",
  submitted: "bg-yellow-100 text-yellow-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
};

export function ProjectsTable({ projects }: { projects: ProjectWithCounts[] }) {
  const [filter, setFilter] = useState<string>("all");

  const visible =
    filter === "all"
      ? projects
      : projects.filter((p) => p.status === filter);

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
          <option value="in_review">In review</option>
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
                  <p className="text-xs text-muted-foreground">{p.client_name}</p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status] ?? ""}`}
              >
                {p.status.replace("_", " ")}
              </span>
              {p.deadline && (
                <span className="shrink-0 text-xs text-muted-foreground w-24 text-right">
                  {new Date(p.deadline).toLocaleDateString()}
                </span>
              )}
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
