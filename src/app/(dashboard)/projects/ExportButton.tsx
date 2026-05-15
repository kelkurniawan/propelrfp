"use client";

import { useState } from "react";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import { buildProposalDocx } from "@/lib/export/docx";
import type { ApiResponse, RfpSection } from "@/types";

interface Props {
  projectId: string;
  projectTitle: string;
}

export function ExportButton({ projectId, projectTitle }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sections`);
      const json = (await res.json()) as ApiResponse<RfpSection[]>;
      if (!res.ok || json.error !== null || json.data === null) {
        throw new Error(json.error?.message ?? "Failed to load sections");
      }

      const approved = json.data
        .filter((s) => s.status === "approved")
        .sort((a, b) => a.position - b.position);

      const blob = await buildProposalDocx(projectTitle, approved);
      const filename = `${projectTitle.replace(/[^a-z0-9]/gi, "_")}.docx`;
      saveAs(blob, filename);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="text-xs px-2.5 py-1 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors font-medium"
    >
      {loading ? "Exporting…" : "⬇ Export"}
    </button>
  );
}
