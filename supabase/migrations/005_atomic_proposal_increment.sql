-- Atomically increments proposals_used only if under the plan limit.
-- Returns the new count, or -1 if the limit was already reached.
create or replace function increment_proposals_if_under_limit(
  p_org_id uuid,
  p_limit int
) returns int language plpgsql security definer as $$
declare
  v_new_count int;
begin
  update subscriptions
     set proposals_used = proposals_used + 1
   where org_id = p_org_id
     and proposals_used < p_limit
  returning proposals_used into v_new_count;

  if v_new_count is null then
    return -1;
  end if;

  return v_new_count;
end;
$$;
