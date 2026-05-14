/*
 * Migration: 003_kb_storage.sql
 * Purpose: Add Knowledge Base document chunking and vector search functions,
 *          plus Storage bucket RLS policies.
 * Date: 2026-05-01
 *
 * MANUAL STEPS REQUIRED:
 * ======================
 * This migration contains TWO parts:
 *
 * PART A: SQL Functions (apply via Supabase SQL Editor)
 * ------
 * 1. Copy the SQL below (all sections marked "PART A")
 * 2. Open Supabase Dashboard > SQL Editor
 * 3. Paste and execute (should complete with no errors)
 * 4. Expected output: Two functions created:
 *    - match_doc_chunks(query_embedding, match_count) → table of similar chunks
 *    - claim_next_queued_doc() → claims the next document for processing
 *
 * PART B: Storage Bucket Setup (Supabase Dashboard, one time only)
 * ------
 * 1. Go to Supabase Dashboard > Storage
 * 2. Create a new bucket named "documents"
 * 3. Set it to PRIVATE (not public)
 * 4. Note: RLS policies for this bucket are applied in PART C below
 *
 * PART C: Storage RLS Policies (apply via Supabase SQL Editor after bucket exists)
 * ------
 * 1. Ensure the "documents" bucket exists (PART B, step 3 above)
 * 2. Copy the SQL below (all sections marked "PART C")
 * 3. Open Supabase Dashboard > SQL Editor
 * 4. Paste and execute (should complete with no errors)
 * 5. Expected output: Three storage policies created:
 *    - kb_storage_org_read: org members can read their org's files
 *    - kb_storage_org_insert: org members can upload files
 *    - kb_storage_admin_delete: only owner/admin can delete files
 *
 * Safety Notes:
 * - match_doc_chunks uses "security invoker" so RLS is enforced via current_org_id()
 * - claim_next_queued_doc uses "security definer" and is restricted to service_role only
 * - All storage policies check (storage.foldername(name))[1] = current_org_id()::text
 *   to ensure multi-tenant isolation
 * - FOR UPDATE SKIP LOCKED prevents concurrent processing of the same document
 */

-- ============================================================================
-- PART A: SQL FUNCTIONS (execute in Supabase SQL Editor)
-- ============================================================================

-- Vector similarity search over doc_chunks using pgvector cosine distance.
-- Returns chunks from the current org, ordered by similarity to query_embedding.
-- Uses "security invoker" so RLS filters apply based on current_org_id().
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

-- Atomically claim the next queued document for processing.
-- Uses FOR UPDATE SKIP LOCKED to prevent concurrent processing of the same doc.
-- Only service_role can execute (prevents direct user calls).
-- Returns: (id uuid, file_type text, org_id uuid) of the claimed document.
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

-- Restrict function execution to service_role only.
revoke all on function claim_next_queued_doc() from public;
grant execute on function claim_next_queued_doc() to service_role;

-- ============================================================================
-- PART C: STORAGE RLS POLICIES (execute after "documents" bucket is created)
-- ============================================================================

-- Read policy: org members can read files in their org's folder.
-- File path structure: {org_id}/{filename}
create policy "kb_storage_org_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

-- Insert policy: org members can upload files to their org's folder.
create policy "kb_storage_org_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

-- Delete policy: only owner/admin can delete files in their org's folder.
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
