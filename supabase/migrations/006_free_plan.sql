-- supabase/migrations/006_free_plan.sql

-- Widen the plan check constraint to include 'free'
ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_plan_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN ('free', 'starter', 'growth', 'enterprise'));

-- New orgs default to free plan
ALTER TABLE subscriptions ALTER COLUMN plan SET DEFAULT 'free';
