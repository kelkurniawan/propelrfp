# Week 3 — Knowledge Base Module: Design Spec

**Date:** 2026-05-01
**Status:** Approved (architecture sections)
**Branch (planned):** `feature/knowledge-base`
**Depends on:** Week 1 foundation (`knowledge_docs`, `doc_chunks` tables, `embedText/embedBatch` helpers, pgvector index, IVFFlat index, Vercel + Supabase wired) + Week 2 (`requireRole`, `withErrorHandling`, settings UX patterns).

---

## 1. Goal

Ship the end-to-end Knowledge Base pipeline. After this week, an org owner can drag a folder of past winning proposals into the KB page, watch each file parse → chunk → embed → land in pgvector, and (via a debug retrieval page) verify a sample query returns relevant chunks. Week 4 plugs this same retrieval into the RFP draft flow.

---

## 2. Scope

**In scope:**
- Multi-file drag-and-drop upload (PDF + DOCX, ≤ 25 MB each, 3 concurrent).
- Direct-to-Storage upload via signed URL (no double-hop through Vercel).
- Async processing: immediate fire-and-forget trigger + Vercel Cron safety net.
- Background pipeline: pdf-parse / mammoth → tiktoken chunking (1000 tok / 200 overlap) → OpenAI `text-embedding-3-small` → `doc_chunks` insert.
- Manual retry on `failed` docs.
- Hard delete (DB cascade + Storage cleanup), owner/admin only.
- Plan-limit enforcement (Starter 500 MB, hard block) with visible usage meter.
- KB list page with status badges + 2s adaptive polling.
- Debug retrieval page (`/dashboard/kb/search`) — owner/admin only — for end-to-end pipeline validation.

**Out of scope (deferred):**
- Re-process button on existing successful docs.
- "View extracted text / chunks" preview.
- Batch select / batch delete.
- File rename.
- Auto-retry on failure (manual only — see decision §9.2).
- Per-doc tags / collections.
- KB sharing across orgs.

---

## 3. Architecture

Three runtime layers:

### 3.1 Upload (synchronous, fast — returns within ~1s)

Client `<DropZone>` validates a dropped file (size, type) and runs three calls in sequence per file:

1. `POST /api/kb/upload-url` — server validates the request, runs the plan-limit pre-flight check, generates a fresh `doc_id`, asks Supabase for a signed upload URL, returns `{ docId, uploadUrl, path }`.
2. `PUT <signedUrl>` — direct browser → Supabase Storage upload. Path: `documents/<org_id>/<doc_id>.<ext>`.
3. `POST /api/kb/docs` — server inserts the `knowledge_docs` row with `status: 'queued'`, fires `POST /api/kb/process` *without* awaiting it (fire-and-forget), and returns `{ doc }`.

Per-file uploads run in parallel with a 3-wide semaphore so dragging in 20 files doesn't slam Storage or Vercel.

### 3.2 Processor (`/api/kb/process`, single unit of work, idempotent)

One endpoint, one doc per call:

1. **Claim a doc atomically** via `supabase.rpc("claim_next_queued_doc")` — a SQL function (defined in migration 003, see §4.1) that does:
   ```sql
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
   ```
   Returns the claimed row or zero rows if nothing queued. The `for update skip locked` makes parallel workers safe — two cron ticks racing won't both grab the same doc.
2. If no doc claimed, return `200 { processed: null }` and exit.
3. Download file from Storage (service-role client).
4. Parse: `parseFile(buffer, file_type)` — pdf-parse or mammoth, dispatched on `file_type`.
5. Chunk: `chunkText(text)` using tiktoken `cl100k_base`, strict 1000-token windows with 200-token overlap.
6. Embed: `embedBatch(chunks.map(c => c.content))` — OpenAI batched in 100s.
7. **Idempotency guard:** `delete from doc_chunks where doc_id=?` before insert. Makes the function safe to re-run (e.g., if step 8 fails after some chunks were inserted, or if cron resumes a `processing` row that timed out).
8. Insert: `doc_chunks` rows with `org_id` denormalized for the cosine search.
9. `update knowledge_docs set status='ready'`.

Any throw at steps 3-9 → outer try/catch → `update knowledge_docs set status='failed', error_message=err.message`. No retry. Returns `200 { processed: docId }` either way.

### 3.3 Cron safety net (`/api/cron/process-kb`, runs every minute)

Vercel Cron config in `vercel.json`. Verifies `Authorization: Bearer ${CRON_SECRET}` (Vercel injects this header for cron-triggered requests). Loops up to 5 times: each iteration POSTs `/api/kb/process` and breaks early when no queued docs remain. Capped at 5 to stay under the 60s function limit.

The cron is purely a safety net for missed `process` triggers (network blip on the upload route's fire-and-forget). The expected steady-state is that the immediate trigger handles everything within seconds and the cron processes zero docs.

---

## 4. Database & Storage

### 4.1 New migration: `supabase/migrations/003_kb_storage.sql`

```sql
-- Helper: cosine-similarity search wrapper for doc_chunks.
-- security invoker keeps RLS active. The redundant org_id filter is
-- belt-and-suspenders — it'll be a no-op given the existing RLS policy.
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
```

**`claim_next_queued_doc` SQL function** — atomic queued→processing transition:

```sql
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

`security definer` + `service_role`-only execute keeps it safely callable by the processor route (which uses the service-role client) without exposing it via RLS to authenticated users.

No new tables — `knowledge_docs` and `doc_chunks` from Week 1 already cover everything.

### 4.2 Storage bucket: `documents`

Created manually via Supabase Dashboard (buckets are not standard migrations). Private bucket. Path scheme: `documents/<org_id>/<doc_id>.<ext>`.

Storage RLS policies, applied via SQL:

```sql
-- Read: org members
create policy "kb_storage_org_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

-- Insert: org members (uploads)
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

The first folder of the path is the `org_id` so RLS can extract it via `storage.foldername(name)[1]`.

---

## 5. File inventory

### 5.1 Schemas

- **`src/lib/schemas/kb.ts`**
  - `kbUploadSchema` — `{ name: string max 255, size: number > 0, type: enum["pdf","docx"] }`. Used by `upload-url` and `docs` POST.
  - `kbSearchSchema` — `{ query: string min 1 max 1000 }`. Used by debug search route.

### 5.2 KB library (`src/lib/kb/`)

- **`parse.ts`**
  - `parsePdf(buffer: Buffer): Promise<string>` — wraps `pdf-parse`. Strips form-feed characters.
  - `parseDocx(buffer: Buffer): Promise<string>` — wraps `mammoth.extractRawText`.
  - `parseFile(buffer: Buffer, type: "pdf" | "docx"): Promise<string>` — dispatcher.
  - Throws `Error` with descriptive message on parse failure (e.g., "PDF is password-protected").
- **`chunk.ts`**
  - `chunkText(text: string, opts?: { tokensPerChunk?: number; overlap?: number }): { content: string; token_count: number; chunk_index: number }[]`.
  - Defaults: `tokensPerChunk = 1000`, `overlap = 200`.
  - Uses tiktoken `cl100k_base` encoder. Strict token windows (no sentence-boundary heuristic in MVP — deferrable to a later sprint if quality is poor).
  - Skips chunks shorter than 50 tokens (avoids embedding stub fragments at the tail).
- **`storage.ts`**
  - `signedUploadUrl(orgId: string, docId: string, ext: "pdf" | "docx"): Promise<{ uploadUrl: string; path: string }>`.
  - `downloadFile(path: string): Promise<Buffer>` — service-role client, bypasses RLS for the cron processor.
  - `deleteFile(path: string): Promise<void>`.
- **`limits.ts`**
  - `assertWithinLimit(supabase, orgId, incomingBytes): Promise<{ used: number; limitBytes: number }>` — see §6.
  - `formatMb(bytes: number): string` — for error messages.
- **`process.ts`**
  - `processDoc(docId: string): Promise<void>` — orchestrator. Imports parse/chunk/storage; calls `embedBatch` from existing `src/lib/ai/embeddings.ts`. Throws on any step failure (caller marks `failed`).

### 5.3 API routes

| Route | Methods | Auth |
|---|---|---|
| `src/app/api/kb/upload-url/route.ts` | POST | requireRole owner/admin/member |
| `src/app/api/kb/docs/route.ts` | POST, GET, DELETE | requireRole owner/admin/member (POST/GET); owner/admin (DELETE) |
| `src/app/api/kb/docs/[id]/route.ts` | POST `{action:"retry"}` | requireRole owner/admin/member |
| `src/app/api/kb/docs/[id]/download/route.ts` | GET | requireRole owner/admin/member; returns 404 if doc not in caller's org |
| `src/app/api/kb/process/route.ts` | POST | `Authorization: Bearer ${CRON_SECRET}` (the upload route's fire-and-forget passes the same header) |
| `src/app/api/kb/search/route.ts` | POST | requireRole owner/admin |
| `src/app/api/cron/process-kb/route.ts` | GET | `Authorization: Bearer ${CRON_SECRET}` |

**`/api/kb/docs/[id]/download` GET** — issues a short-lived (60s) signed download URL via `supabase.storage.from('documents').createSignedUrl(path, 60)`. Returns `{ url }`. The route guards via `requireRole` *and* re-checks that the doc belongs to the caller's org (defense in depth). The DocsTable's Download button opens `window.location.href = url`.

**`/api/kb/process` auth** — single mechanism: `Authorization: Bearer ${CRON_SECRET}`. The upload route's fire-and-forget reads `process.env.CRON_SECRET` server-side and passes the same header. This avoids the messy "same-origin" detection problem (Vercel routes within one deployment share host but the request still arrives like an external HTTP call).

### 5.4 UI pages

- **`src/app/(dashboard)/kb/page.tsx`** — server component. Fetches `knowledge_docs` rows + computes `SUM(file_size_bytes)`. Renders header, `<UsageMeter>`, `<DropZone>`, `<DocsTable>`. Top-right link to `/dashboard/kb/search` (visible owner/admin only).
- **`src/app/(dashboard)/kb/UsageMeter.tsx`** — server-rendered. Plain HTML/CSS bar with `<used> MB / <limit> MB` label. Tints red at ≥90%. Hides bar entirely for `Infinity` limit (Enterprise).
- **`src/app/(dashboard)/kb/DropZone.tsx`** — client. Drag-and-drop or click-to-pick. Validates size + type client-side. For each file: parallel via 3-wide semaphore → `upload-url` → PUT to Storage → `docs` POST → optimistically prepends row to table. Toast on per-file success/failure.
- **`src/app/(dashboard)/kb/DocsTable.tsx`** — client. Renders rows: name, size (MB), status badge, created-at. Status colors: queued=gray, processing=blue, ready=green, failed=red. Failed rows have an expander showing `error_message`. Per-row actions: Retry (failed only), Download (ready only — opens signed download URL), Delete (owner/admin). Polls `GET /api/kb/docs` every 2s while any row is queued/processing; stops when stable.
- **`src/app/(dashboard)/kb/search/page.tsx`** — server. Owner/admin gate (else `redirect("/dashboard/kb")`). Renders header + `<SearchForm>`.
- **`src/app/(dashboard)/kb/search/SearchForm.tsx`** — client. Textarea + submit → `POST /api/kb/search`. Renders top 5 hits as cards: similarity bar (0–100%), source doc name + chunk index, content excerpt (first 500 chars + ellipsis).

### 5.5 Config

- **`vercel.json`** — adds:
  ```json
  { "crons": [{ "path": "/api/cron/process-kb", "schedule": "* * * * *" }] }
  ```
- **`.env.example`** — adds `CRON_SECRET=changeme`.

---

## 6. Plan-limit enforcement

Single source of truth: `src/lib/kb/limits.ts → assertWithinLimit()`.

```ts
export async function assertWithinLimit(
  supabase: SupabaseClient,
  orgId: string,
  incomingBytes: number,
) {
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

Called twice for race protection:
1. **`/api/kb/upload-url` POST** — pre-flight, before issuing signed URL.
2. **`/api/kb/docs` POST** — re-check before insert (two parallel uploads could both pass the first check; the second insert fails fast).

`<UsageMeter>` reads the same data via the server-component fetch on `kb/page.tsx`. No separate API endpoint.

---

## 7. Data flow

### 7.1 Successful upload

```
Browser                       Next.js                         Supabase
───────                       ───────                         ────────
DropZone receives file
client-side validate
  ↓
POST /api/kb/upload-url ────► requireRole + assertWithinLimit
                              docId = uuid()
                              ext = "pdf"|"docx"
                              storage.from('documents')
                                .createSignedUploadUrl(path) ──► signed URL
                            ◄── { docId, uploadUrl, path }
PUT file → uploadUrl ──────────────────────────────────────► Storage write
                                                              (org/doc.ext)
POST /api/kb/docs ──────────► requireRole + assertWithinLimit (recheck)
{ docId, name, size, type }   insert knowledge_docs (queued)
                              fire-and-forget POST /api/kb/process
                                with Bearer ${CRON_SECRET}
                            ◄── { doc }
                              optimistic row "queued"

(meanwhile, /api/kb/process):
                              rpc('claim_next_queued_doc') ─────► atomic UPDATE
                                                                  status='processing'
                              storage.from('documents').download(path)
                              parseFile(buffer, type) → text
                              chunkText(text) → segments[]
                              embedBatch(segments.map(s=>s.content))
                              DELETE doc_chunks WHERE doc_id=?  (idempotency)
                              INSERT INTO doc_chunks (...)
                              UPDATE status='ready'

DocsTable polls every 2s:
GET /api/kb/docs ───────────► returns rows
  ↓                           ◄── [...]
status flips to "ready"
polling halts
```

### 7.2 Failure path

Any throw inside `processDoc` → caller sets `status='failed'`, `error_message=err.message`. Returns 200. UI row turns red, expander reveals message, Retry button visible.

### 7.3 Retry

```
User clicks Retry on a failed row
POST /api/kb/docs/<id> { action: "retry" }
  → requireRole owner/admin/member
  → UPDATE status='queued', error_message=null WHERE id=? AND status='failed'
  → fire-and-forget POST /api/kb/process (Bearer CRON_SECRET)
  → return ok(null)
DocsTable polling resumes (now sees a queued row)
```

### 7.4 Delete

```
User clicks Delete (confirms in dialog)
DELETE /api/kb/docs?id=<id>
  → requireRole owner/admin
  → SELECT path FROM knowledge_docs WHERE id=?
  → DELETE FROM knowledge_docs WHERE id=?  (cascades doc_chunks via FK)
  → storage.from('documents').remove([path])
  → return ok(null)
UI: optimistic row removal + toast
```

### 7.5 Cron tick

```
Vercel Cron (every minute):
GET /api/cron/process-kb (Bearer CRON_SECRET injected by Vercel)
  let count = 0
  for i in 0..4:
    res = await fetch(/api/kb/process, { method: POST, Bearer CRON_SECRET })
    body = await res.json()
    if body.processed === null: break        // queue empty
    count += 1
  return ok({ processed: count })
```

---

## 8. Error handling

| Failure | Where caught | What user sees |
|---|---|---|
| File type not in `["pdf","docx"]` | DropZone client-side | Toast: "Only PDF and DOCX files are supported." File never uploaded. |
| File size > 25 MB | DropZone client-side | Toast: "File exceeds 25 MB limit." |
| Plan limit exceeded | `/api/kb/upload-url` (preflight) or `/api/kb/docs` (recheck) | Toast with message from `ApiError`. Row not added. |
| Signed-URL upload to Storage fails | DropZone client | Toast: "Upload failed: {message}." Row not added. |
| pdf-parse error (corrupt / encrypted) | `processDoc` → caller | Row → `failed`, `error_message: "Could not parse PDF: {original message}"`. Retry button. |
| OpenAI API rate limit / down | `processDoc` → `embedBatch` throws | Row → `failed`. Retry button. |
| Supabase insert fails (rare) | `processDoc` → caller | Row → `failed`. Retry. |
| Cron tick takes > 60s | Vercel kills function | Row remains `status='processing'`. **Note:** the next worker tick will *not* pick it up — `claim_next_queued_doc` only claims `status='queued'` rows. A stuck `processing` row is dead until either a manual reset or the timeout-recovery logic in §11 lands. For MVP, this is acceptable: 1000-token chunks + OpenAI batched embeddings cleanly fit inside 60s for all expected file sizes (≤ 25 MB). |

---

## 9. Decisions log

### 9.1 Async + immediate trigger + cron safety net (vs. synchronous or cron-only)
**Chosen.** Keeps upload UX instant and processing latency in the seconds, not minutes. Cron handles the rare case where the immediate trigger doesn't fire (network blip).

### 9.2 Manual retry only (vs. auto-retry N times)
**Chosen.** Most processing failures are real (corrupt PDF, password-protected, file too long for context window). Auto-retry without changes wastes API budget. Manual retry gives the user agency and surfaces the actual error. Adds zero state complexity.

### 9.3 Hard-block on plan limit (vs. soft warn or defer to Week 7)
**Chosen.** The check is one-line `SUM`. Honest UX from day one. With Stripe not wired until Week 7, you'll need to manually update `subscriptions.plan` in Supabase Dashboard if you want to test bigger files locally.

### 9.4 Multi-file drag-and-drop, 3 concurrent (vs. one-at-a-time)
**Chosen.** First-time onboarding is "seed the KB with all your past wins." Forcing one-at-a-time turns that into a chore. 3-wide semaphore avoids slamming Supabase Storage and keeps the UI responsive.

### 9.5 Debug retrieval page in Week 3 (vs. defer to Week 4)
**Chosen.** Pipeline has 7 moving parts (Storage → pdf-parse → tiktoken → OpenAI → pgvector → IVFFlat → RLS). Validating end-to-end in isolation before Week 4's RFP flow integrates it is much cheaper than debugging mid-Week 4.

### 9.6 Strict token-window chunking (vs. sentence-aware)
**Chosen for MVP.** Simpler, deterministic. Sentence-aware adds complexity for marginal quality gain at this stage. If retrieval quality is visibly poor in Week 4, revisit.

### 9.7 Hard delete (vs. soft delete with `deleted_at`)
**Chosen.** No compliance / audit requirement. FK cascade already handles `doc_chunks`. Storage cleanup is one extra call. Soft delete would complicate every RLS query and the `match_doc_chunks` function for no MVP benefit.

### 9.8 Direct-to-Storage upload via signed URL (vs. proxy through Vercel)
**Chosen.** Avoids the Vercel 4.5 MB body-size limit and keeps the upload route fast. One extra round-trip for the signed URL is worth it.

---

## 10. Smoke-test matrix (manual — automated tests deferred per Week 2 decision)

| # | Scenario | Expected |
|---|---|---|
| 1 | Drag a 2 MB PDF | Row appears `queued` → `processing` → `ready` within ~10s. Chunks visible in `doc_chunks` (Supabase Dashboard). |
| 2 | Drag a 1 MB DOCX | Same as #1. |
| 3 | Drag 5 PDFs at once | All 5 rows appear immediately. Up to 3 process concurrently. All reach `ready`. |
| 4 | Drag a 30 MB PDF | Client-side rejection toast. No row created. |
| 5 | Drag a `.txt` file | Client-side rejection toast. |
| 6 | Drag a password-protected PDF | Row reaches `failed` with descriptive error. Retry button visible. Click Retry → returns to `failed` (won't auto-fix). |
| 7 | Upload while at 499 MB used (Starter plan) of a 2 MB file | `limit_reached` toast. No row added. |
| 8 | Upload while at 1 MB used of a 2 MB file | Succeeds. Meter shows 3 MB / 500 MB. |
| 9 | Owner deletes a `ready` doc | Row disappears. `doc_chunks` rows for that doc gone. Storage file gone. |
| 10 | Member tries to delete | Delete button hidden. Direct DELETE call returns 403. |
| 11 | Member opens `/dashboard/kb/search` | Redirected to `/dashboard/kb`. |
| 12 | Owner runs search "company case studies" | Top 5 chunks ranked by similarity, with source doc names. |
| 13 | Stop the dev server mid-processing | Cron picks up the `processing` row on next minute, resumes via the `delete from doc_chunks where doc_id=?` idempotency guard. |
| 14 | Wrong CRON_SECRET on `/api/cron/process-kb` | 401. |
| 15 | Direct call to `/api/kb/process` from another origin without secret | 401 (origin check fails). |
| 16 | Two parallel `upload-url` calls that together exceed limit | Second `docs` POST fails with `limit_reached`. Storage file orphaned (acceptable for MVP — cleanup script deferred). |
| 17 | Member of org A queries `match_doc_chunks` | Only sees chunks from org A. |
| 18 | Owner refreshes KB page mid-processing | Polling resumes, no UI flicker. |
| 19 | Drag a `.PDF` (uppercase ext) | Accepted (lowercased server-side). |
| 20 | Drag the same file twice | Both succeed — they get different `doc_id`s. (Dedup deferred — see §11.) |

---

## 11. Open issues / deferred items

| Item | Reason / where to revisit |
|---|---|
| Filename-based dedup on upload | Hash-based dedup is more correct (same content, different name should still dedup). Defer until users complain. |
| Orphaned Storage files when `docs` POST fails after Storage write | Add a cleanup cron later (`select files where no row in knowledge_docs`). |
| Sentence-aware chunking | Revisit if Week 4 retrieval quality is visibly poor. |
| Auto-retry on transient errors | Revisit if logs show frequent transient OpenAI 429s. |
| Re-process button on `ready` docs (e.g. after chunking algorithm change) | Trivial to add when needed. |
| Per-doc tags / collections | Defer to a later sprint — only matters at scale. |
| Automated tests (Playwright/Vitest) | Per Week 2 decision: deferred to a dedicated test sprint. |

---

## 12. New environment variables

| Variable | Used by | Notes |
|---|---|---|
| `CRON_SECRET` | `/api/cron/process-kb`, `/api/kb/process` | Set in Vercel project settings. Local: any non-empty string in `.env.local`. |

---

## 13. Manual one-time setup (documented in plan, not automated)

1. **Supabase Dashboard → Storage → create bucket `documents`** (private). Apply the three RLS policies from §4.2 via the SQL editor.
2. **Vercel Dashboard → Project → Environment Variables → add `CRON_SECRET`** (any random string).
3. **`.env.local`** — add the same `CRON_SECRET` so the upload route's fire-and-forget can authenticate against `/api/kb/process` locally.

---

*Next: implementation plan at `docs/superpowers/plans/2026-05-01-week3-knowledge-base.md`.*
