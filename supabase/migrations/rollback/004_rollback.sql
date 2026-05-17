-- Rollback for 004_rfp_raw_text.sql
-- Removes rfp_raw_text column from rfp_projects

ALTER TABLE rfp_projects DROP COLUMN IF EXISTS rfp_raw_text;
