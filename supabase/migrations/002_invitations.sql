-- ─────────────────────────────────────────────
-- INVITATIONS (email-link team invites)
-- ─────────────────────────────────────────────
create table invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  email       text not null,
  role        text not null default 'member'
                check (role in ('admin', 'member')),
  token       text not null unique default encode(gen_random_bytes(24), 'base64url'),
  invited_by  uuid not null references users(id) on delete cascade,
  status      text not null default 'pending'
                check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  unique (org_id, email)
);

create index invitations_org_id_idx on invitations(org_id);
create index invitations_token_idx on invitations(token);
create index invitations_email_status_idx on invitations(email, status);

alter table invitations enable row level security;

create policy "invitations_org_read" on invitations
  for select using (org_id = current_org_id());

create policy "invitations_admin_insert" on invitations
  for insert with check (
    org_id = current_org_id()
    and exists (
      select 1 from users
      where id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "invitations_admin_update" on invitations
  for update using (
    org_id = current_org_id()
    and exists (
      select 1 from users
      where id = auth.uid() and role in ('owner', 'admin')
    )
  );

