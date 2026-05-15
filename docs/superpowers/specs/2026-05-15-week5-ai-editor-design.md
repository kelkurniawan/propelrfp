# Week 5 — AI Generation Engine: Design Spec

**Date:** 2026-05-15
**Branch:** `feature/rag-pipeline`
**Module:** AI Generation Engine + Editor UI

---

## Goal

Replace the `/projects/[id]` placeholder with a fully working AI editor: users can generate streaming AI drafts per section (grounded in their Knowledge Base via RAG), edit the result inline, and approve sections. Generate All runs sections sequentially. Token usage is logged to `gen_logs`.

---

## What Already Exists (Do Not Rebuild)

| Asset | Location | What it does |
|---|---|---|
| `generateSectionStream()` | `src/lib/ai/generate.ts` | Streams Claude response; returns `ReadableStream<Uint8Array>` |
| `buildGenerationPrompt()` | `src/lib/ai/prompts.ts` | Builds system + user prompt from org context + KB chunks |
| `embedText()` | `src/lib/ai/embeddings.ts` | Embeds a string via OpenAI |
| `match_doc_chunks` RPC | Supabase | Cosine search over org's KB chunks |
| `PUT /api/projects/[id]/sections/[sid]` | Already built | Updates `ai_draft`, `final_content`, `status`, `updated_at` |
| `rfp_sections` schema | `database.ts` | Has `ai_draft`, `final_content`, `status` (pending/generating/generated/approved) |
| `gen_logs` table | `database.ts` | Append-only token usage log |

---

## Architecture

```
page.tsx  (server component)
  │  fetches: project + org + sections ordered by position
  └─► EditorShell.tsx  (client — single state owner)
        ├─► SectionSidebar.tsx  (section list, status dots, Generate All)
        └─► SectionPanel.tsx   (active section: RFP req | editable draft)
```

### Streaming flow (single section)

1. User clicks **Generate** in `SectionPanel`
2. `EditorShell` sets `isStreaming = true`, `generatingId = sectionId`, `streamingText = ""`
3. Client: `POST /api/projects/[id]/sections/[sid]/generate` (body: `{ custom_instruction? }`)
4. Server: sets section status → `generating`, embeds `rfp_content`, fetches top-5 KB chunks via `match_doc_chunks`, fetches org `name` + `industry`, calls `generateSectionStream()`, returns `new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } })`
5. Client reads `response.body` chunk by chunk, appends decoded text to `streamingText`; `SectionPanel` renders `streamingText` live in the textarea (read-only during stream)
6. On stream close: client calls `PUT .../sections/[sid]` with `{ ai_draft: streamingText, status: "generated" }`, updates local sections array, calls `POST /api/gen-logs` with estimated token counts
7. `isStreaming = false` — textarea becomes editable

### Generate All flow

`EditorShell` filters `sections.filter(s => s.status === "pending")`, iterates with `for...of` + `await` (sequential). A `generateAllActive` boolean drives a **Stop after this section** button. No mid-stream abort — current section always completes before stopping.

---

## New Files

### `src/lib/schemas/genLog.ts`

```ts
export const genLogSchema = z.object({
  section_id: z.string().uuid(),
  model: z.string().min(1),
  tokens_input: z.number().int().min(0),
  tokens_output: z.number().int().min(0),
  custom_instruction: z.string().max(1000).nullish(),
});
```

### `src/app/api/projects/[id]/sections/[sid]/generate/route.ts`

```
POST  — auth: any role
Body: { custom_instruction?: string }

Steps:
1. requireRole(["owner", "admin", "member"])
2. Verify project belongs to org (org_id guard)
3. Fetch section (verify project_id matches)
4. Embed section.rfp_content (or "" if null)
5. Call match_doc_chunks RPC → top-5 chunks
6. Fetch organizations row → name, industry
7. Update section status → "generating"
8. Call generateSectionStream({ orgName, industry, kbChunks, sectionTitle, rfpContent, customInstruction })
9. Return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } })

Error before stream: return fail(...) as normal JSON
Error after stream starts: stream closes; client detects and rolls back status to "pending"
```

### `src/app/api/gen-logs/route.ts`

```
POST  — auth: any role
Body: genLogSchema

Steps:
1. requireRole
2. genLogSchema.parse(body)
3. Insert into gen_logs: { section_id, org_id, model, tokens_input, tokens_output, tokens_used: input+output, custom_instruction }
4. Return ok(row, 201)
```

### `src/app/(dashboard)/projects/[id]/EditorShell.tsx`

Client component. Owns all mutable editor state:

```ts
type SectionDraft = {
  id: string;
  title: string;
  position: number;
  rfp_content: string | null;
  ai_draft: string | null;
  final_content: string | null;
  status: SectionStatus;
};

// State:
sections: SectionDraft[]
activeSectionId: string | null
streamingText: string
isStreaming: boolean
generatingId: string | null      // section currently generating
generateAllActive: boolean
savedState: "idle" | "saving" | "saved" | "error"
```

Handles:
- `handleGenerate(sectionId, customInstruction?)` — streaming logic
- `handleGenerateAll()` — sequential loop
- `handleDraftChange(sectionId, text)` — debounced auto-save (1500ms) to `PUT .../sections/[sid]` with `{ final_content: text }`
- `handleApprove(sectionId)` — calls `PUT .../sections/[sid]` with `{ status: "approved", final_content: finalContent ?? aiDraft }`
- `handleStatusRollback(sectionId)` — calls `PUT .../sections/[sid]` with `{ status: "pending" }` on stream error

### `src/app/(dashboard)/projects/[id]/SectionSidebar.tsx`

Presentational client component. Props:
```ts
{
  sections: SectionDraft[];
  activeSectionId: string | null;
  generatingId: string | null;
  generateAllActive: boolean;
  onSelect: (id: string) => void;
  onGenerateAll: () => void;
  onStopGenerateAll: () => void;
}
```

Renders:
- Project title + back-link at top
- Section list: each item shows a status dot (gray=pending, amber=generating with spinner, blue=generated, green=approved), section title, click to select
- Active section highlighted in blue
- **Generate All** button at the bottom (becomes **Stop after this section** when `generateAllActive`)
- Progress summary: "3 / 6 approved"

### `src/app/(dashboard)/projects/[id]/SectionPanel.tsx`

Presentational client component. Props:
```ts
{
  section: SectionDraft;
  streamingText: string;
  isStreaming: boolean;
  savedState: "idle" | "saving" | "saved" | "error";
  onGenerate: (customInstruction?: string) => void;
  onDraftChange: (text: string) => void;
  onApprove: () => void;
}
```

Renders:
- Section title + status badge
- Action bar: **Generate** button (disabled while `isStreaming`), **↻ Regenerate** (same action, shown after first generation), **✓ Approve** (disabled if no draft and no final content)
- **"Add instruction"** link → expands a small `<input>` for custom instruction; value passed to `onGenerate`
- Side-by-side layout:
  - Left: RFP requirement (read-only, styled `<div>`, gray background). Shows "No RFP text for this section" if null.
  - Right: editable `<textarea>` showing `streamingText` while streaming (read-only), else `final_content ?? ai_draft ?? ""`. Fires `onDraftChange` on keystroke.
- Bottom-right: auto-save indicator — "● Saving…" / "● Saved" / "⚠ Save failed"
- If section has no draft yet and is not streaming: shows a centered "Click Generate to create a draft" placeholder inside the textarea area

### `src/app/(dashboard)/projects/[id]/page.tsx` (modified)

Replace the Week 4 placeholder entirely. Server component that:
1. Authenticates user + fetches org_id
2. Fetches project (scoped to org_id, throws on wrong org)
3. Fetches org name + industry from `organizations`
4. Fetches sections ordered by position
5. Passes everything to `<EditorShell>`

---

## Modified Files

| File | Change |
|---|---|
| `src/app/(dashboard)/projects/[id]/page.tsx` | Replace placeholder; pass project + org + sections to EditorShell |

---

## Token Estimation

Exact token counting (tiktoken) is not used at generation time — it would add latency. Client-side estimates:
- **Output tokens:** `Math.ceil(streamingText.length / 4)` (client has the full streamed result)
- **Input tokens:** `Math.ceil((section.rfp_content?.length ?? 0) / 4)` (client uses rfp_content as a proxy; system prompt and KB chunks are server-side only)

The client sends `model: "claude-sonnet-4"` to `POST /api/gen-logs` (hardcoded constant matching what the generate route uses). These estimates are logged to `gen_logs` for analytics only. Billing (if added later) would use exact counts from the Anthropic API response metadata, which is not exposed by the streaming path in Week 5.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| No KB documents | Generation proceeds; prompt includes "No reference material available." |
| Empty `rfp_content` | Embeds empty string; generates a generic draft |
| Stream error mid-flight | Client catches, rolls back section status to `pending`, shows red error banner in panel |
| Generate All interrupted by navigation | In-flight section left in `generating` state; on next page load, sections stuck in `generating` with `updated_at > 2 minutes ago` are displayed as `pending` in the UI (client-side check only — no DB update) |
| Auto-save conflict with streaming | Auto-save debounce suppressed while `isStreaming`; only `ai_draft` written on stream close |
| Approve with no content | Approve button disabled if `ai_draft` and `final_content` are both null/empty |

---

## What Is Explicitly Out of Scope (Week 6)

- Tiptap rich text editor (Week 5 uses plain `<textarea>`)
- DOCX / PDF export
- Project status management (submit / mark won / lost)
- Exact token counting from Anthropic API metadata
- Mid-stream abort (stop generation immediately)
- Section version history / undo regeneration
