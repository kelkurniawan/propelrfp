# Week 3 — Knowledge Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the end-to-end Knowledge Base pipeline — drag-and-drop upload, async PDF/DOCX processing into pgvector, plan-limit enforcement, and a debug retrieval page.

**Architecture:** Direct-to-Storage upload via signed URL → fire-and-forget process trigger + Vercel Cron safety net → pdf-parse/mammoth → tiktoken chunking → OpenAI embeddings → pgvector. UI polls every 2 s while rows are queued/processing.

**Tech Stack:** Next.js 16 App Router, Supabase Storage + pgvector, pdf-parse v2, mammoth, tiktoken (cl100k_base), OpenAI text-embedding-3-small, sonner toasts, shadcn/ui — all already installed.

---

## File Map

**Create:**
- `supabase/migrations/003_kb_storage.sql` — two SQL functions: `match_doc_chunks` (similarity search) + `claim_next_queued_doc` (atomic claim)
- `src/lib/schemas/kb.ts` — Zod schemas for upload and search
- `src/lib/kb/storage.ts` — Storage helpers (signed URL, download, delete) using direct Supabase SDK
- `src/lib/kb/parse.ts` — pdf-parse + mammoth wrappers
- `src/lib/kb/chunk.ts` — tiktoken sliding-window chunker
- `src/lib/kb/limits.ts` — plan-limit enforcement (`assertWithinLimit`)
- `src/lib/kb/process.ts` — full processing pipeline orchestrator
- `src/app/api/kb/upload-url/route.ts` — generates signed upload URL
- `src/app/api/kb/docs/route.ts` — GET list / POST register / DELETE
- `src/app/api/kb/docs/[id]/route.ts` — POST retry action
- `src/app/api/kb/docs/[id]/download/route.ts` — GET signed download URL
- `src/app/api/kb/process/route.ts` — single-doc processor (Bearer CRON_SECRET)
- `src/app/api/kb/search/route.ts` — debug vector search
- `src/app/api/cron/process-kb/route.ts` — Vercel Cron entry (loops up to 5×)
- `src/app/(dashboard)/kb/page.tsx` — server component: KB list page
- `src/app/(dashboard)/kb/UsageMeter.tsx` — storage bar component
- `src/app/(dashboard)/kb/KbClient.tsx` — client wrapper holding docs state
- `src/app/(dashboard)/kb/DropZone.tsx` — drag-and-drop upload with 3-wide semaphore
- `src/app/(dashboard)/kb/DocsTable.tsx` — polling table with retry/download/delete
- `src/app/(dashboard)/kb/search/page.tsx` — owner/admin debug page
- `src/app/(dashboard)/kb/search/SearchForm.tsx` — query form + similarity cards
- `vercel.json` — cron schedule config
- `.env.example` — all required env vars

**Modify:**
- `src/types/database.ts` — add `Functions` types for `match_doc_chunks` and `claim_next_queued_doc`
- `src/app/(dashboard)/dashboard/page.tsx` — add Knowledge Base link

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/003_kb_storage.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/003_kb_storage.sql

-- Cosine-similarity search over doc_chunks.
-- security invoker keeps RLS active — only chunks from current_org_id() are visible.
create or replace function match_doc_chunks(
  query_embedding vector(1536),
  match_count int default 5
)
returns table (
  id uuid,
  doc_id uuid,
  content text,
  chunk_index int,
  similarity float
)
language sql stable security invoker
set search_path = public
as $$
  select
    id,
    doc_id,
    content,
    chunk_index,
    1 - (embedding <=> query_embedding) as similarity
  from doc_chunks
  where org_id = current_org_id()
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Atomic queued→processing transition using FOR UPDATE SKIP LOCKED.
-- security definer + service_role-only grant keeps it safe.
create or replace function claim_next_queued_doc()
returns table (id uuid, file_type text, org_id uuid)
language sql security definer
set search_path = public
as $$
  update knowledge_docs
  set status = 'processing'
  where id = (
    select id from knowledge_docs
    where status = 'queued'
    order by created_at
    limit 1
    for update skip locked
  )
  returning id, file_type, org_id;
$$;

revoke all on function claim_next_queued_doc() from public;
grant execute on function claim_next_queued_doc() to service_role;
```

- [ ] **Step 2: Apply the migration in the Supabase Dashboard**

Open the Supabase Dashboard → SQL Editor → paste the contents of `003_kb_storage.sql` → Run.

Verify by running:
```sql
select routine_name from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('match_doc_chunks', 'claim_next_queued_doc');
```
Expected: two rows.

- [ ] **Step 3: Create the Storage bucket (manual — one time)**

Supabase Dashboard → Storage → New bucket → Name: `documents` → Private (uncheck public). Click Create.

- [ ] **Step 4: Apply Storage RLS policies**

In the SQL Editor, run:
```sql
-- Read: org members can read their own org's files
create policy "kb_storage_org_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

-- Insert: org members can upload
create policy "kb_storage_org_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

-- Delete: owner/admin only
create policy "kb_storage_admin_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = current_org_id()::text
    and exists (
      select 1 from users
      where id = auth.uid() and role in ('owner', 'admin')
    )
  );
```

Verify: Dashboard → Storage → `documents` bucket → Policies → should list 3 policies.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/003_kb_storage.sql
git commit -m "feat(db): add match_doc_chunks and claim_next_queued_doc SQL functions"
```

---

## Task 2: Type definitions update

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add RPC function types to database.ts**

Open `src/types/database.ts`. Find the line:
```typescript
    Functions: Record<never, never>;
```

Replace it with:
```typescript
    Functions: {
      current_org_id: {
        Args: Record<never, never>;
        Returns: string;
      };
      match_doc_chunks: {
        Args: {
          query_embedding: number[];
          match_count?: number;
        };
        Returns: {
          id: string;
          doc_id: string;
          content: string;
          chunk_index: number;
          similarity: number;
        }[];
      };
      claim_next_queued_doc: {
        Args: Record<never, never>;
        Returns: {
          id: string;
          file_type: string;
          org_id: string;
        }[];
      };
    };
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(types): add match_doc_chunks and claim_next_queued_doc RPC types"
```

---

## Task 3: KB Zod schemas

**Files:**
- Create: `src/lib/schemas/kb.ts`

- [ ] **Step 1: Create the schema file**

```typescript
// src/lib/schemas/kb.ts
import { z } from "zod";

export const kbUploadSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().min(1),
  type: z.enum(["pdf", "docx"]),
});
export type KbUploadInput = z.infer<typeof kbUploadSchema>;

export const kbDocsPostSchema = z.object({
  docId: z.string().min(1),
  name: z.string().min(1).max(255),
  size: z.number().int().min(1),
  type: z.enum(["pdf", "docx"]),
  path: z.string().min(1),
});
export type KbDocsPostInput = z.infer<typeof kbDocsPostSchema>;

export const kbSearchSchema = z.object({
  query: z.string().min(1).max(1000),
});
export type KbSearchInput = z.infer<typeof kbSearchSchema>;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/schemas/kb.ts
git commit -m "feat(schemas): add KB upload and search Zod schemas"
```

---

## Task 4: Storage library

**Files:**
- Create: `src/lib/kb/storage.ts`

This module uses the Supabase JS SDK directly (not the SSR wrapper) so it works without cookies in background jobs.

- [ ] **Step 1: Create the storage helpers file**

```typescript
// src/lib/kb/storage.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

function serviceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function signedUploadUrl(
  orgId: string,
  docId: string,
  ext: "pdf" | "docx",
): Promise<{ uploadUrl: string; path: string }> {
  const path = `${orgId}/${docId}.${ext}`;
  const { data, error } = await serviceClient()
    .storage.from("documents")
    .createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("Failed to create signed upload URL");
  return { uploadUrl: data.signedUrl, path };
}

export async function downloadFile(path: string): Promise<Buffer> {
  const { data, error } = await serviceClient()
    .storage.from("documents")
    .download(path);
  if (error || !data) throw error ?? new Error(`Failed to download ${path}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteFile(path: string): Promise<void> {
  const { error } = await serviceClient()
    .storage.from("documents")
    .remove([path]);
  if (error) throw error;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kb/storage.ts
git commit -m "feat(kb): add Storage helpers (signedUploadUrl, downloadFile, deleteFile)"
```

---

## Task 5: Parser library

**Files:**
- Create: `src/lib/kb/parse.ts`

`pdf-parse` and `mammoth` are already in `package.json`. No `pnpm add` needed.

- [ ] **Step 1: Create the parser file**

```typescript
// src/lib/kb/parse.ts
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

export async function parsePdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  // Strip form-feed characters inserted between pages
  return data.text.replace(/\f/g, " ").trim();
}

export async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

export async function parseFile(
  buffer: Buffer,
  type: "pdf" | "docx",
): Promise<string> {
  if (type === "pdf") return parsePdf(buffer);
  return parseDocx(buffer);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kb/parse.ts
git commit -m "feat(kb): add PDF and DOCX parser wrappers"
```

---

## Task 6: Chunker library

**Files:**
- Create: `src/lib/kb/chunk.ts`

`tiktoken` is already in `package.json`.

- [ ] **Step 1: Create the chunker file**

```typescript
// src/lib/kb/chunk.ts
import { get_encoding } from "tiktoken";

export interface TextChunk {
  content: string;
  token_count: number;
  chunk_index: number;
}

export function chunkText(
  text: string,
  opts: { tokensPerChunk?: number; overlap?: number } = {},
): TextChunk[] {
  const { tokensPerChunk = 1000, overlap = 200 } = opts;
  const enc = get_encoding("cl100k_base");

  try {
    const allTokens = enc.encode(text);
    const chunks: TextChunk[] = [];
    let chunkIndex = 0;
    let start = 0;

    while (start < allTokens.length) {
      const end = Math.min(start + tokensPerChunk, allTokens.length);
      const slice = allTokens.slice(start, end);

      // Skip stub fragments shorter than 50 tokens (trailing document noise)
      if (slice.length >= 50) {
        const bytes = enc.decode(slice);
        const content = new TextDecoder().decode(bytes);
        chunks.push({ content, token_count: slice.length, chunk_index: chunkIndex++ });
      }

      if (end >= allTokens.length) break;
      start += tokensPerChunk - overlap;
    }

    return chunks;
  } finally {
    enc.free();
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kb/chunk.ts
git commit -m "feat(kb): add tiktoken sliding-window chunker (1000 tok / 200 overlap)"
```

---

## Task 7: Plan-limits library

**Files:**
- Create: `src/lib/kb/limits.ts`

- [ ] **Step 1: Create the limits file**

```typescript
// src/lib/kb/limits.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { PLAN_LIMITS } from "@/types";
import type { Plan } from "@/types";
import { ApiError } from "@/lib/auth/requireRole";

export function formatMb(bytes: number): string {
  if (!isFinite(bytes)) return "∞ MB";
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

export async function assertWithinLimit(
  supabase: SupabaseClient<Database>,
  orgId: string,
  incomingBytes: number,
): Promise<{ used: number; limitBytes: number }> {
  const [{ data: sub }, { data: rows }] = await Promise.all([
    supabase.from("subscriptions").select("plan").eq("org_id", orgId).single(),
    supabase.from("knowledge_docs").select("file_size_bytes").eq("org_id", orgId),
  ]);

  const used = (rows ?? []).reduce((acc, r) => acc + (r.file_size_bytes ?? 0), 0);
  const plan = (sub?.plan ?? "starter") as Plan;
  const limitMb = PLAN_LIMITS[plan].storageMb;
  const limitBytes = limitMb === Infinity ? Infinity : limitMb * 1024 * 1024;

  if (used + incomingBytes > limitBytes) {
    throw new ApiError(
      "limit_reached",
      `KB storage limit reached. ${formatMb(used)} / ${formatMb(limitBytes)} used.`,
      429,
    );
  }

  return { used, limitBytes };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kb/limits.ts
git commit -m "feat(kb): add plan-limit enforcement helper (assertWithinLimit)"
```

---

## Task 8: Process orchestrator

**Files:**
- Create: `src/lib/kb/process.ts`

- [ ] **Step 1: Create the orchestrator file**

```typescript
// src/lib/kb/process.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { downloadFile } from "./storage";
import { parseFile } from "./parse";
import { chunkText } from "./chunk";
import { embedBatch } from "@/lib/ai/embeddings";

function serviceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function processDoc(
  docId: string,
  fileType: "pdf" | "docx",
  orgId: string,
): Promise<void> {
  const supabase = serviceClient();

  // Fetch the file path stored in file_url
  const { data: doc, error: fetchError } = await supabase
    .from("knowledge_docs")
    .select("file_url")
    .eq("id", docId)
    .single();
  if (fetchError || !doc) throw fetchError ?? new Error("Document not found");

  // Download the raw file bytes from Storage
  const buffer = await downloadFile(doc.file_url);

  // Extract text
  const text = await parseFile(buffer, fileType);
  if (!text.trim()) throw new Error("No text could be extracted from this document");

  // Split into token windows
  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error("Document too short to chunk (< 50 tokens)");

  // Embed all chunks (batched in 100s internally)
  const embeddings = await embedBatch(chunks.map((c) => c.content));

  // Idempotency guard: delete any chunks left from a previous attempt
  await supabase.from("doc_chunks").delete().eq("doc_id", docId);

  // Insert the new chunks
  const rows = chunks.map((chunk, i) => ({
    doc_id: docId,
    org_id: orgId,
    content: chunk.content,
    token_count: chunk.token_count,
    chunk_index: chunk.chunk_index,
    embedding: embeddings[i],
  }));

  const { error: insertError } = await supabase.from("doc_chunks").insert(rows);
  if (insertError) throw insertError;

  // Mark document as ready
  await supabase
    .from("knowledge_docs")
    .update({ status: "ready" })
    .eq("id", docId);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kb/process.ts
git commit -m "feat(kb): add processDoc orchestrator (parse → chunk → embed → insert)"
```

---

## Task 9: Upload-URL API route

**Files:**
- Create: `src/app/api/kb/upload-url/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/kb/upload-url/route.ts
import { randomUUID } from "crypto";
import { withErrorHandling, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { kbUploadSchema } from "@/lib/schemas/kb";
import { assertWithinLimit } from "@/lib/kb/limits";
import { signedUploadUrl } from "@/lib/kb/storage";

export const POST = withErrorHandling(async (req) => {
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const body = kbUploadSchema.parse(await req.json());

  // Pre-flight plan limit check before issuing the signed URL
  await assertWithinLimit(supabase, orgId, body.size);

  const docId = randomUUID();
  const { uploadUrl, path } = await signedUploadUrl(orgId, docId, body.type);

  return ok({ docId, uploadUrl, path });
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/kb/upload-url/route.ts
git commit -m "feat(api): add POST /api/kb/upload-url (plan preflight + signed URL)"
```

---

## Task 10: Docs API route (GET / POST / DELETE)

**Files:**
- Create: `src/app/api/kb/docs/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/kb/docs/route.ts
import { withErrorHandling, ok, fail } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { kbDocsPostSchema } from "@/lib/schemas/kb";
import { assertWithinLimit } from "@/lib/kb/limits";
import { deleteFile } from "@/lib/kb/storage";

export const GET = withErrorHandling(async () => {
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const { data: docs } = await supabase
    .from("knowledge_docs")
    .select("id, name, file_type, file_size_bytes, file_url, status, error_message, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  return ok(docs ?? []);
});

export const POST = withErrorHandling(async (req) => {
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const body = kbDocsPostSchema.parse(await req.json());

  // Re-check limit (race protection: two parallel uploads may both pass the first check)
  await assertWithinLimit(supabase, orgId, body.size);

  const { data: doc, error } = await supabase
    .from("knowledge_docs")
    .insert({
      id: body.docId,
      org_id: orgId,
      name: body.name,
      file_url: body.path,
      file_type: body.type,
      file_size_bytes: body.size,
      status: "queued",
    })
    .select()
    .single();
  if (error || !doc) throw error ?? new Error("insert_failed");

  // Fire-and-forget: trigger the processor immediately without awaiting
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  fetch(`${appUrl}/api/kb/process`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch(() => {
    // Ignore — Vercel Cron is the safety net if this call fails
  });

  return ok({ doc });
});

export const DELETE = withErrorHandling(async (req) => {
  const { orgId, supabase } = await requireRole(["owner", "admin"]);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("validation_failed", "Missing id", 400);

  const { data: doc } = await supabase
    .from("knowledge_docs")
    .select("file_url")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();
  if (!doc) return fail("not_found", "Document not found", 404);

  // Delete DB row (cascades to doc_chunks via FK)
  await supabase.from("knowledge_docs").delete().eq("id", id);

  // Best-effort Storage cleanup — log but don't fail the request
  try {
    await deleteFile(doc.file_url);
  } catch (err) {
    console.error("[docs.delete] storage cleanup failed", err);
  }

  return ok(null);
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/kb/docs/route.ts
git commit -m "feat(api): add GET/POST/DELETE /api/kb/docs"
```

---

## Task 11: Docs [id] routes (retry + download)

**Files:**
- Create: `src/app/api/kb/docs/[id]/route.ts`
- Create: `src/app/api/kb/docs/[id]/download/route.ts`

- [ ] **Step 1: Create the retry route**

```typescript
// src/app/api/kb/docs/[id]/route.ts
import { z } from "zod";
import { withErrorHandling, ok, fail } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";

const retrySchema = z.object({ action: z.literal("retry") });

export const POST = withErrorHandling(async (req, ctx) => {
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const { id } = await ctx.params;
  const body = retrySchema.parse(await req.json());

  if (body.action !== "retry") return fail("validation_failed", "Unknown action", 400);

  const { error } = await supabase
    .from("knowledge_docs")
    .update({ status: "queued", error_message: null })
    .eq("id", id)
    .eq("org_id", orgId)
    .eq("status", "failed");

  if (error) throw error;

  // Re-trigger the processor
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  fetch(`${appUrl}/api/kb/process`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch(() => {});

  return ok(null);
});
```

- [ ] **Step 2: Create the download route**

```typescript
// src/app/api/kb/docs/[id]/download/route.ts
import { withErrorHandling, ok, fail } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";

export const GET = withErrorHandling(async (_req, ctx) => {
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const { id } = await ctx.params;

  // Verify the doc belongs to this org (defense in depth on top of requireRole)
  const { data: doc } = await supabase
    .from("knowledge_docs")
    .select("file_url, name")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();
  if (!doc) return fail("not_found", "Document not found", 404);

  // Issue a 60-second signed download URL
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(doc.file_url, 60);
  if (error || !data) throw error ?? new Error("Failed to create download URL");

  return ok({ url: data.signedUrl });
});
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/kb/docs/[id]/route.ts src/app/api/kb/docs/[id]/download/route.ts
git commit -m "feat(api): add retry and download routes for knowledge docs"
```

---

## Task 12: Process route + Cron route + config files

**Files:**
- Create: `src/app/api/kb/process/route.ts`
- Create: `src/app/api/cron/process-kb/route.ts`
- Create: `vercel.json`
- Create: `.env.example`

- [ ] **Step 1: Create the process route**

```typescript
// src/app/api/kb/process/route.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { ok, fail } from "@/lib/api";
import { processDoc } from "@/lib/kb/process";

function serviceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return fail("unauthorized", "Unauthorized", 401);
  }

  const supabase = serviceClient();

  // Atomically claim the next queued document
  const { data: docs, error: rpcError } = await supabase.rpc("claim_next_queued_doc");
  if (rpcError) {
    console.error("[process] claim RPC error", rpcError);
    return fail("internal_error", "RPC error", 500);
  }

  const doc = docs?.[0];
  if (!doc) {
    // Queue is empty — normal exit
    return ok({ processed: null });
  }

  try {
    await processDoc(doc.id, doc.file_type as "pdf" | "docx", doc.org_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    console.error(`[process] doc ${doc.id} failed:`, err);
    await supabase
      .from("knowledge_docs")
      .update({ status: "failed", error_message: message })
      .eq("id", doc.id);
  }

  return ok({ processed: doc.id });
}
```

- [ ] **Step 2: Create the cron route**

```typescript
// src/app/api/cron/process-kb/route.ts
import { ok, fail } from "@/lib/api";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return fail("unauthorized", "Unauthorized", 401);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let count = 0;

  // Loop up to 5 times — each iteration processes one document.
  // Breaking early when the queue is empty keeps us well under the 60s limit.
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${appUrl}/api/kb/process`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const body = (await res.json()) as { data: { processed: string | null } };
    if (!body.data?.processed) break;
    count += 1;
  }

  return ok({ processed: count });
}
```

- [ ] **Step 3: Create vercel.json**

```json
{
  "crons": [
    {
      "path": "/api/cron/process-kb",
      "schedule": "* * * * *"
    }
  ]
}
```

- [ ] **Step 4: Create .env.example**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key

# Stripe
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...

# Email
RESEND_API_KEY=re_...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Cron (any non-empty random string; set the same value in Vercel project settings)
CRON_SECRET=changeme
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/kb/process/route.ts src/app/api/cron/process-kb/route.ts vercel.json .env.example
git commit -m "feat(api): add process route, cron route, vercel.json cron schedule"
```

---

## Task 13: Search API route

**Files:**
- Create: `src/app/api/kb/search/route.ts`

- [ ] **Step 1: Create the search route**

```typescript
// src/app/api/kb/search/route.ts
import { withErrorHandling, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { kbSearchSchema } from "@/lib/schemas/kb";
import { embedText } from "@/lib/ai/embeddings";

export const POST = withErrorHandling(async (req) => {
  const { orgId, supabase } = await requireRole(["owner", "admin"]);

  // orgId is available if needed for logging, but RLS on match_doc_chunks
  // already scopes to current_org_id() via security invoker
  void orgId;

  const { query } = kbSearchSchema.parse(await req.json());

  const embedding = await embedText(query);

  const { data: chunks, error } = await supabase.rpc("match_doc_chunks", {
    query_embedding: embedding,
    match_count: 5,
  });
  if (error) throw error;

  // Enrich each chunk with its source document name
  const docIds = [...new Set((chunks ?? []).map((c) => c.doc_id))];
  const { data: docs } = await supabase
    .from("knowledge_docs")
    .select("id, name")
    .in("id", docIds);

  const docMap = Object.fromEntries((docs ?? []).map((d) => [d.id, d.name]));

  const results = (chunks ?? []).map((c) => ({
    id: c.id,
    doc_id: c.doc_id,
    doc_name: docMap[c.doc_id] ?? "Unknown",
    content: c.content,
    chunk_index: c.chunk_index,
    similarity: c.similarity,
  }));

  return ok(results);
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/kb/search/route.ts
git commit -m "feat(api): add POST /api/kb/search (embedText + match_doc_chunks)"
```

---

## Task 14: KB page server components (page + UsageMeter)

**Files:**
- Create: `src/app/(dashboard)/kb/page.tsx`
- Create: `src/app/(dashboard)/kb/UsageMeter.tsx`

Note: URL resolves to `/kb` (the `(dashboard)` group is transparent).

- [ ] **Step 1: Create UsageMeter**

```typescript
// src/app/(dashboard)/kb/UsageMeter.tsx
export function UsageMeter({
  usedBytes,
  limitMb,
}: {
  usedBytes: number;
  limitMb: number;
}) {
  if (!isFinite(limitMb)) return null;

  const limitBytes = limitMb * 1024 * 1024;
  const pct = Math.min((usedBytes / limitBytes) * 100, 100);
  const usedMb = (usedBytes / 1024 / 1024).toFixed(0);
  const nearLimit = pct >= 90;

  return (
    <div className="mt-4">
      <div className="mb-1 flex justify-between text-sm text-muted-foreground">
        <span>Storage</span>
        <span className={nearLimit ? "font-medium text-destructive" : ""}>
          {usedMb} MB / {limitMb} MB
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full transition-all ${nearLimit ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the KB page**

```typescript
// src/app/(dashboard)/kb/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PLAN_LIMITS } from "@/types";
import type { Plan } from "@/types";
import { UsageMeter } from "./UsageMeter";
import { KbClient } from "./KbClient";

export default async function KbPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("users")
    .select("org_id, role")
    .eq("id", user.id)
    .single();
  if (!me) redirect("/login");

  const [{ data: docs }, { data: sub }] = await Promise.all([
    supabase
      .from("knowledge_docs")
      .select("id, name, file_type, file_size_bytes, file_url, status, error_message, created_at")
      .eq("org_id", me.org_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("subscriptions")
      .select("plan")
      .eq("org_id", me.org_id)
      .single(),
  ]);

  const plan = (sub?.plan ?? "starter") as Plan;
  const limitMb = PLAN_LIMITS[plan].storageMb;
  const usedBytes = (docs ?? []).reduce((acc, d) => acc + (d.file_size_bytes ?? 0), 0);
  const canManage = me.role === "owner" || me.role === "admin";

  return (
    <main className="mx-auto max-w-4xl p-8 md:p-12">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "#162B44" }}>
          Knowledge Base
        </h1>
        {canManage && (
          <Link href="/kb/search" className="text-sm text-muted-foreground underline">
            Debug retrieval
          </Link>
        )}
      </div>
      <UsageMeter usedBytes={usedBytes} limitMb={limitMb} />
      <div className="mt-6">
        <KbClient initialDocs={docs ?? []} canManage={canManage} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles (KbClient is not yet created — expect a module-not-found error only)**

```bash
pnpm typecheck 2>&1 | grep -v "KbClient"
```
All errors except the missing KbClient import should be zero. The KbClient error will go away in Task 15.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/kb/page.tsx src/app/(dashboard)/kb/UsageMeter.tsx
git commit -m "feat(ui): add KB page and UsageMeter server components"
```

---

## Task 15: KbClient wrapper + DropZone

**Files:**
- Create: `src/app/(dashboard)/kb/KbClient.tsx`
- Create: `src/app/(dashboard)/kb/DropZone.tsx`

KbClient is the client-component state holder. It holds the docs array, passes callbacks to DropZone and DocsTable so they can share state without a server round-trip.

- [ ] **Step 1: Create DropZone**

```typescript
// src/app/(dashboard)/kb/DropZone.tsx
"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

function getFileType(file: File): "pdf" | "docx" | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (
    name.endsWith(".docx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  return null;
}

export type DocRow = {
  id: string;
  name: string;
  file_type: string;
  file_size_bytes: number;
  file_url: string;
  status: string;
  error_message: string | null;
  created_at: string;
};

export function DropZone({ onUploaded }: { onUploaded: (doc: DocRow) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const semaphore = useRef(0);
  const queue = useRef<File[]>([]);

  async function uploadFile(file: File, type: "pdf" | "docx") {
    // 1. Get signed upload URL + docId
    const urlRes = await fetch("/api/kb/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, type }),
    });
    const urlJson = await urlRes.json();
    if (urlJson.error) throw new Error(urlJson.error.message);
    const { docId, uploadUrl, path } = urlJson.data as {
      docId: string;
      uploadUrl: string;
      path: string;
    };

    // 2. PUT directly to Supabase Storage
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!putRes.ok) throw new Error("Storage upload failed");

    // 3. Register the doc row
    const docsRes = await fetch("/api/kb/docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docId, name: file.name, size: file.size, type, path }),
    });
    const docsJson = await docsRes.json();
    if (docsJson.error) throw new Error(docsJson.error.message);

    return docsJson.data.doc as DocRow;
  }

  function processQueue() {
    while (queue.current.length > 0 && semaphore.current < 3) {
      const file = queue.current.shift()!;
      const type = getFileType(file)!;
      semaphore.current += 1;

      uploadFile(file, type)
        .then((doc) => {
          toast.success(`${file.name} uploaded`);
          onUploaded(doc);
        })
        .catch((err: Error) => {
          toast.error(`${file.name}: ${err.message}`);
        })
        .finally(() => {
          semaphore.current -= 1;
          processQueue();
        });
    }
  }

  function enqueue(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name}: exceeds 25 MB limit`);
        continue;
      }
      if (!getFileType(file)) {
        toast.error(`${file.name}: only PDF and DOCX files are supported`);
        continue;
      }
      queue.current.push(file);
    }
    processQueue();
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    enqueue(e.dataTransfer.files);
  }, []);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
        dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
      }`}
    >
      <p className="text-sm text-muted-foreground">
        Drag PDF or DOCX files here, or{" "}
        <span className="underline">click to browse</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Up to 25 MB per file · 3 uploads at a time
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx"
        className="hidden"
        onChange={(e) => e.target.files && enqueue(e.target.files)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create KbClient**

```typescript
// src/app/(dashboard)/kb/KbClient.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { DropZone } from "./DropZone";
import type { DocRow } from "./DropZone";
import { DocsTable } from "./DocsTable";

function hasActive(docs: DocRow[]) {
  return docs.some((d) => d.status === "queued" || d.status === "processing");
}

export function KbClient({
  initialDocs,
  canManage,
}: {
  initialDocs: DocRow[];
  canManage: boolean;
}) {
  const [docs, setDocs] = useState<DocRow[]>(initialDocs);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startPolling() {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(async () => {
      const res = await fetch("/api/kb/docs");
      const json = await res.json();
      if (json.data) {
        setDocs(json.data as DocRow[]);
        if (!hasActive(json.data as DocRow[])) {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
        }
      }
    }, 2000);
  }

  useEffect(() => {
    if (hasActive(docs)) startPolling();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  function handleUploaded(doc: DocRow) {
    setDocs((prev) => [doc, ...prev]);
    startPolling();
  }

  function handleRetried(id: string) {
    setDocs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: "queued", error_message: null } : d))
    );
    startPolling();
  }

  function handleDeleted(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <div className="space-y-6">
      <DropZone onUploaded={handleUploaded} />
      <DocsTable
        docs={docs}
        canManage={canManage}
        onRetried={handleRetried}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles (DocsTable missing — expect one module error)**

```bash
pnpm typecheck 2>&1 | grep -v "DocsTable"
```
Expected: All errors except the missing DocsTable import are zero.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/kb/DropZone.tsx src/app/(dashboard)/kb/KbClient.tsx
git commit -m "feat(ui): add DropZone (3-wide semaphore upload) and KbClient state holder"
```

---

## Task 16: DocsTable

**Files:**
- Create: `src/app/(dashboard)/kb/DocsTable.tsx`

- [ ] **Step 1: Create DocsTable**

```typescript
// src/app/(dashboard)/kb/DocsTable.tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DocRow } from "./DropZone";

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-secondary text-secondary-foreground",
  processing: "bg-blue-100 text-blue-700",
  ready: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export function DocsTable({
  docs,
  canManage,
  onRetried,
  onDeleted,
}: {
  docs: DocRow[];
  canManage: boolean;
  onRetried: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<DocRow | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleError(id: string) {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function retry(doc: DocRow) {
    const res = await fetch(`/api/kb/docs/${doc.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry" }),
    });
    const json = await res.json();
    if (json.error) return toast.error(json.error.message);
    onRetried(doc.id);
    toast.success("Retry queued");
  }

  async function download(doc: DocRow) {
    const res = await fetch(`/api/kb/docs/${doc.id}/download`);
    const json = await res.json();
    if (json.error) return toast.error(json.error.message);
    window.open((json.data as { url: string }).url, "_blank");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    const res = await fetch(`/api/kb/docs?id=${deleteTarget.id}`, { method: "DELETE" });
    const json = await res.json();
    setBusy(false);
    if (json.error) return toast.error(json.error.message);
    onDeleted(deleteTarget.id);
    toast.success("Document deleted");
    setDeleteTarget(null);
  }

  if (docs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No documents yet. Upload your first file above.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Added</TableHead>
            <TableHead className="w-32"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {docs.map((doc) => (
            <>
              <TableRow key={doc.id}>
                <TableCell className="font-medium">{doc.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {(doc.file_size_bytes / 1024 / 1024).toFixed(1)} MB
                </TableCell>
                <TableCell>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium uppercase ${STATUS_BADGE[doc.status] ?? "bg-secondary"}`}
                  >
                    {doc.status}
                  </span>
                  {doc.status === "failed" && doc.error_message && (
                    <button
                      onClick={() => toggleError(doc.id)}
                      className="ml-2 text-xs text-destructive underline"
                    >
                      {expandedErrors.has(doc.id) ? "hide" : "details"}
                    </button>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(doc.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {doc.status === "failed" && (
                      <Button variant="outline" size="sm" onClick={() => retry(doc)}>
                        Retry
                      </Button>
                    )}
                    {doc.status === "ready" && (
                      <Button variant="outline" size="sm" onClick={() => download(doc)}>
                        Download
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(doc)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
              {expandedErrors.has(doc.id) && doc.error_message && (
                <TableRow key={`${doc.id}-error`}>
                  <TableCell colSpan={5}>
                    <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700 font-mono">
                      {doc.error_message}
                    </p>
                  </TableCell>
                </TableRow>
              )}
            </>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; and all its chunks will be permanently deleted.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 3: Verify lint**

```bash
pnpm lint
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/kb/DocsTable.tsx
git commit -m "feat(ui): add DocsTable with status badges, retry, download, delete"
```

---

## Task 17: KB search page + SearchForm

**Files:**
- Create: `src/app/(dashboard)/kb/search/page.tsx`
- Create: `src/app/(dashboard)/kb/search/SearchForm.tsx`

URL: `/kb/search` (visible to owner/admin only; others are redirected to `/kb`).

- [ ] **Step 1: Create SearchForm**

```typescript
// src/app/(dashboard)/kb/search/SearchForm.tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type SearchHit = {
  id: string;
  doc_id: string;
  doc_name: string;
  content: string;
  chunk_index: number;
  similarity: number;
};

export function SearchForm() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearched(false);

    const res = await fetch("/api/kb/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const json = await res.json();
    setLoading(false);
    setSearched(true);

    if (json.error) return toast.error(json.error.message);
    setHits((json.data as SearchHit[]) ?? []);
  }

  return (
    <div>
      <form onSubmit={handleSearch} className="flex gap-3">
        <textarea
          rows={3}
          placeholder="Enter a query to test retrieval…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button type="submit" disabled={loading} className="self-start">
          {loading ? "Searching…" : "Search"}
        </Button>
      </form>

      {hits.length > 0 && (
        <div className="mt-6 space-y-4">
          {hits.map((hit) => (
            <div key={hit.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{hit.doc_name}</span>
                <span className="text-xs text-muted-foreground">chunk #{hit.chunk_index}</span>
              </div>
              <div className="mt-2">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Similarity</span>
                  <span>{(hit.similarity * 100).toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(hit.similarity * 100).toFixed(1)}%` }}
                  />
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {hit.content.length > 500
                  ? `${hit.content.slice(0, 500)}…`
                  : hit.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {searched && hits.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          No chunks matched. Try a different query or verify that documents have been processed.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the search page**

```typescript
// src/app/(dashboard)/kb/search/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SearchForm } from "./SearchForm";

export default async function KbSearchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!me || (me.role !== "owner" && me.role !== "admin")) {
    redirect("/kb");
  }

  return (
    <main className="mx-auto max-w-3xl p-8 md:p-12">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "#162B44" }}>
          Debug Retrieval
        </h1>
        <Link href="/kb" className="text-sm text-muted-foreground underline">
          ← Back to KB
        </Link>
      </div>
      <p className="mt-2 text-muted-foreground">
        Test the search pipeline end-to-end. Top 5 chunks ranked by cosine similarity.
      </p>
      <div className="mt-8">
        <SearchForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 4: Verify lint**

```bash
pnpm lint
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/kb/search/page.tsx src/app/(dashboard)/kb/search/SearchForm.tsx
git commit -m "feat(ui): add KB debug search page and SearchForm with similarity bars"
```

---

## Task 18: Dashboard page update + final build verification

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Add Knowledge Base link to dashboard**

Open `src/app/(dashboard)/dashboard/page.tsx`. Find the buttons section:

```typescript
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/settings/org">
          <Button variant="outline">Organization settings</Button>
        </Link>
        <Link href="/settings/members">
          <Button>Invite teammates</Button>
        </Link>
      </div>
```

Replace it with:

```typescript
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/kb">
          <Button>Knowledge Base</Button>
        </Link>
        <Link href="/settings/org">
          <Button variant="outline">Organization settings</Button>
        </Link>
        <Link href="/settings/members">
          <Button variant="outline">Invite teammates</Button>
        </Link>
      </div>
```

Also update the placeholder text on the line that references "Knowledge Base lands next week":

```typescript
      <p className="mt-2 text-muted-foreground">
        Upload past proposals to your Knowledge Base to power AI-generated RFP responses.
      </p>
```

- [ ] **Step 2: Run full TypeScript check**

```bash
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```
Expected: No errors.

- [ ] **Step 4: Run build**

```bash
pnpm build
```
Expected: Build completes. Note any warnings (not errors).

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/dashboard/page.tsx
git commit -m "feat(ui): add Knowledge Base link to dashboard, update placeholder text"
```

---

## Manual smoke tests

After completing all tasks and starting the dev server (`pnpm dev`), run these tests manually. See the full 20-case matrix in the spec at `docs/superpowers/specs/2026-05-01-week3-knowledge-base-design.md §10`.

Priority cases to run first:

| # | Action | Expected |
|---|---|---|
| 1 | Drag a 2 MB PDF onto the KB page | Row appears `queued` → `processing` → `ready` within ~15s. Chunks visible in Supabase Dashboard → Table Editor → `doc_chunks`. |
| 2 | Drag a 1 MB DOCX | Same as #1. |
| 4 | Drag a 30 MB file | Client-side toast "exceeds 25 MB limit". No row created. |
| 5 | Drag a `.txt` file | Client-side toast "only PDF and DOCX files are supported". |
| 9 | Owner deletes a `ready` doc | Row disappears. `doc_chunks` for that doc gone. Storage file gone. |
| 12 | Navigate to `/kb/search`, run query "proposal" | Top 5 chunks ranked by similarity appear with source doc names. |
| 14 | Call `/api/cron/process-kb` with wrong secret | 401 response. |
| 17 | Log in as user of org A, run search | Only sees org A's chunks (verify in supabase that another org's chunks exist). |

---

## Self-review complete

**Spec coverage check:**
- ✅ Upload pipeline (upload-url + signed PUT + docs POST) — Tasks 9–10
- ✅ Async processing + fire-and-forget trigger — Tasks 12, 8 (docs POST)
- ✅ Cron safety net — Task 12
- ✅ pdf-parse + mammoth parsers — Task 5
- ✅ tiktoken chunker (1000/200) — Task 6
- ✅ embedBatch via existing embeddings.ts — Task 8
- ✅ match_doc_chunks SQL + RPC types — Tasks 1, 2
- ✅ claim_next_queued_doc atomic claim — Tasks 1, 12
- ✅ Idempotency guard (delete before insert) — Task 8 (process.ts)
- ✅ Plan limit enforcement (assertWithinLimit called at upload-url AND docs POST) — Tasks 7, 9, 10
- ✅ UsageMeter (hidden for Infinity, red at ≥90%) — Task 14
- ✅ DropZone (drag-and-drop, 3-wide semaphore, client validation) — Task 15
- ✅ DocsTable (status badges, retry/download/delete, polling) — Task 16
- ✅ Debug retrieval page (/kb/search, owner/admin only) — Task 17
- ✅ Storage RLS policies — Task 1
- ✅ CRON_SECRET auth on process + cron routes — Task 12
- ✅ vercel.json cron schedule — Task 12
- ✅ .env.example — Task 12
- ✅ Manual retry flow — Tasks 11, 16
- ✅ Delete flow (DB cascade + Storage cleanup) — Task 10
- ✅ Error message expander on failed rows — Task 16
- ✅ Download signed URL (60s TTL) — Task 11

**No placeholders found. All code is complete.**
