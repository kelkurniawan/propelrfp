-- Rollback for 006_free_plan.sql
-- Reverts plan constraint to exclude 'free' and changes default back to 'starter'

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN ('starter', 'growth', 'enterprise'));
ALTER TABLE subscriptions ALTER COLUMN plan SET DEFAULT 'starter';
