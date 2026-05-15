# Week 6 — Rich Editor, DOCX Export & Project Status: Design Spec

**Date:** 2026-05-16
**Branch:** `feature/rfp-projects`
**Module:** Review & Editor (Module 5 completion)

---

## Goal

Complete Module 5 by upgrading the plain `<textarea>` to a Tiptap rich text editor, adding client-side DOCX export from the proposals list, and wiring up the existing `ProjectStatus` state machine with an inline dropdown on the proposals list.

---

## What Already Exists (Do Not Rebuild)

| Asset | Location | What it does |
|---|---|---|
| `PUT /api/projects/[id]` | Already built | Accepts `status` field from `updateProjectSchema` |
| `GET /api/projects/[id]/sections` | Already built | Returns all sections for a project |
| `ProjectStatus` type | `src/types/index.ts` | `"draft" \| "in_review" \| "submitted" \| "won" \| "lost"` |
| `rfp_projects.status` column | DB | Already exists; stores ProjectStatus values |
| `docx` package | `node_modules/docx` | DOCX generation library |
| `file-saver` package | `node_modules/file-saver` | Triggers browser file download |
| `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder` | `node_modules/` | Tiptap editor packages |
| `SectionPanel.tsx` | Already built | Renders textarea + save indicator; calls `onDraftChange` |
| `EditorShell.tsx` | Already built | Debounce-saves `final_content` via `PUT .../sections/[sid]` |
| `ProjectsTable.tsx` | Already built | Renders proposals list with section counts |

---

## Architecture

```
projects/page.tsx  (server component — passes project.status to table)
  └─► ProjectsTable.tsx  (client — status dropdown + ExportButton per row)
        └─► ExportButton.tsx  (client — fetches sections, builds .docx, triggers download)

projects/[id]/SectionPanel.tsx  (modified — swaps textarea for TiptapEditor)
  └─► TiptapEditor.tsx  (client — StarterKit + Underline + fixed toolbar)

src/lib/export/docx.ts  (pure function — HTML → docx Blob)
```

---

## New Files

### `src/app/(dashboard)/projects/[id]/TiptapEditor.tsx`

Client component. Props:
```ts
{
  content: string;        // HTML or plain text
  editable: boolean;
  onChange: (html: string) => void;
}
```

Extensions: `StarterKit` (headings H1–H3, bold, italic, strike, bullet list, ordered list, blockquote, code block, undo/redo) + `Underline` from `@tiptap/extension-underline` (must be installed: `pnpm add @tiptap/extension-underline`).

**Fixed toolbar** renders above the editor with these controls (left to right):
H1 · H2 · H3 · | · Bold · Italic · Underline · Strike · | · Bullet List · Ordered List · | · Blockquote · Code Block · | · Undo · Redo

Each button calls the appropriate Tiptap command and applies an `is-active` highlight when the mark/node is active at the cursor.

**Backward compatibility:** On load, if `content` does not start with `<`, it is wrapped as `<p>{content}</p>` before passing to `editor.commands.setContent()`. This handles existing plain-text `final_content` values transparently.

**`onChange`:** fires `editor.getHTML()` on every `onUpdate` event. Passed up to `SectionPanel` → `EditorShell` where the existing 1500 ms debounce auto-save handles persistence.

---

### `src/lib/export/docx.ts`

Pure function — no React, no API calls. Exports:
```ts
export async function buildProposalDocx(
  projectTitle: string,
  sections: Array<{ title: string; final_content: string | null; ai_draft: string | null; position: number }>
): Promise<Blob>
```

**Document structure:**
1. Project title → `HeadingLevel.HEADING_1`
2. For each section (sorted by `position`):
   - Section title → `HeadingLevel.HEADING_2`
   - Content: `final_content ?? ai_draft ?? ""` → parsed into `docx` `Paragraph` objects

**HTML parsing** uses browser `DOMParser` to walk the DOM tree from Tiptap's HTML output:
- `<p>` → `Paragraph`
- `<h1>` / `<h2>` / `<h3>` → `Paragraph` with `HeadingLevel.HEADING_1/2/3`
- `<strong>` → `TextRun` with `bold: true`
- `<em>` → `TextRun` with `italics: true`
- `<u>` → `TextRun` with `underline: {}`
- `<s>` → `TextRun` with `strike: true`
- `<ul><li>` → `Paragraph` with `bullet: { level: 0 }`
- `<ol><li>` → `Paragraph` with `numbering: { reference: "default-numbering", level: 0 }`
- `<blockquote>` → `Paragraph` with `indent: { left: 720 }`
- `<code>` (inline) → `TextRun` with `font: { name: "Courier New" }`
- `<pre><code>` (block) → `Paragraph` with monospace font for each line
- Plain text nodes → `TextRun`

If `final_content` is null or empty and `ai_draft` exists, its plain text is split on `\n` and rendered as plain paragraphs (no HTML parsing needed).

Returns a `Blob` via `Packer.toBlob(doc)`.

---

### `src/app/(dashboard)/projects/ExportButton.tsx`

Client component. Props:
```ts
{
  projectId: string;
  projectTitle: string;
}
```

On click:
1. Sets local `loading = true`, button shows "Exporting…"
2. Fetches `GET /api/projects/${projectId}/sections`
3. Filters to `status === "approved"`, sorts by `position`
4. Calls `buildProposalDocx(projectTitle, sections)`
5. `saveAs(blob, "${projectTitle}.docx")` via `file-saver`
6. Sets `loading = false`

On fetch/parse error: shows a toast via `sonner` and resets loading state.

Renders as a green button: `⬇ Export`. Only rendered by `ProjectsTable` when `approved_count === section_count && section_count > 0`.

---

## Modified Files

### `src/app/(dashboard)/projects/[id]/SectionPanel.tsx`

Replace the `<textarea>` block with `<TiptapEditor>`:

```tsx
// Before (streaming):
// plain <div> showing streamingText — unchanged

// After (not streaming, has content):
<TiptapEditor
  content={section.final_content ?? section.ai_draft ?? ""}
  editable={true}
  onChange={onDraftChange}
/>

// After (not streaming, no content):
// "Click Generate to create a draft" placeholder — unchanged
```

`TiptapEditor` is only mounted when `!isStreaming`. During streaming, keep the existing read-only `<div>` rendering `streamingText`. This avoids `setContent()` being called on every streamed chunk.

Remove the `<textarea>` import and element. Keep all other props and layout unchanged.

---

### `src/app/(dashboard)/projects/ProjectsTable.tsx`

Add `"use client"` directive (currently server component — needs client interactivity for dropdown).

Add two new columns to each row:

**Status column:**
```tsx
<select
  value={project.status}
  onChange={(e) => handleStatusChange(project.id, e.target.value as ProjectStatus)}
  className={STATUS_COLORS[project.status]}
>
  <option value="draft">Draft</option>
  <option value="in_review">In Review</option>
  <option value="submitted">Submitted</option>
  <option value="won">Won</option>
  <option value="lost">Lost</option>
</select>
```

`handleStatusChange`: optimistic update to local `projects` state, then `PUT /api/projects/[id]` with `{ status }`. On error: revert to previous status, show `toast.error(...)` via sonner.

Color map (`STATUS_COLORS`):
- `draft` → `text-gray-600 bg-gray-100`
- `in_review` → `text-blue-700 bg-blue-100`
- `submitted` → `text-amber-700 bg-amber-100`
- `won` → `text-green-700 bg-green-100`
- `lost` → `text-red-700 bg-red-100`

**Export column:**
```tsx
{project.approved_count === project.section_count && project.section_count > 0 ? (
  <ExportButton projectId={project.id} projectTitle={project.title} />
) : null}
```

Component state: `useState<ProjectRow[]>` initialised from the `projects` prop passed from `page.tsx`. The server component stays as-is; `ProjectsTable` now owns local state for optimistic updates.

---

### `src/app/(dashboard)/projects/page.tsx`

Update the Supabase query to include `rfp_projects.status`:
```ts
.select("id, title, status, created_at, rfp_sections(status)")
```

Pass `status` on each row to `ProjectsTable`. No other changes.

---

## Data Format Change

`rfp_sections.final_content` transitions from plain text to HTML. No migration required — the `text` column stores both. `TiptapEditor` handles the format detection on load (plain text → wrap in `<p>`; HTML → load directly). The `ai_draft` column remains plain text (Claude output is never passed through Tiptap).

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Export fetch fails | `toast.error("Export failed. Please try again.")`, reset loading |
| Status update fails | Revert dropdown to previous value, `toast.error(...)` |
| Section has no content (null ai_draft and final_content) | Skip section in DOCX output (no blank section) |
| Tiptap loads plain text (legacy data) | Wrapped in `<p>` tag, renders as single paragraph |
| Export clicked with 0 approved sections | Button not rendered (guard in ProjectsTable) |

---

## What Is Explicitly Out of Scope (Week 7+)

- Billing & Limits (Stripe Checkout, webhooks, quota enforcement)
- Section version history / undo regeneration
- Mid-stream abort
- PDF export
- Collaborative editing
- DOCX template customisation (logo, brand colours)
