"use client";

import { useState, useRef } from "react";
import type { RfpSection, SectionStatus } from "@/types";
import { SectionSidebar } from "./SectionSidebar";
import { SectionPanel } from "./SectionPanel";
import type { SectionDraft } from "./types";

const TWO_MINUTES_MS = 2 * 60 * 1000;
const GEN_MODEL = "claude-sonnet-4-5";

type InitialSection = Pick<
  RfpSection,
  "id" | "title" | "position" | "rfp_content" | "ai_draft" | "final_content" | "status" | "updated_at"
>;

interface Props {
  projectId: string;
  projectTitle: string;
  sections: InitialSection[];
}

export function EditorShell({ projectId, projectTitle, sections: initialSections }: Props) {
  const [sections, setSections] = useState<SectionDraft[]>(() =>
    initialSections.map((s) => ({
      id: s.id,
      title: s.title,
      position: s.position,
      rfp_content: s.rfp_content,
      ai_draft: s.ai_draft,
      final_content: s.final_content,
      status:
        s.status === "generating" &&
        Date.now() - new Date(s.updated_at).getTime() > TWO_MINUTES_MS
          ? ("pending" as SectionStatus)
          : s.status,
    }))
  );

  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    initialSections[0]?.id ?? null
  );
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generateAllActive, setGenerateAllActive] = useState(false);
  const [savedState, setSavedState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [streamError, setStreamError] = useState<string | null>(null);

  const stopRequestedRef = useRef(false);
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  function putSection(sectionId: string, body: Record<string, unknown>) {
    return fetch(`/api/projects/${projectId}/sections/${sectionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function handleStatusRollback(sectionId: string) {
    await putSection(sectionId, { status: "pending" });
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, status: "pending" as SectionStatus } : s))
    );
  }

  async function handleGenerate(sectionId: string, customInstruction?: string) {
    setIsStreaming(true);
    setGeneratingId(sectionId);
    setStreamingText("");
    setStreamError(null);
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, status: "generating" as SectionStatus } : s
      )
    );

    try {
      const res = await fetch(
        `/api/projects/${projectId}/sections/${sectionId}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            customInstruction ? { custom_instruction: customInstruction } : {}
          ),
        }
      );

      if (!res.ok || !res.body) {
        throw new Error("Generation request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;
          setStreamingText(fullText);
        }
      } finally {
        reader.releaseLock();
      }

      // Persist ai_draft on stream close
      await putSection(sectionId, { ai_draft: fullText, status: "generated" });

      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? { ...s, ai_draft: fullText, status: "generated" as SectionStatus }
            : s
        )
      );

      // Fire-and-forget token log (analytics only)
      const tokensOutput = Math.ceil(fullText.length / 4);
      const sect = sections.find((s) => s.id === sectionId);
      const tokensInput = Math.ceil((sect?.rfp_content?.length ?? 0) / 4);
      fetch("/api/gen-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_id: sectionId,
          model: GEN_MODEL,
          tokens_input: tokensInput,
          tokens_output: tokensOutput,
          custom_instruction: customInstruction ?? null,
        }),
      }).catch(() => undefined);
    } catch {
      setStreamError("Generation failed. Please try again.");
      await handleStatusRollback(sectionId);
    } finally {
      setIsStreaming(false);
      setGeneratingId(null);
      setStreamingText("");
    }
  }

  async function handleGenerateAll() {
    const pendingSections = sections.filter((s) => s.status === "pending");
    if (pendingSections.length === 0) return;

    setGenerateAllActive(true);
    stopRequestedRef.current = false;

    for (const section of pendingSections) {
      if (stopRequestedRef.current) break;
      setActiveSectionId(section.id);
      await handleGenerate(section.id);
    }

    setGenerateAllActive(false);
    stopRequestedRef.current = false;
  }

  function handleStopGenerateAll() {
    stopRequestedRef.current = true;
  }

  function handleDraftChange(sectionId: string, text: string) {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, final_content: text } : s))
    );

    const existing = saveTimersRef.current.get(sectionId);
    if (existing) clearTimeout(existing);
    if (isStreaming) return;

    const timer = setTimeout(async () => {
      saveTimersRef.current.delete(sectionId);
      setSavedState("saving");
      const res = await putSection(sectionId, { final_content: text });
      setSavedState(res.ok ? "saved" : "error");
    }, 1500);
    saveTimersRef.current.set(sectionId, timer);
  }

  async function handleApprove(sectionId: string) {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const content = section.final_content ?? section.ai_draft;
    if (!content) return;

    const res = await putSection(sectionId, { status: "approved", final_content: content });
    if (res.ok) {
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? { ...s, status: "approved" as SectionStatus, final_content: content }
            : s
        )
      );
    }
  }

  const activeSection = sections.find((s) => s.id === activeSectionId) ?? null;

  return (
    <div className="flex h-screen overflow-hidden">
      <SectionSidebar
        projectTitle={projectTitle}
        sections={sections}
        activeSectionId={activeSectionId}
        generatingId={generatingId}
        generateAllActive={generateAllActive}
        onSelect={setActiveSectionId}
        onGenerateAll={handleGenerateAll}
        onStopGenerateAll={handleStopGenerateAll}
      />

      <main className="flex-1 overflow-hidden flex">
        {activeSection ? (
          <SectionPanel
            section={activeSection}
            streamingText={generatingId === activeSection.id ? streamingText : ""}
            isStreaming={isStreaming && generatingId === activeSection.id}
            savedState={savedState}
            streamError={generatingId === activeSection.id ? streamError : null}
            onGenerate={(instruction) => handleGenerate(activeSection.id, instruction)}
            onDraftChange={(text) => handleDraftChange(activeSection.id, text)}
            onApprove={() => handleApprove(activeSection.id)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Select a section to get started.
          </div>
        )}
      </main>
    </div>
  );
}
