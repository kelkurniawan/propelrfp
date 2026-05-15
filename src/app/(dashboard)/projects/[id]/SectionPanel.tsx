"use client";

import { useState } from "react";
import type { SectionDraft } from "./types";

interface Props {
  section: SectionDraft;
  streamingText: string;
  isStreaming: boolean;
  savedState: "idle" | "saving" | "saved" | "error";
  streamError: string | null;
  onGenerate: (customInstruction?: string) => void;
  onDraftChange: (text: string) => void;
  onApprove: () => void;
}

const STATUS_LABELS: Record<SectionDraft["status"], string> = {
  pending: "Pending",
  generating: "Generating…",
  generated: "Generated",
  approved: "Approved",
};

const STATUS_COLORS: Record<SectionDraft["status"], string> = {
  pending: "bg-gray-100 text-gray-600",
  generating: "bg-amber-100 text-amber-700",
  generated: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
};

export function SectionPanel({
  section,
  streamingText,
  isStreaming,
  savedState,
  streamError,
  onGenerate,
  onDraftChange,
  onApprove,
}: Props) {
  const [showInstruction, setShowInstruction] = useState(false);
  const [instruction, setInstruction] = useState("");

  const hasContent = !!(section.ai_draft || section.final_content);
  const displayText = isStreaming
    ? streamingText
    : (section.final_content ?? section.ai_draft ?? "");

  function handleGenerate() {
    onGenerate(showInstruction && instruction.trim() ? instruction.trim() : undefined);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6 gap-4 h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="font-semibold text-lg truncate">{section.title}</h2>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[section.status]}`}
          >
            {STATUS_LABELS[section.status]}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleGenerate}
            disabled={isStreaming}
            className="text-sm px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors"
          >
            {hasContent ? "↻ Regenerate" : "Generate"}
          </button>
          <button
            onClick={onApprove}
            disabled={!hasContent || isStreaming}
            className="text-sm px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            ✓ Approve
          </button>
        </div>
      </div>

      {/* Custom instruction */}
      <div className="shrink-0">
        <button
          onClick={() => setShowInstruction((v) => !v)}
          className="text-xs text-muted-foreground hover:underline"
        >
          {showInstruction ? "Hide instruction" : "Add instruction"}
        </button>
        {showInstruction && (
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. Focus on cost savings"
            className="mt-1 w-full text-sm border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring bg-background"
          />
        )}
      </div>

      {/* Error banner */}
      {streamError && (
        <div className="shrink-0 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {streamError}
        </div>
      )}

      {/* Side-by-side layout */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: RFP requirement */}
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
            RFP Requirement
          </p>
          <div className="flex-1 overflow-y-auto bg-muted/50 border rounded-md p-3 text-sm text-muted-foreground">
            {section.rfp_content ?? (
              <span className="italic">No RFP text for this section.</span>
            )}
          </div>
        </div>

        {/* Right: editable draft */}
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <div className="flex items-center justify-between shrink-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Your Draft
            </p>
            <SaveIndicator state={savedState} />
          </div>

          {!hasContent && !isStreaming ? (
            <div className="flex-1 border rounded-md flex items-center justify-center text-sm text-muted-foreground">
              Click Generate to create a draft
            </div>
          ) : (
            <textarea
              className="flex-1 resize-none border rounded-md p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring bg-background"
              value={displayText}
              readOnly={isStreaming}
              onChange={(e) => onDraftChange(e.target.value)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: Props["savedState"] }) {
  if (state === "idle") return null;
  if (state === "saving") return <span className="text-xs text-muted-foreground">● Saving…</span>;
  if (state === "saved") return <span className="text-xs text-green-600">● Saved</span>;
  return <span className="text-xs text-red-600">⚠ Save failed</span>;
}
