-- ─────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────
create extension if not exists vector;

-- ─────────────────────────────────────────────
-- Helper: auth.uid() → org_id (cached per request)
-- Used inside RLS policies. STABLE so Postgres can cache the result
-- within a single statement, avoiding repeated subqueries on hot paths
-- like the doc_chunks vector search.
-- ─────────────────────────────────────────────
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.users where id = auth.uid()
$$;

-- ─────────────────────────────────────────────
-- ORGANIZATIONS
-- ─────────────────────────────────────────────
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  industry    text,
  website     text,
  size        text,
  created_at  timestamptz not null default now()
);

alter table organizations enable row level security;

-- Any authenticated user can create an org (signup flow)
create policy "auth_users_insert_org" on organizations
  for insert with check (auth.uid() is not null);

-- Members can read their own org
create policy "org_members_read" on organizations
  for select using (id = current_org_id());

-- Org owner can update their org
create policy "org_owner_update" on organizations
  for update using (
    id = current_org_id()
    and exists (select 1 from users where id = auth.uid() and role = 'owner')
  );

-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────
create table users (
  id          uuid primary key references auth.users(id) on delete cascade,
  org_id      uuid not null references organizations(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'member'
                check (role in ('owner', 'admin', 'member')),
  created_at  timestamptz not null default now()
);

create index users_org_id_idx on users(org_id);
create index users_email_idx on users(email);

alter table users enable row level security;

-- A user can insert exactly one row for themselves (signup flow)
create policy "user_self_insert" on users
  for insert with check (id = auth.uid());

-- Users can read everyone in their org
create policy "users_org_read" on users
  for select using (org_id = current_org_id());

-- Users can update their own profile; owner/admin can update any user in org
create policy "users_self_or_admin_update" on users
  for update using (
    id = auth.uid()
    or (
      org_id = current_org_id()
      and exists (
        select 1 from users me
        where me.id = auth.uid() and me.role in ('owner', 'admin')
      )
    )
  );

-- Owner can delete users in their org (except themselves)
create policy "owner_delete_users" on users
  for delete using (
    org_id = current_org_id()
    and id != auth.uid()
    and exists (select 1 from users where id = auth.uid() and role = 'owner')
  );

-- ─────────────────────────────────────────────
-- SUBSCRIPTIONS
-- ─────────────────────────────────────────────
create table subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null unique references organizations(id) on delete cascade,
  stripe_customer_id      text,
  stripe_subscription_id  text unique,
  status                  text not null default 'trialing'
                            check (status in ('active', 'past_due', 'canceled', 'trialing')),
  plan                    text not null default 'starter'
                            check (plan in ('starter', 'growth', 'enterprise')),
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  proposals_used          int not null default 0,
  created_at              timestamptz not null default now()
);

create index subscriptions_stripe_customer_id_idx on subscriptions(stripe_customer_id);

alter table subscriptions enable row level security;

create policy "subscription_org_read" on subscriptions
  for select using (org_id = current_org_id());

-- Inserts and updates restricted to service role (Stripe webhook handler).
-- No INSERT/UPDATE policy = denied to all non-service users by default.

-- ─────────────────────────────────────────────
-- KNOWLEDGE DOCS
-- ─────────────────────────────────────────────
create table knowledge_docs (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  name             text not null,
  file_url         text not null,
  file_type        text not null check (file_type in ('pdf', 'docx')),
  file_size_bytes  bigint not null default 0,
  status           text not null default 'queued'
                     check (status in ('queued', 'processing', 'ready', 'failed')),
  error_message    text,
  created_at       timestamptz not null default now()
);

create index knowledge_docs_org_id_idx on knowledge_docs(org_id);
create index knowledge_docs_status_idx on knowledge_docs(status) where status in ('queued', 'processing');

alter table knowledge_docs enable row level security;

create policy "kb_org_isolation" on knowledge_docs
  for all using (org_id = current_org_id())
  with check (org_id = current_org_id());

-- ─────────────────────────────────────────────
-- DOC CHUNKS (pgvector)
-- ─────────────────────────────────────────────
create table doc_chunks (
  id           uuid primary key default gen_random_uuid(),
  doc_id       uuid not null references knowledge_docs(id) on delete cascade,
  org_id       uuid not null,  -- denormalized for single-query vector search
  content      text not null,
  token_count  int not null,
  chunk_index  int not null,
  embedding    vector(1536),
  created_at   timestamptz not null default now()
);

create index doc_chunks_org_id_idx on doc_chunks(org_id);
create index doc_chunks_doc_id_idx on doc_chunks(doc_id);
-- IVFFlat index for approximate nearest-neighbor search.
-- lists=100 is appropriate for up to ~100k chunks (sqrt(N) heuristic).
create index doc_chunks_embedding_idx
  on doc_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table doc_chunks enable row level security;

create policy "chunks_org_isolation" on doc_chunks
  for all using (org_id = current_org_id())
  with check (org_id = current_org_id());

-- ─────────────────────────────────────────────
-- RFP PROJECTS
-- ─────────────────────────────────────────────
create table rfp_projects (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  title        text not null,
  client_name  text,
  deadline     date,
  notes        text,
  status       text not null default 'draft'
                 check (status in ('draft', 'in_review', 'submitted', 'won', 'lost')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index rfp_projects_org_id_idx on rfp_projects(org_id);
create index rfp_projects_org_status_deadline_idx on rfp_projects(org_id, status, deadline);

alter table rfp_projects enable row level security;

create policy "projects_org_isolation" on rfp_projects
  for all using (org_id = current_org_id())
  with check (org_id = current_org_id());

-- ─────────────────────────────────────────────
-- RFP SECTIONS
-- ─────────────────────────────────────────────
create table rfp_sections (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references rfp_projects(id) on delete cascade,
  title          text not null,
  position       int not null default 0,
  rfp_content    text,
  ai_draft       text,
  final_content  text,
  status         text not null default 'pending'
                   check (status in ('pending', 'generating', 'generated', 'approved')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index rfp_sections_project_position_idx on rfp_sections(project_id, position);

alter table rfp_sections enable row level security;

create policy "sections_org_isolation" on rfp_sections
  for all using (
    project_id in (
      select id from rfp_projects where org_id = current_org_id()
    )
  )
  with check (
    project_id in (
      select id from rfp_projects where org_id = current_org_id()
    )
  );

-- ─────────────────────────────────────────────
-- GEN LOGS (append-only audit table)
-- ─────────────────────────────────────────────
create table gen_logs (
  id                  uuid primary key default gen_random_uuid(),
  section_id          uuid not null references rfp_sections(id) on delete cascade,
  org_id              uuid not null,
  model               text not null,
  tokens_input        int not null default 0,
  tokens_output       int not null default 0,
  tokens_used         int not null default 0,
  custom_instruction  text,
  created_at          timestamptz not null default now()
);

create index gen_logs_org_created_idx on gen_logs(org_id, created_at desc);
create index gen_logs_section_id_idx on gen_logs(section_id);

alter table gen_logs enable row level security;

create policy "gen_logs_org_read" on gen_logs
  for select using (org_id = current_org_id());

create policy "gen_logs_org_insert" on gen_logs
  for insert with check (org_id = current_org_id());

-- Append-only: no UPDATE or DELETE policy means nothing is allowed.

-- ─────────────────────────────────────────────
-- UPDATED_AT TRIGGERS
-- ─────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger rfp_projects_updated_at
  before update on rfp_projects
  for each row execute function update_updated_at();

create trigger rfp_sections_updated_at
  before update on rfp_sections
  for each row execute function update_updated_at();
