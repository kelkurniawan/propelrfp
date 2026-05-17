-- Rollback for 005_atomic_proposal_increment.sql
-- Drops the increment_proposals_if_under_limit function

DROP FUNCTION IF EXISTS public.increment_proposals_if_under_limit(uuid, int);
