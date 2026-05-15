"use client";

import Link from "next/link";
import type { SectionDraft } from "./types";

interface Props {
  projectTitle: string;
  sections: SectionDraft[];
  activeSectionId: string | null;
  generatingId: string | null;
  generateAllActive: boolean;
  onSelect: (id: string) => void;
  onGenerateAll: () => void;
  onStopGenerateAll: () => void;
}

export function SectionSidebar({
  projectTitle,
  sections,
  activeSectionId,
  generatingId,
  generateAllActive,
  onSelect,
  onGenerateAll,
  onStopGenerateAll,
}: Props) {
  const approvedCount = sections.filter((s) => s.status === "approved").length;
  const hasPending = sections.some((s) => s.status === "pending");

  return (
    <aside className="w-64 shrink-0 border-r flex flex-col h-full bg-background">
      <div className="p-4 border-b">
        <Link href="/projects" className="text-xs text-muted-foreground hover:underline">
          ← Proposals
        </Link>
        <h2 className="mt-1 font-semibold text-sm leading-snug">{projectTitle}</h2>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            aria-current={s.id === activeSectionId ? ("true" as const) : undefined}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
              s.id === activeSectionId
                ? "bg-blue-50 text-blue-700"
                : "hover:bg-muted text-foreground"
            }`}
          >
            <StatusDot status={s.status} isGenerating={s.id === generatingId} />
            <span className="flex-1 truncate">{s.title}</span>
          </button>
        ))}
      </nav>

      <div className="p-3 border-t space-y-2">
        <p className="text-xs text-muted-foreground text-center">
          {approvedCount} / {sections.length} approved
        </p>
        {generateAllActive ? (
          <button
            onClick={onStopGenerateAll}
            aria-label="Stop generation after current section completes"
            className="w-full text-sm bg-amber-100 text-amber-800 hover:bg-amber-200 rounded-md px-3 py-2 transition-colors"
          >
            Stop after this section
          </button>
        ) : (
          <button
            onClick={onGenerateAll}
            disabled={!hasPending}
            className="w-full text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded-md px-3 py-2 transition-colors"
          >
            Generate All
          </button>
        )}
      </div>
    </aside>
  );
}

function StatusDot({
  status,
  isGenerating,
}: {
  status: SectionDraft["status"];
  isGenerating: boolean;
}) {
  if (isGenerating) {
    return <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse shrink-0" />;
  }
  const colors: Record<SectionDraft["status"], string> = {
    pending: "bg-gray-300",
    generating: "bg-amber-400 animate-pulse",
    generated: "bg-blue-400",
    approved: "bg-green-500",
  };
  return <span className={`h-2 w-2 rounded-full shrink-0 ${colors[status]}`} />;
}
