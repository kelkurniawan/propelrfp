-- Dev seed: creates a test org, user, and subscription
-- Run after applying migrations in local Supabase dev environment

-- Test organization
insert into organizations (id, name, industry, size)
values (
  '00000000-0000-0000-0000-000000000001',
  'Acme IT Solutions',
  'IT Consulting',
  '25 employees'
);

-- Test subscription (trialing)
insert into subscriptions (org_id, status, plan)
values (
  '00000000-0000-0000-0000-000000000001',
  'trialing',
  'starter'
);
