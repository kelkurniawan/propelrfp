-- NOTE: This migration must be applied manually in the Supabase SQL Editor.
-- Week 4: store raw RFP text on the project for section re-detection
alter table rfp_projects add column if not exists rfp_raw_text text;
