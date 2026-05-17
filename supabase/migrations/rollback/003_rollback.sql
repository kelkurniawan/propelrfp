-- Rollback for 003_kb_storage.sql
-- WARNING: This destroys all Knowledge Base data. Only run in an emergency.

DROP FUNCTION IF EXISTS public.match_doc_chunks(vector, int);
DROP FUNCTION IF EXISTS public.claim_next_queued_doc();
DROP TABLE IF EXISTS doc_chunks CASCADE;
DROP TABLE IF EXISTS knowledge_docs CASCADE;
