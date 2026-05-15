# Week 6 — Rich Editor, DOCX Export & Project Status: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the section editor to Tiptap rich text, add client-side DOCX export from the proposals list, and add inline project status management.

**Architecture:** `TiptapEditor` replaces the `<textarea>` in `SectionPanel` (only mounted when not streaming). DOCX is generated client-side in `ExportButton` using the `docx` package and triggered via `file-saver`. Project status is managed via an inline dropdown in `ProjectsTable` that calls the existing `PUT /api/projects/[id]` endpoint with optimistic updates.

**Tech Stack:** Tiptap v3 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-underline`), `docx` v9, `file-saver` v2, Next.js 16 App Router, TypeScript strict, Tailwind CSS, `sonner` for toasts.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/lib/export/docx.ts` | Create | HTML → docx Blob converter |
| `src/app/(dashboard)/projects/ExportButton.tsx` | Create | Client component — fetch sections, build docx, download |
| `src/app/(dashboard)/projects/[id]/TiptapEditor.tsx` | Create | Rich text editor with fixed toolbar |
| `src/app/(dashboard)/projects/[id]/SectionPanel.tsx` | Modify | Swap `<textarea>` for `<TiptapEditor>` |
| `src/app/(dashboard)/dashboard/ProjectsTable.tsx` | Modify | Add status dropdown + export column per row |

`projects/page.tsx` — **no changes needed**: it already fetches `*` from `rfp_projects` (which includes `status`) and spreads it into the row objects passed to `ProjectsTable`.

---

## Task 1: Install @tiptap/extension-underline

**Files:**
- No source files — package install only

- [ ] **Step 1: Install the package**

```bash
cd "C:\Users\kurni\.config\superpowers\worktrees\propelrfp\feature-rfp-projects"
pnpm add @tiptap/extension-underline
```

Expected: package added, `pnpm-lock.yaml` updated.

- [ ] **Step 2: Verify TypeScript still compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add @tiptap/extension-underline"
```

---

## Task 2: HTML → DOCX converter

**Files:**
- Create: `src/lib/export/docx.ts`

- [ ] **Step 1: Create the file**

```ts
// src/lib/export/docx.ts
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from "docx";

export interface ExportSection {
  title: string;
  final_content: string | null;
  ai_draft: string | null;
  position: number;
}

export async function buildProposalDocx(
  projectTitle: string,
  sections: ExportSection[]
): Promise<Blob> {
  const sorted = [...sections].sort((a, b) => a.position - b.position);
  const children: Paragraph[] = [
    new Paragraph({ text: projectTitle, heading: HeadingLevel.HEADING_1 }),
  ];

  for (const section of sorted) {
    children.push(
      new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_2 })
    );
    const content = section.final_content ?? section.ai_draft;
    if (!content) continue;
    children.push(...contentToParagraphs(content));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}

function contentToParagraphs(content: string): Paragraph[] {
  if (!content.trimStart().startsWith("<")) {
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => new Paragraph({ children: [new TextRun(line)] }));
  }
  const parser = new DOMParser();
  const dom = parser.parseFromString(content, "text/html");
  return blocksToParagraphs(dom.body.childNodes);
}

function blocksToParagraphs(nodes: NodeList): Paragraph[] {
  const result: Paragraph[] = [];
  nodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) result.push(new Paragraph({ children: [new TextRun(text)] }));
      return;
    }
    const el = node as Element;
    const tag = el.tagName?.toUpperCase();
    switch (tag) {
      case "P":
        result.push(new Paragraph({ children: inlineRuns(el) }));
        break;
      case "H1":
        result.push(new Paragraph({ children: inlineRuns(el), heading: HeadingLevel.HEADING_1 }));
        break;
      case "H2":
        result.push(new Paragraph({ children: inlineRuns(el), heading: HeadingLevel.HEADING_2 }));
        break;
      case "H3":
        result.push(new Paragraph({ children: inlineRuns(el), heading: HeadingLevel.HEADING_3 }));
        break;
      case "UL":
        el.querySelectorAll(":scope > li").forEach((li) => {
          result.push(new Paragraph({ children: inlineRuns(li), bullet: { level: 0 } }));
        });
        break;
      case "OL": {
        let idx = 1;
        el.querySelectorAll(":scope > li").forEach((li) => {
          result.push(
            new Paragraph({
              children: [new TextRun(`${idx}. `), ...inlineRuns(li)],
            })
          );
          idx++;
        });
        break;
      }
      case "BLOCKQUOTE":
        result.push(
          new Paragraph({ children: inlineRuns(el), indent: { left: 720 } })
        );
        break;
      case "PRE": {
        const code = el.querySelector("code");
        const text = code?.textContent ?? el.textContent ?? "";
        text.split("\n").forEach((line) => {
          result.push(
            new Paragraph({
              children: [new TextRun({ text: line, font: { name: "Courier New" } })],
            })
          );
        });
        break;
      }
      default:
        result.push(...blocksToParagraphs(el.childNodes));
    }
  });
  return result;
}

interface RunStyle {
  bold?: boolean;
  italics?: boolean;
  underline?: object;
  strike?: boolean;
  font?: { name: string };
}

function inlineRuns(el: Element | Node, inherited: RunStyle = {}): TextRun[] {
  const runs: TextRun[] = [];
  el.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? "";
      if (text) runs.push(new TextRun({ text, ...inherited }));
      return;
    }
    const c = child as Element;
    const style: RunStyle = { ...inherited };
    switch (c.tagName?.toUpperCase()) {
      case "STRONG": case "B": style.bold = true; break;
      case "EM": case "I": style.italics = true; break;
      case "U": style.underline = {}; break;
      case "S": case "DEL": style.strike = true; break;
      case "CODE": style.font = { name: "Courier New" }; break;
    }
    runs.push(...inlineRuns(c, style));
  });
  return runs;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/export/docx.ts
git commit -m "feat(export): add HTML-to-docx converter utility"
```

---

## Task 3: ExportButton component

**Files:**
- Create: `src/app/(dashboard)/projects/ExportButton.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/app/(dashboard)/projects/ExportButton.tsx
"use client";

import { useState } from "react";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import { buildProposalDocx } from "@/lib/export/docx";
import type { ApiResponse } from "@/types";
import type { RfpSection } from "@/types";

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
      if (!res.ok || json.error || !json.data) {
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/projects/ExportButton.tsx
git commit -m "feat(export): add ExportButton client component"
```

---

## Task 4: TiptapEditor component

**Files:**
- Create: `src/app/(dashboard)/projects/[id]/TiptapEditor.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/app/(dashboard)/projects/[id]/TiptapEditor.tsx
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";

interface Props {
  content: string;
  editable: boolean;
  onChange: (html: string) => void;
}

function normalizeContent(content: string): string {
  if (!content) return "";
  return content.trimStart().startsWith("<") ? content : `<p>${content}</p>`;
}

type ToolbarButton = {
  label: string;
  title: string;
  action: () => void;
  isActive: () => boolean;
};

export function TiptapEditor({ content, editable, onChange }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
    ],
    content: normalizeContent(content),
    editable,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          "focus:outline-none text-sm leading-relaxed p-3 min-h-[200px] [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-2 [&_h3]:font-semibold [&_h3]:mt-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:font-mono [&_code]:text-xs [&_pre]:font-mono [&_pre]:text-xs [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded",
      },
    },
  });

  if (!editor) return null;

  const groups: ToolbarButton[][] = [
    [
      {
        label: "H1",
        title: "Heading 1",
        action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        isActive: () => editor.isActive("heading", { level: 1 }),
      },
      {
        label: "H2",
        title: "Heading 2",
        action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        isActive: () => editor.isActive("heading", { level: 2 }),
      },
      {
        label: "H3",
        title: "Heading 3",
        action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        isActive: () => editor.isActive("heading", { level: 3 }),
      },
    ],
    [
      {
        label: "B",
        title: "Bold",
        action: () => editor.chain().focus().toggleBold().run(),
        isActive: () => editor.isActive("bold"),
      },
      {
        label: "I",
        title: "Italic",
        action: () => editor.chain().focus().toggleItalic().run(),
        isActive: () => editor.isActive("italic"),
      },
      {
        label: "U",
        title: "Underline",
        action: () => editor.chain().focus().toggleUnderline().run(),
        isActive: () => editor.isActive("underline"),
      },
      {
        label: "S",
        title: "Strikethrough",
        action: () => editor.chain().focus().toggleStrike().run(),
        isActive: () => editor.isActive("strike"),
      },
    ],
    [
      {
        label: "•",
        title: "Bullet list",
        action: () => editor.chain().focus().toggleBulletList().run(),
        isActive: () => editor.isActive("bulletList"),
      },
      {
        label: "1.",
        title: "Ordered list",
        action: () => editor.chain().focus().toggleOrderedList().run(),
        isActive: () => editor.isActive("orderedList"),
      },
    ],
    [
      {
        label: "❝",
        title: "Blockquote",
        action: () => editor.chain().focus().toggleBlockquote().run(),
        isActive: () => editor.isActive("blockquote"),
      },
      {
        label: "</>",
        title: "Code block",
        action: () => editor.chain().focus().toggleCodeBlock().run(),
        isActive: () => editor.isActive("codeBlock"),
      },
    ],
    [
      {
        label: "↩",
        title: "Undo",
        action: () => editor.chain().focus().undo().run(),
        isActive: () => false,
      },
      {
        label: "↪",
        title: "Redo",
        action: () => editor.chain().focus().redo().run(),
        isActive: () => false,
      },
    ],
  ];

  return (
    <div className="flex flex-col flex-1 border rounded-md overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 flex-wrap border-b bg-muted/50 px-2 py-1 shrink-0">
        {groups.map((group, gi) => (
          <span key={gi} className="flex items-center gap-0.5">
            {gi > 0 && (
              <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            )}
            {group.map((btn) => (
              <button
                key={btn.label}
                type="button"
                title={btn.title}
                onClick={btn.action}
                className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                  btn.isActive()
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-muted-foreground hover:text-foreground"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </span>
        ))}
      </div>

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="flex-1 overflow-y-auto"
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Verify lint passes**

```bash
pnpm lint
```

Expected: 0 errors (3 pre-existing warnings are fine).

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/projects/\[id\]/TiptapEditor.tsx
git commit -m "feat(editor): add TiptapEditor with StarterKit + Underline and fixed toolbar"
```

---

## Task 5: Update SectionPanel — swap textarea for TiptapEditor

**Files:**
- Modify: `src/app/(dashboard)/projects/[id]/SectionPanel.tsx`

The current file is 155 lines. The textarea block to replace is at lines 132–143:

```tsx
// CURRENT (lines 132–143) — remove this entire block:
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
```

- [ ] **Step 1: Add TiptapEditor import and replace the textarea block**

At the top of `SectionPanel.tsx`, add the import after the existing import:
```tsx
import { TiptapEditor } from "./TiptapEditor";
```

Replace the textarea block (lines 132–143) with:
```tsx
{!hasContent && !isStreaming ? (
  <div className="flex-1 border rounded-md flex items-center justify-center text-sm text-muted-foreground">
    Click Generate to create a draft
  </div>
) : isStreaming ? (
  <div className="flex-1 resize-none border rounded-md p-3 text-sm leading-relaxed overflow-y-auto bg-background">
    {displayText}
  </div>
) : (
  <TiptapEditor
    content={section.final_content ?? section.ai_draft ?? ""}
    editable={true}
    onChange={onDraftChange}
  />
)}
```

The `displayText` variable and `isStreaming` check already exist in the file — this change only modifies the render block. The streaming div reproduces the read-only display that was previously handled by `readOnly={isStreaming}` on the textarea.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Verify lint passes**

```bash
pnpm lint
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/projects/\[id\]/SectionPanel.tsx
git commit -m "feat(editor): replace textarea with TiptapEditor in SectionPanel"
```

---

## Task 6: Update ProjectsTable — status dropdown + export column

**Files:**
- Modify: `src/app/(dashboard)/dashboard/ProjectsTable.tsx`

The current file is 120 lines. It already has `"use client"`, `useState`, `STATUS_COLORS`, and renders a read-only status pill. Two changes:
1. Replace the read-only status pill with an editable `<select>` with optimistic update
2. Add an export column after the progress bar

- [ ] **Step 1: Add imports and update the component**

Replace the entire file content with:

```tsx
// src/app/(dashboard)/dashboard/ProjectsTable.tsx
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
    // Optimistic update
    setProjects((ps) =>
      ps.map((p) => (p.id === projectId ? { ...p, status: newStatus } : p))
    );
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) {
      // Revert
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Verify lint passes**

```bash
pnpm lint
```

Expected: 0 errors (3 pre-existing warnings are fine).

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/ProjectsTable.tsx
git commit -m "feat(projects): add inline status dropdown and DOCX export button to proposals list"
```
