# Week 5 — AI Generation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/projects/[id]` placeholder with a working AI editor where users stream Claude drafts per section (RAG-grounded), edit inline, and approve sections.

**Architecture:** Server `page.tsx` fetches project + sections and passes them to `EditorShell` (client). `EditorShell` owns all mutable state and orchestrates streaming via `POST .../generate`, auto-save via debounced `PUT`, and token logging via `POST /api/gen-logs`. `SectionSidebar` and `SectionPanel` are presentational children.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase, Claude API (existing `generateSectionStream()`), Tailwind CSS, Zod v4.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/schemas/genLog.ts` | Create | Zod schema for gen-log POST body |
| `src/app/api/gen-logs/route.ts` | Create | Insert token-usage record |
| `src/app/api/projects/[id]/sections/[sid]/generate/route.ts` | Create | Stream AI generation |
| `src/app/(dashboard)/projects/[id]/types.ts` | Create | Shared `SectionDraft` type |
| `src/app/(dashboard)/projects/[id]/SectionSidebar.tsx` | Create | Section list + Generate All |
| `src/app/(dashboard)/projects/[id]/SectionPanel.tsx` | Create | RFP req + editable draft |
| `src/app/(dashboard)/projects/[id]/EditorShell.tsx` | Create | Client state owner |
| `src/app/(dashboard)/projects/[id]/page.tsx` | Modify | Replace placeholder |

---

### Task 1: genLog Zod schema

**Files:**
- Create: `src/lib/schemas/genLog.ts`

> **Before writing:** Read `node_modules/zod/CLAUDE.md` for Zod v4 breaking changes (the project uses zod@4.3.6).

- [ ] **Step 1: Create the file**

```ts
import { z } from "zod";

export const genLogSchema = z.object({
  section_id: z.string().uuid(),
  model: z.string().min(1),
  tokens_input: z.number().int().min(0),
  tokens_output: z.number().int().min(0),
  custom_instruction: z.string().max(1000).nullish(),
});
```

- [ ] **Step 2: Verify**

Run: `pnpm lint`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/schemas/genLog.ts
git commit -m "feat(schema): add genLog Zod schema"
```

---

### Task 2: gen-logs API route

**Files:**
- Create: `src/app/api/gen-logs/route.ts`

Reference pattern: `src/app/api/projects/[id]/sections/[sid]/route.ts` — uses `withErrorHandling` + `requireRole` + `ok`.

- [ ] **Step 1: Create the route**

```ts
import { withErrorHandling, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { genLogSchema } from "@/lib/schemas/genLog";

export const POST = withErrorHandling(async (req) => {
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const body = genLogSchema.parse(await req.json());

  const { data, error } = await supabase
    .from("gen_logs")
    .insert({
      section_id: body.section_id,
      org_id: orgId,
      model: body.model,
      tokens_input: body.tokens_input,
      tokens_output: body.tokens_output,
      tokens_used: body.tokens_input + body.tokens_output,
      custom_instruction: body.custom_instruction ?? null,
    })
    .select()
    .single();

  if (error || !data) throw error ?? new Error("Insert failed");

  return ok(data, 201);
});
```

- [ ] **Step 2: Verify**

Run: `pnpm lint && pnpm build`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/gen-logs/route.ts
git commit -m "feat(api): add POST /api/gen-logs route"
```

---

### Task 3: generate streaming route

**Files:**
- Create: `src/app/api/projects/[id]/sections/[sid]/generate/route.ts`

Key context:
- `generateSectionStream()` is in `src/lib/ai/generate.ts`. Signature: `({ orgName, industry, kbChunks, sectionTitle, rfpContent, customInstruction? }) => Promise<ReadableStream<Uint8Array>>`
- `embedText()` is in `src/lib/ai/embeddings.ts`
- `match_doc_chunks` RPC filters by org automatically via RLS (JWT `org_id`)
- This route returns a bare `Response` (not `NextResponse`) for streaming. Do NOT use `withErrorHandling` — handle errors manually in try/catch.
- `ApiError` is exported from `src/lib/auth/requireRole.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole, ApiError } from "@/lib/auth/requireRole";
import { embedText } from "@/lib/ai/embeddings";
import { generateSectionStream } from "@/lib/ai/generate";

const bodySchema = z.object({
  custom_instruction: z.string().max(1000).nullish(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; sid: string }> }
) {
  try {
    const { id, sid } = await ctx.params;
    const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);

    const rawBody = await req.json().catch(() => ({}));
    const { custom_instruction } = bodySchema.parse(rawBody);

    const { data: project } = await supabase
      .from("rfp_projects")
      .select("id")
      .eq("id", id)
      .eq("org_id", orgId)
      .single();

    if (!project) {
      return NextResponse.json(
        { data: null, error: { code: "not_found", message: "Project not found" } },
        { status: 404 }
      );
    }

    const { data: section } = await supabase
      .from("rfp_sections")
      .select("id, title, rfp_content")
      .eq("id", sid)
      .eq("project_id", id)
      .single();

    if (!section) {
      return NextResponse.json(
        { data: null, error: { code: "not_found", message: "Section not found" } },
        { status: 404 }
      );
    }

    const embedding = await embedText(section.rfp_content ?? "");

    const { data: chunks } = await supabase.rpc("match_doc_chunks", {
      query_embedding: embedding,
      match_count: 5,
    });
    const kbChunks = (chunks ?? []).map((c) => c.content);

    const { data: org } = await supabase
      .from("organizations")
      .select("name, industry")
      .eq("id", orgId)
      .single();

    await supabase
      .from("rfp_sections")
      .update({ status: "generating", updated_at: new Date().toISOString() })
      .eq("id", sid);

    const stream = await generateSectionStream({
      orgName: org?.name ?? "",
      industry: org?.industry ?? "General",
      kbChunks,
      sectionTitle: section.title,
      rfpContent: section.rfp_content ?? "",
      customInstruction: custom_instruction ?? undefined,
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { data: null, error: { code: "validation_failed", message: err.issues.map((i) => i.message).join(", ") } },
        { status: 400 }
      );
    }
    if (err instanceof ApiError) {
      return NextResponse.json(
        { data: null, error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }
    console.error("[generate] unhandled error", err);
    return NextResponse.json(
      { data: null, error: { code: "internal_error", message: "Something went wrong" } },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify**

Run: `pnpm lint && pnpm build`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/projects/[id]/sections/[sid]/generate/route.ts"
git commit -m "feat(api): add POST .../sections/[sid]/generate streaming route"
```

---

### Task 4: SectionDraft shared type

**Files:**
- Create: `src/app/(dashboard)/projects/[id]/types.ts`

`SectionSidebar`, `SectionPanel`, and `EditorShell` all share this type. Centralising it prevents circular imports.

- [ ] **Step 1: Create the file**

```ts
import type { SectionStatus } from "@/types";

export type SectionDraft = {
  id: string;
  title: string;
  position: number;
  rfp_content: string | null;
  ai_draft: string | null;
  final_content: string | null;
  status: SectionStatus;
};
```

- [ ] **Step 2: Verify**

Run: `pnpm lint`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/projects/[id]/types.ts"
git commit -m "feat(editor): add shared SectionDraft type"
```

---

### Task 5: SectionSidebar component

**Files:**
- Create: `src/app/(dashboard)/projects/[id]/SectionSidebar.tsx`

- [ ] **Step 1: Create the component**

```tsx
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
```

- [ ] **Step 2: Verify**

Run: `pnpm lint && pnpm build`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/projects/[id]/SectionSidebar.tsx"
git commit -m "feat(editor): add SectionSidebar component"
```

---

### Task 6: SectionPanel component

**Files:**
- Create: `src/app/(dashboard)/projects/[id]/SectionPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
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
```

- [ ] **Step 2: Verify**

Run: `pnpm lint && pnpm build`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/projects/[id]/SectionPanel.tsx"
git commit -m "feat(editor): add SectionPanel component"
```

---

### Task 7: EditorShell component

**Files:**
- Create: `src/app/(dashboard)/projects/[id]/EditorShell.tsx`

Key context:
- The MODEL constant in `src/lib/ai/generate.ts` is `"claude-sonnet-4-5"` — use this exact string when logging to gen-logs.
- `RfpSection` type is in `src/types/index.ts` (re-exported from `database.ts`).
- Stale-generating check: sections with `status === "generating"` and `updated_at` older than 2 minutes are treated as `"pending"` on initial load (client-side only, no DB update).
- Auto-save is debounced 1500ms and suppressed while `isStreaming`.
- Generate All: iterates `sections.filter(s => s.status === "pending")` with `for...of` + `await`. A `stopRequestedRef` ref (not state) controls stopping.
- `streamError` is scoped per-generating-section: only shown in the panel when `generatingId === activeSection.id`.
- Gen-log fetch is fire-and-forget (failures are silently swallowed — it's analytics only).

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState, useRef } from "react";
import type { RfpSection } from "@/types";
import type { SectionStatus } from "@/types";
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
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setStreamingText(fullText);
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

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (isStreaming) return;

    saveTimerRef.current = setTimeout(async () => {
      setSavedState("saving");
      const res = await putSection(sectionId, { final_content: text });
      setSavedState(res.ok ? "saved" : "error");
    }, 1500);
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
```

- [ ] **Step 2: Verify**

Run: `pnpm lint && pnpm build`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/projects/[id]/EditorShell.tsx"
git commit -m "feat(editor): add EditorShell client state component"
```

---

### Task 8: page.tsx — replace placeholder

**Files:**
- Modify: `src/app/(dashboard)/projects/[id]/page.tsx`

Replaces the Week 4 placeholder entirely. The new page fetches project + sections (including `updated_at` for the stale-generating check) and passes them to `EditorShell`.

- [ ] **Step 1: Replace the file**

```tsx
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditorShell } from "@/app/(dashboard)/projects/[id]/EditorShell";

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

  const { data: sections } = await supabase
    .from("rfp_sections")
    .select("id, title, position, rfp_content, ai_draft, final_content, status, updated_at")
    .eq("project_id", id)
    .order("position", { ascending: true });

  return (
    <EditorShell
      projectId={project.id}
      projectTitle={project.title}
      sections={sections ?? []}
    />
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm lint && pnpm build`

Expected: no errors.

- [ ] **Step 3: Manual browser test**

Start dev server: `pnpm dev`

Golden path:
1. Navigate to a project with at least one section at `/projects/[id]`
2. Verify sidebar shows section list with status dots
3. Click a section — panel shows RFP requirement + empty draft area
4. Click **Generate** — status dot turns amber, text streams into the textarea
5. After stream finishes — textarea becomes editable, status dot turns blue
6. Edit the draft — "● Saving…" appears, then "● Saved" after 1.5 s
7. Click **✓ Approve** — status dot turns green
8. Click **Generate All** on a project with multiple pending sections — sections generate sequentially; **Stop after this section** button appears

Edge cases to check:
- A section with `status = "generating"` stuck for >2 min shows as pending on load
- Clicking Generate while generating another section: Generate button is disabled
- Section with no `rfp_content`: generates a generic draft without errors

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/projects/[id]/page.tsx"
git commit -m "feat(editor): replace project page placeholder with AI editor"
```

---

## Done

All 8 tasks complete. Run `pnpm build` one final time to confirm a clean production build.
