# RFP Projects (Week 4 — Module 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete RFP Projects module — project CRUD, AI-powered section detection, a section review UI, an updated dashboard with live stats, and a projects list page.

**Architecture:** 9 new API routes following `withErrorHandling + requireRole + ok/fail`; 1 DB migration (`rfp_raw_text` column); 7 new pages/components using Next.js App Router conventions. Sections are stored as `rfp_sections.position` (integer). Section review uses optimistic client state — all edits are local until "Confirm" triggers one bulk-replace API call. RLS on `rfp_sections` is enforced via the `project_id → rfp_projects.org_id` subquery join (no `org_id` column on sections).

**Tech Stack:** Next.js App Router (async server components + client components), TypeScript strict, Supabase JS v2, Zod v4, `@dnd-kit/sortable` for drag-to-reorder, shadcn/ui, Tailwind CSS v4, Anthropic SDK (existing `detectSections()` in `src/lib/ai/generate.ts`).

---

## File Structure

**Create:**
- `supabase/migrations/004_rfp_raw_text.sql` — adds `rfp_raw_text TEXT` to `rfp_projects`
- `src/lib/schemas/projects.ts` — Zod schemas for all project/section API inputs
- `src/lib/projects/limits.ts` — proposal limit check + increment helper
- `src/app/api/projects/route.ts` — `GET` list + `POST` create
- `src/app/api/projects/[id]/route.ts` — `GET` detail + `PUT` update + `DELETE`
- `src/app/api/projects/[id]/sections/route.ts` — `GET` list + `POST` create single
- `src/app/api/projects/[id]/sections/[sid]/route.ts` — `PUT` + `DELETE`
- `src/app/api/projects/[id]/sections/bulk/route.ts` — `POST` bulk-replace (confirm step)
- `src/app/api/projects/[id]/detect-sections/route.ts` — `POST` re-run detection
- `src/app/(dashboard)/projects/page.tsx` — projects list server page
- `src/app/(dashboard)/projects/new/page.tsx` — new-project server wrapper
- `src/app/(dashboard)/projects/new/ProjectForm.tsx` — new-project client form
- `src/app/(dashboard)/projects/[id]/page.tsx` — editor placeholder (Module 5 target)
- `src/app/(dashboard)/projects/[id]/sections/page.tsx` — section review server page
- `src/app/(dashboard)/projects/[id]/sections/SectionList.tsx` — client drag-to-reorder
- `src/app/(dashboard)/dashboard/StatsCards.tsx` — stats cards server component
- `src/app/(dashboard)/dashboard/ProjectsTable.tsx` — projects table client component

**Modify:**
- `src/types/database.ts` — add `rfp_raw_text` to `rfp_projects` Row/Insert/Update
- `src/app/(dashboard)/dashboard/page.tsx` — replace stub with stats + projects table

---

## Task 1: Install @dnd-kit dependencies

**Files:**
- Modify: `package.json` (via pnpm)

- [ ] **Step 1: Install packages**

```bash
cd "H:\Propel RFP\propelrfp"
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected output: packages added, lockfile updated.

- [ ] **Step 2: Verify build still passes**

```bash
pnpm build
```

Expected: `✓ Compiled successfully` with same route count as before.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add @dnd-kit/core, sortable, utilities for drag-to-reorder"
```

---

## Task 2: DB Migration — add rfp_raw_text column

**Files:**
- Create: `supabase/migrations/004_rfp_raw_text.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/004_rfp_raw_text.sql`:

```sql
-- Week 4: store raw RFP text on the project for section re-detection
alter table rfp_projects add column if not exists rfp_raw_text text;
```

- [ ] **Step 2: Apply migration in Supabase SQL Editor**

Open the Supabase dashboard → SQL Editor → paste and run:
```sql
alter table rfp_projects add column if not exists rfp_raw_text text;
```

Expected: `ALTER TABLE` success message. Verify in Table Editor that `rfp_raw_text` column appears on `rfp_projects`.

- [ ] **Step 3: Update TypeScript types in database.ts**

In `src/types/database.ts`, find the `rfp_projects` section and add `rfp_raw_text` to Row, Insert, and Update:

```typescript
// Row — add after `notes: string | null;`:
rfp_raw_text: string | null;

// Insert — add after `notes?: string | null;`:
rfp_raw_text?: string | null;

// Update — add after `notes?: string | null;`:
rfp_raw_text?: string | null;
```

- [ ] **Step 4: Verify build**

```bash
pnpm build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/004_rfp_raw_text.sql src/types/database.ts
git commit -m "feat(db): add rfp_raw_text column to rfp_projects"
```

---

## Task 3: Zod schemas for projects

**Files:**
- Create: `src/lib/schemas/projects.ts`

- [ ] **Step 1: Create the schema file**

Create `src/lib/schemas/projects.ts`:

```typescript
import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const createProjectSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  client_name: z.string().max(200).nullish(),
  deadline: z.string().regex(ISO_DATE, "Use YYYY-MM-DD format").nullish(),
  notes: z.string().max(5000).nullish(),
  rfp_text: z.string().max(200_000).nullish(),
});

export const updateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  client_name: z.string().max(200).nullish(),
  deadline: z.string().regex(ISO_DATE).nullish(),
  notes: z.string().max(5000).nullish(),
  status: z.enum(["draft", "in_review", "submitted", "won", "lost"]).optional(),
});

export const createSectionSchema = z.object({
  title: z.string().min(1).max(500),
  rfp_content: z.string().max(50_000).nullish(),
  position: z.number().int().min(0),
});

export const updateSectionSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  rfp_content: z.string().max(50_000).nullish(),
  position: z.number().int().min(0).optional(),
  ai_draft: z.string().max(200_000).nullish(),
  final_content: z.string().max(200_000).nullish(),
  status: z.enum(["pending", "generating", "generated", "approved"]).optional(),
});

export const bulkSectionsSchema = z.object({
  sections: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
        rfp_content: z.string().max(50_000).nullish(),
        position: z.number().int().min(0),
      })
    )
    .min(1, "At least one section is required"),
});

export const detectSectionsBodySchema = z.object({
  rfp_text: z.string().min(1).max(200_000),
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/schemas/projects.ts
git commit -m "feat(schemas): add project and section Zod schemas"
```

---

## Task 4: Proposal limit helper

**Files:**
- Create: `src/lib/projects/limits.ts`

- [ ] **Step 1: Create the limits helper**

Create `src/lib/projects/limits.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { PLAN_LIMITS } from "@/types/index";
import { ApiError } from "@/lib/auth/requireRole";

export async function assertProposalLimit(
  supabase: SupabaseClient<Database>,
  orgId: string
): Promise<number> {
  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("plan, proposals_used")
    .eq("org_id", orgId)
    .single();

  if (error || !sub) {
    throw new ApiError("internal_error", "Could not retrieve subscription", 500);
  }

  const limit =
    PLAN_LIMITS[sub.plan as keyof typeof PLAN_LIMITS]?.proposals ?? 10;

  if (sub.proposals_used >= limit) {
    throw new ApiError(
      "limit_reached",
      `Proposal limit reached. Used ${sub.proposals_used} of ${limit} this cycle. Upgrade to create more proposals.`,
      429
    );
  }

  return sub.proposals_used;
}

export async function incrementProposalsUsed(
  supabase: SupabaseClient<Database>,
  orgId: string,
  currentCount: number
): Promise<void> {
  await supabase
    .from("subscriptions")
    .update({ proposals_used: currentCount + 1 })
    .eq("org_id", orgId);
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/projects/limits.ts
git commit -m "feat(projects): add proposal limit check and increment helper"
```

---

## Task 5: Projects list + create API

**Files:**
- Create: `src/app/api/projects/route.ts`

- [ ] **Step 1: Create the route file**

Create `src/app/api/projects/route.ts`:

```typescript
import { withErrorHandling, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { createProjectSchema } from "@/lib/schemas/projects";
import { assertProposalLimit, incrementProposalsUsed } from "@/lib/projects/limits";
import { detectSections } from "@/lib/ai/generate";

export const GET = withErrorHandling(async () => {
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);

  const { data, error } = await supabase
    .from("rfp_projects")
    .select("*, rfp_sections(status)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const projects = (data ?? []).map((p) => {
    const sections = p.rfp_sections ?? [];
    return {
      ...p,
      rfp_sections: undefined,
      section_count: sections.length,
      approved_count: sections.filter((s) => s.status === "approved").length,
    };
  });

  return ok(projects);
});

export const POST = withErrorHandling(async (req) => {
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const body = createProjectSchema.parse(await req.json());

  const currentCount = await assertProposalLimit(supabase, orgId);

  const { data: project, error: insertError } = await supabase
    .from("rfp_projects")
    .insert({
      org_id: orgId,
      title: body.title,
      client_name: body.client_name ?? null,
      deadline: body.deadline ?? null,
      notes: body.notes ?? null,
      rfp_raw_text: body.rfp_text ?? null,
    })
    .select()
    .single();

  if (insertError || !project) throw insertError ?? new Error("Insert failed");

  let sections: unknown[] = [];
  if (body.rfp_text) {
    const detected = await detectSections(body.rfp_text);
    if (detected.length > 0) {
      const rows = detected.map((s, i) => ({
        project_id: project.id,
        title: s.title,
        rfp_content: s.rfp_content ?? null,
        position: i,
      }));
      const { data: insertedSections, error: sectionsError } = await supabase
        .from("rfp_sections")
        .insert(rows)
        .select();
      if (sectionsError) throw sectionsError;
      sections = insertedSections ?? [];
    }
  }

  await incrementProposalsUsed(supabase, orgId, currentCount);

  return ok({ project, sections }, 201);
});
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

Expected: `✓ Compiled successfully`. Route `POST /api/projects` and `GET /api/projects` should appear in the build output.

- [ ] **Step 3: Smoke-test GET (requires running dev server)**

```bash
pnpm dev
```

In a browser or curl:
```bash
curl http://localhost:3000/api/projects -H "Cookie: <your-session-cookie>"
```

Expected: `{ "data": [], "error": null }` (empty array for a fresh org).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/projects/route.ts
git commit -m "feat(api): add GET /api/projects and POST /api/projects with section detection"
```

---

## Task 6: Project detail + update + delete API

**Files:**
- Create: `src/app/api/projects/[id]/route.ts`

- [ ] **Step 1: Create the route file**

Create `src/app/api/projects/[id]/route.ts`:

```typescript
import { withErrorHandling, ok, ApiErrors } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { updateProjectSchema } from "@/lib/schemas/projects";

export const GET = withErrorHandling(async (_req, ctx) => {
  const { id } = await ctx.params;
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);

  const { data: project, error } = await supabase
    .from("rfp_projects")
    .select("*, rfp_sections(*)")
    .eq("id", id)
    .eq("org_id", orgId)
    .order("position", { ascending: true, referencedTable: "rfp_sections" })
    .single();

  if (error || !project) return ApiErrors.NotFound("Project");

  return ok(project);
});

export const PUT = withErrorHandling(async (req, ctx) => {
  const { id } = await ctx.params;
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const body = updateProjectSchema.parse(await req.json());

  const { data: project, error } = await supabase
    .from("rfp_projects")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();

  if (error || !project) return ApiErrors.NotFound("Project");

  return ok(project);
});

export const DELETE = withErrorHandling(async (_req, ctx) => {
  const { id } = await ctx.params;
  const { orgId, role, supabase } = await requireRole(["owner", "admin"]);

  if (role === "member") return ApiErrors.Forbidden();

  const { error } = await supabase
    .from("rfp_projects")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) throw error;

  return ok(null);
});
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/projects/[id]/route.ts
git commit -m "feat(api): add GET/PUT/DELETE /api/projects/[id]"
```

---

## Task 7: Sections API (list, create, update, delete, bulk-replace)

**Files:**
- Create: `src/app/api/projects/[id]/sections/route.ts`
- Create: `src/app/api/projects/[id]/sections/[sid]/route.ts`
- Create: `src/app/api/projects/[id]/sections/bulk/route.ts`

- [ ] **Step 1: Create sections list + create route**

Create `src/app/api/projects/[id]/sections/route.ts`:

```typescript
import { withErrorHandling, ok, ApiErrors } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { createSectionSchema } from "@/lib/schemas/projects";

export const GET = withErrorHandling(async (_req, ctx) => {
  const { id } = await ctx.params;
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);

  // RLS guards section access via project_id → rfp_projects.org_id
  const { data: project } = await supabase
    .from("rfp_projects")
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  if (!project) return ApiErrors.NotFound("Project");

  const { data: sections, error } = await supabase
    .from("rfp_sections")
    .select("*")
    .eq("project_id", id)
    .order("position", { ascending: true });

  if (error) throw error;

  return ok(sections ?? []);
});

export const POST = withErrorHandling(async (req, ctx) => {
  const { id } = await ctx.params;
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const body = createSectionSchema.parse(await req.json());

  const { data: project } = await supabase
    .from("rfp_projects")
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  if (!project) return ApiErrors.NotFound("Project");

  const { data: section, error } = await supabase
    .from("rfp_sections")
    .insert({
      project_id: id,
      title: body.title,
      rfp_content: body.rfp_content ?? null,
      position: body.position,
    })
    .select()
    .single();

  if (error || !section) throw error ?? new Error("Insert failed");

  return ok(section, 201);
});
```

- [ ] **Step 2: Create section update + delete route**

Create `src/app/api/projects/[id]/sections/[sid]/route.ts`:

```typescript
import { withErrorHandling, ok, ApiErrors } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { updateSectionSchema } from "@/lib/schemas/projects";

export const PUT = withErrorHandling(async (req, ctx) => {
  const { id, sid } = await ctx.params;
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const body = updateSectionSchema.parse(await req.json());

  // Verify project ownership (sections inherit via FK, but double-check)
  const { data: project } = await supabase
    .from("rfp_projects")
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  if (!project) return ApiErrors.NotFound("Project");

  const { data: section, error } = await supabase
    .from("rfp_sections")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", sid)
    .eq("project_id", id)
    .select()
    .single();

  if (error || !section) return ApiErrors.NotFound("Section");

  return ok(section);
});

export const DELETE = withErrorHandling(async (_req, ctx) => {
  const { id, sid } = await ctx.params;
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);

  const { data: project } = await supabase
    .from("rfp_projects")
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  if (!project) return ApiErrors.NotFound("Project");

  const { error } = await supabase
    .from("rfp_sections")
    .delete()
    .eq("id", sid)
    .eq("project_id", id);

  if (error) throw error;

  return ok(null);
});
```

- [ ] **Step 3: Create bulk-replace route**

Create `src/app/api/projects/[id]/sections/bulk/route.ts`:

```typescript
import { withErrorHandling, ok, ApiErrors } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { bulkSectionsSchema } from "@/lib/schemas/projects";

// POST /api/projects/[id]/sections/bulk
// Replaces all sections for a project atomically (delete + re-insert).
// Used by the section review "Confirm" step.
export const POST = withErrorHandling(async (req, ctx) => {
  const { id } = await ctx.params;
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const { sections } = bulkSectionsSchema.parse(await req.json());

  const { data: project } = await supabase
    .from("rfp_projects")
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  if (!project) return ApiErrors.NotFound("Project");

  // Delete all existing sections
  const { error: deleteError } = await supabase
    .from("rfp_sections")
    .delete()
    .eq("project_id", id);

  if (deleteError) throw deleteError;

  // Insert the new set
  const rows = sections.map((s, i) => ({
    project_id: id,
    title: s.title,
    rfp_content: s.rfp_content ?? null,
    position: s.position ?? i,
  }));

  const { data: insertedSections, error: insertError } = await supabase
    .from("rfp_sections")
    .insert(rows)
    .select()
    .order("position", { ascending: true });

  if (insertError) throw insertError;

  return ok(insertedSections ?? []);
});
```

- [ ] **Step 4: Verify build**

```bash
pnpm build
```

Expected: `✓ Compiled successfully`. Check that the new section routes appear.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/projects/[id]/sections/route.ts \
        src/app/api/projects/[id]/sections/[sid]/route.ts \
        src/app/api/projects/[id]/sections/bulk/route.ts
git commit -m "feat(api): add sections CRUD and bulk-replace endpoints"
```

---

## Task 8: Detect-sections API

**Files:**
- Create: `src/app/api/projects/[id]/detect-sections/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/projects/[id]/detect-sections/route.ts`:

```typescript
import { withErrorHandling, ok, ApiErrors } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { detectSectionsBodySchema } from "@/lib/schemas/projects";
import { detectSections } from "@/lib/ai/generate";

// POST /api/projects/[id]/detect-sections
// Re-runs section detection on an existing project.
// Accepts either rfp_text in the body OR falls back to rfp_raw_text stored on the project.
export const POST = withErrorHandling(async (req, ctx) => {
  const { id } = await ctx.params;
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);

  const rawBody = await req.text();
  let rfpText: string | null = null;

  if (rawBody.length > 0) {
    const body = detectSectionsBodySchema.parse(JSON.parse(rawBody));
    rfpText = body.rfp_text;
  }

  const { data: project, error: projectError } = await supabase
    .from("rfp_projects")
    .select("id, rfp_raw_text")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  if (projectError || !project) return ApiErrors.NotFound("Project");

  const textToDetect = rfpText ?? project.rfp_raw_text;
  if (!textToDetect) {
    return ApiErrors.ValidationFailed(
      "No RFP text available. Provide rfp_text in the request body."
    );
  }

  // Store updated rfp_raw_text if new text was provided
  if (rfpText && rfpText !== project.rfp_raw_text) {
    await supabase
      .from("rfp_projects")
      .update({ rfp_raw_text: rfpText })
      .eq("id", id);
  }

  const detected = await detectSections(textToDetect);

  // Replace all sections
  await supabase.from("rfp_sections").delete().eq("project_id", id);

  const rows = detected.map((s, i) => ({
    project_id: id,
    title: s.title,
    rfp_content: s.rfp_content ?? null,
    position: i,
  }));

  const { data: sections, error: insertError } = await supabase
    .from("rfp_sections")
    .insert(rows)
    .select()
    .order("position", { ascending: true });

  if (insertError) throw insertError;

  return ok({ project_id: id, sections: sections ?? [] });
});
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/projects/[id]/detect-sections/route.ts
git commit -m "feat(api): add POST /api/projects/[id]/detect-sections"
```

---

## Task 9: Dashboard page — stats cards + projects table

**Files:**
- Create: `src/app/(dashboard)/dashboard/StatsCards.tsx`
- Create: `src/app/(dashboard)/dashboard/ProjectsTable.tsx`
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Create StatsCards component**

Create `src/app/(dashboard)/dashboard/StatsCards.tsx`:

```tsx
interface StatsCardsProps {
  activeProposals: number;
  kbDocCount: number;
  winRate: number | null;
  timeSavedHours: number;
}

export function StatsCards({
  activeProposals,
  kbDocCount,
  winRate,
  timeSavedHours,
}: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Active Proposals
        </p>
        <p className="mt-1 text-2xl font-semibold">{activeProposals}</p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          KB Documents
        </p>
        <p className="mt-1 text-2xl font-semibold">{kbDocCount}</p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Win Rate
        </p>
        <p className="mt-1 text-2xl font-semibold">
          {winRate === null ? "—" : `${Math.round(winRate)}%`}
        </p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Est. Time Saved
        </p>
        <p className="mt-1 text-2xl font-semibold">{timeSavedHours}h</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ProjectsTable client component**

Create `src/app/(dashboard)/dashboard/ProjectsTable.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="in_review">In review</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
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
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status]}`}
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
```

- [ ] **Step 3: Update the dashboard page**

Replace `src/app/(dashboard)/dashboard/page.tsx` entirely:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { StatsCards } from "./StatsCards";
import { ProjectsTable } from "./ProjectsTable";
import type { RfpProject } from "@/types";

interface ProjectRow extends RfpProject {
  rfp_sections: { status: string }[];
}

export default async function DashboardPage() {
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

  const [projectsResult, kbResult] = await Promise.all([
    supabase
      .from("rfp_projects")
      .select("*, rfp_sections(status)")
      .eq("org_id", me.org_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("knowledge_docs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", me.org_id)
      .eq("status", "ready"),
  ]);

  const rawProjects: ProjectRow[] = projectsResult.data ?? [];
  const kbDocCount = kbResult.count ?? 0;

  const projects = rawProjects.map((p) => ({
    ...p,
    rfp_sections: undefined,
    section_count: p.rfp_sections?.length ?? 0,
    approved_count: (p.rfp_sections ?? []).filter((s) => s.status === "approved")
      .length,
  }));

  const activeProposals = projects.filter(
    (p) => p.status !== "won" && p.status !== "lost"
  ).length;

  const wonCount = projects.filter((p) => p.status === "won").length;
  const lostCount = projects.filter((p) => p.status === "lost").length;
  const winRate =
    wonCount + lostCount > 0
      ? (wonCount / (wonCount + lostCount)) * 100
      : null;

  const timeSavedHours = Math.round(
    projects.reduce((sum, p) => sum + p.approved_count, 0) * 2.5
  );

  return (
    <main className="mx-auto max-w-5xl p-6 md:p-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/kb">
            <Button variant="outline" size="sm">
              Knowledge Base
            </Button>
          </Link>
          <Link href="/projects/new">
            <Button size="sm">New proposal</Button>
          </Link>
        </div>
      </div>

      <div className="mt-6">
        <StatsCards
          activeProposals={activeProposals}
          kbDocCount={kbDocCount}
          winRate={winRate}
          timeSavedHours={timeSavedHours}
        />
      </div>

      <h2 className="mt-8 text-lg font-medium">Proposals</h2>
      <ProjectsTable projects={projects} />
    </main>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
pnpm build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Visual check in browser**

```bash
pnpm dev
```

Open `http://localhost:3000/dashboard`. Confirm: stats cards render, empty state renders with 4-step list and "Create first proposal" CTA.

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/dashboard/page.tsx \
        src/app/(dashboard)/dashboard/StatsCards.tsx \
        src/app/(dashboard)/dashboard/ProjectsTable.tsx
git commit -m "feat(ui): update dashboard with stats cards and projects table"
```

---

## Task 10: Projects list page

**Files:**
- Create: `src/app/(dashboard)/projects/page.tsx`

- [ ] **Step 1: Create the projects list page**

Create `src/app/(dashboard)/projects/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ProjectsTable } from "@/app/(dashboard)/dashboard/ProjectsTable";
import type { RfpProject } from "@/types";

interface ProjectRow extends RfpProject {
  rfp_sections: { status: string }[];
}

export default async function ProjectsPage() {
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

  const { data: rawProjects } = await supabase
    .from("rfp_projects")
    .select("*, rfp_sections(status)")
    .eq("org_id", me.org_id)
    .order("created_at", { ascending: false });

  const projects = (rawProjects as ProjectRow[] ?? []).map((p) => ({
    ...p,
    rfp_sections: undefined,
    section_count: p.rfp_sections?.length ?? 0,
    approved_count: (p.rfp_sections ?? []).filter((s) => s.status === "approved").length,
  }));

  return (
    <main className="mx-auto max-w-5xl p-6 md:p-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Proposals</h1>
        <Link href="/projects/new">
          <Button>New proposal</Button>
        </Link>
      </div>
      <ProjectsTable projects={projects} />
    </main>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

Expected: `✓ Compiled successfully`. `/projects` route should appear.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/projects/page.tsx
git commit -m "feat(ui): add /projects list page"
```

---

## Task 11: New Project page + form

**Files:**
- Create: `src/app/(dashboard)/projects/new/page.tsx`
- Create: `src/app/(dashboard)/projects/new/ProjectForm.tsx`

- [ ] **Step 1: Create the client form component**

Create `src/app/(dashboard)/projects/new/ProjectForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ProjectForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const body = {
      title: fd.get("title") as string,
      client_name: (fd.get("client_name") as string) || null,
      deadline: (fd.get("deadline") as string) || null,
      notes: (fd.get("notes") as string) || null,
      rfp_text: (fd.get("rfp_text") as string) || null,
    };

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok || json.error) {
        setError(json.error?.message ?? "Something went wrong");
        return;
      }

      const { project } = json.data as { project: { id: string }; sections: unknown[] };

      if (body.rfp_text) {
        router.push(`/projects/${project.id}/sections`);
      } else {
        router.push(`/projects/${project.id}`);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="title">Project title *</Label>
          <Input
            id="title"
            name="title"
            required
            placeholder="Q3 2026 City Transport RFP"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="client_name">Client name</Label>
          <Input
            id="client_name"
            name="client_name"
            placeholder="Department of Transport"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="deadline">Submission deadline</Label>
          <Input
            id="deadline"
            name="deadline"
            type="date"
            className="mt-1"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="notes">Internal notes</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="Key win themes, price constraints, competitor notes…"
            className="mt-1"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="rfp_text">Paste RFP text</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            AI will auto-detect sections. You can also skip and add sections manually.
          </p>
          <Textarea
            id="rfp_text"
            name="rfp_text"
            rows={10}
            placeholder="Paste the full RFP document text here…"
            className="mt-1 font-mono text-xs"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Creating…" : "Create proposal"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/projects")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create the server page wrapper**

Create `src/app/(dashboard)/projects/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectForm } from "./ProjectForm";

export default async function NewProjectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">New proposal</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fill in the details and optionally paste the RFP text for AI section detection.
        </p>
      </div>
      <ProjectForm />
    </main>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

Expected: `✓ Compiled successfully`. `/projects/new` route appears.

- [ ] **Step 4: Test form in browser**

```bash
pnpm dev
```

Open `http://localhost:3000/projects/new`. Verify:
- Form renders without errors
- Submitting with only a title (no rfp_text) → redirects to `/projects/[id]`
- Submitting with rfp_text → redirects to `/projects/[id]/sections`
- Submitting with missing title → shows HTML validation error (browser native)

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/projects/new/page.tsx \
        src/app/(dashboard)/projects/new/ProjectForm.tsx
git commit -m "feat(ui): add new project page with RFP text input"
```

---

## Task 12: Project placeholder page (editor shell for Module 5)

**Files:**
- Create: `src/app/(dashboard)/projects/[id]/page.tsx`

- [ ] **Step 1: Create the placeholder page**

Create `src/app/(dashboard)/projects/[id]/page.tsx`:

```tsx
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

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

  const { data: project } = await supabase
    .from("rfp_projects")
    .select("id, title, status, rfp_sections(id, title, status, position)")
    .eq("id", id)
    .order("position", { ascending: true, referencedTable: "rfp_sections" })
    .single();

  if (!project) notFound();

  const sections = project.rfp_sections ?? [];
  const approvedCount = sections.filter((s) => s.status === "approved").length;

  return (
    <main className="mx-auto max-w-3xl p-6 md:p-10">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/projects"
            className="text-xs text-muted-foreground hover:underline"
          >
            ← Proposals
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{project.title}</h1>
        </div>
        <Link href={`/projects/${id}/sections`}>
          <Button variant="outline" size="sm">
            Review sections
          </Button>
        </Link>
      </div>

      <p className="mt-4 text-sm text-muted-foreground rounded-lg border border-dashed p-6 text-center">
        AI editor coming in Week 5.
        <br />
        <span className="font-medium text-foreground">
          {approvedCount}/{sections.length} sections approved.
        </span>
      </p>

      {sections.length > 0 && (
        <ul className="mt-6 divide-y rounded-lg border">
          {sections.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${
                  s.status === "approved"
                    ? "bg-green-500"
                    : s.status === "generated"
                    ? "bg-blue-400"
                    : "bg-gray-300"
                }`}
              />
              <span className="flex-1 text-sm">{s.title}</span>
              <span className="text-xs text-muted-foreground capitalize">
                {s.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/projects/[id]/page.tsx
git commit -m "feat(ui): add project detail placeholder page (editor shell for Module 5)"
```

---

## Task 13: Section Review page (drag-to-reorder + confirm)

**Files:**
- Create: `src/app/(dashboard)/projects/[id]/sections/page.tsx`
- Create: `src/app/(dashboard)/projects/[id]/sections/SectionList.tsx`

- [ ] **Step 1: Create the SectionList client component**

Create `src/app/(dashboard)/projects/[id]/sections/SectionList.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RfpSection } from "@/types";

interface SectionDraft {
  id: string;
  title: string;
  rfp_content: string | null;
}

function SortableRow({
  section,
  onRename,
  onDelete,
}: {
  section: SectionDraft;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.title);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function commitRename() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== section.title) onRename(section.id, trimmed);
    else setDraft(section.title);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border bg-white px-3 py-2.5 shadow-sm"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-gray-300 hover:text-gray-500 touch-none"
        aria-label="Drag to reorder"
      >
        ⠿
      </button>

      {/* Title — click to edit */}
      {editing ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              setDraft(section.title);
              setEditing(false);
            }
          }}
          className="h-7 flex-1 text-sm"
        />
      ) : (
        <button
          className="flex-1 text-left text-sm hover:underline"
          onClick={() => setEditing(true)}
        >
          {section.title}
        </button>
      )}

      <button
        onClick={() => onDelete(section.id)}
        className="shrink-0 text-xs text-gray-400 hover:text-red-600"
        aria-label="Delete section"
      >
        ✕
      </button>
    </div>
  );
}

export function SectionList({
  initialSections,
  projectId,
}: {
  initialSections: RfpSection[];
  projectId: string;
}) {
  const router = useRouter();
  const [sections, setSections] = useState<SectionDraft[]>(
    initialSections.map((s) => ({
      id: s.id,
      title: s.title,
      rfp_content: s.rfp_content,
    }))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSections((prev) => {
        const oldIdx = prev.findIndex((s) => s.id === active.id);
        const newIdx = prev.findIndex((s) => s.id === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  }

  function handleRename(id: string, title: string) {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title } : s))
    );
  }

  function handleDelete(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
  }

  function handleAddSection() {
    const newSection: SectionDraft = {
      id: `new-${Date.now()}`,
      title: "New section",
      rfp_content: null,
    };
    setSections((prev) => [...prev, newSection]);
  }

  async function handleConfirm() {
    if (sections.length === 0) {
      setError("At least one section is required.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/sections/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: sections.map((s, i) => ({
            title: s.title,
            rfp_content: s.rfp_content,
            position: i,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error?.message ?? "Failed to save sections.");
        return;
      }
      router.push(`/projects/${projectId}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sections.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {sections.map((s) => (
              <SortableRow
                key={s.id}
                section={s}
                onRename={handleRename}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {sections.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8 rounded-lg border border-dashed">
          No sections. Add one below or go back and re-detect.
        </p>
      )}

      <button
        onClick={handleAddSection}
        className="w-full rounded-lg border-2 border-dashed py-2 text-sm text-muted-foreground hover:border-gray-400 hover:text-gray-600 transition-colors"
      >
        + Add section manually
      </button>

      {error && (
        <p className="text-sm text-red-600 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <Button onClick={handleConfirm} disabled={loading || sections.length === 0}>
          {loading ? "Saving…" : "Confirm & start generating →"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the server page**

Create `src/app/(dashboard)/projects/[id]/sections/page.tsx`:

```tsx
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SectionList } from "./SectionList";

export default async function SectionReviewPage({
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

  const { data: project } = await supabase
    .from("rfp_projects")
    .select("id, title")
    .eq("id", id)
    .single();

  if (!project) notFound();

  const { data: sections } = await supabase
    .from("rfp_sections")
    .select("*")
    .eq("project_id", id)
    .order("position", { ascending: true });

  return (
    <main className="mx-auto max-w-2xl p-6 md:p-10">
      <Link
        href={`/projects/${id}`}
        className="text-xs text-muted-foreground hover:underline"
      >
        ← {project.title}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Review detected sections</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Drag to reorder, click a title to rename, or add/remove sections.
        Hit <strong>Confirm</strong> when you&apos;re ready.
      </p>

      <div className="mt-8">
        <SectionList
          initialSections={sections ?? []}
          projectId={id}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

Expected: `✓ Compiled successfully`. `/projects/[id]/sections` route appears.

- [ ] **Step 4: End-to-end test in browser**

```bash
pnpm dev
```

Test the full happy path:
1. Go to `http://localhost:3000/projects/new`
2. Fill title + paste a short RFP text (3–4 paragraphs with distinct topics)
3. Submit → redirected to `/projects/[id]/sections`
4. Verify sections list appears with detected titles
5. Drag a section to reorder it
6. Click a title to rename it → press Enter to confirm
7. Delete one section
8. Click "+ Add section manually" → confirm new row appears
9. Click "Confirm & start generating →" → redirected to `/projects/[id]`
10. Verify the project detail page shows the saved sections in the new order

- [ ] **Step 5: Lint check**

```bash
pnpm lint
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Final build verification**

```bash
pnpm build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 7: Commit**

```bash
git add src/app/(dashboard)/projects/[id]/sections/page.tsx \
        src/app/(dashboard)/projects/[id]/sections/SectionList.tsx
git commit -m "feat(ui): add section review page with drag-to-reorder and confirm"
```

---

## Self-Review

### Spec coverage check

| Plan.md requirement | Task that implements it |
|---|---|
| Types: `ProjectStatus`, `SectionStatus` | Already in `src/types/index.ts` — ✅ no action needed |
| `detectSections()` already exists | Already in `src/lib/ai/generate.ts` — ✅ used in Tasks 5 and 8 |
| POST /api/projects with limit check + section detection | Task 5 |
| GET /api/projects with section_count + approved_count | Task 5 |
| GET/PUT/DELETE /api/projects/[id] | Task 6 |
| POST /api/projects/[id]/detect-sections | Task 8 |
| Monthly limit enforcement (10 proposals for starter) | Task 4 |
| Dashboard stats cards | Task 9 |
| Dashboard projects table with status badge, progress bar | Task 9 |
| Dashboard search/filter by status | Task 9 (`ProjectsTable` filter) |
| Dashboard empty state with 4-step explainer | Task 9 |
| New Project page with paste-text input | Task 11 |
| Section review: drag-to-reorder | Task 13 |
| Section review: rename inline | Task 13 |
| Section review: remove section | Task 13 |
| Section review: add section manually | Task 13 |
| Section review: Confirm → save positions → redirect to editor | Task 13 |

### Placeholder scan

No "TBD", "TODO", or implementation-deferred steps found. All code blocks contain complete, runnable code.

### Type consistency

- `RfpSection` type (from `src/types/index.ts`) used in `SectionList.tsx` initial data — matches `rfp_sections` Row type
- `createProjectSchema` → used in Task 5 API; output columns match `rfp_projects` Insert type (including new `rfp_raw_text`)
- `bulkSectionsSchema` in Task 7 → consumed by `SectionList` in Task 13 — field names match (`title`, `rfp_content`, `position`)
- `assertProposalLimit` returns `number` (current count) → passed to `incrementProposalsUsed` as `currentCount` — consistent
- `detectSections()` returns `Array<{ title: string; rfp_content: string }>` — matches section insert fields in Tasks 5 and 8

### Known gaps / deferred to Module 5

- The `/projects/[id]` page (Task 12) is a placeholder — the AI editor is Module 5
- `PUT /api/projects/[id]/sections/[sid]` exists but is not called by any Module 3 UI — used by Module 5 (auto-save)
- `GET /api/projects/[id]/sections` exists but not called by Module 3 UI — used by Module 5 (editor section list)
- File upload for RFP (the plan mentions "toggle between upload and paste") — deferred: DB has no `rfp_file_url` column; paste-text only for MVP
