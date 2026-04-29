-- Enable pgvector extension
create extension if not exists vector;

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

-- Org members can read their own org
create policy "org_members_read" on organizations
  for select using (
    id = (select org_id from users where id = auth.uid())
  );

-- Org owner can update their org
create policy "org_owner_update" on organizations
  for update using (
    id = (select org_id from users where id = auth.uid()
      and role = 'owner')
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

alter table users enable row level security;

create policy "org_isolation" on users
  using (org_id = (select org_id from users where id = auth.uid()));

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

alter table subscriptions enable row level security;

create policy "org_isolation" on subscriptions
  using (org_id = (select org_id from users where id = auth.uid()));

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

alter table knowledge_docs enable row level security;

create policy "org_isolation" on knowledge_docs
  using (org_id = (select org_id from users where id = auth.uid()));

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

alter table doc_chunks enable row level security;

create policy "org_isolation" on doc_chunks
  using (org_id = (select org_id from users where id = auth.uid()));

-- IVFFlat index for approximate nearest-neighbor search
create index doc_chunks_embedding_idx
  on doc_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

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

alter table rfp_projects enable row level security;

create policy "org_isolation" on rfp_projects
  using (org_id = (select org_id from users where id = auth.uid()));

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

alter table rfp_sections enable row level security;

create policy "org_isolation" on rfp_sections
  using (
    project_id in (
      select id from rfp_projects
      where org_id = (select org_id from users where id = auth.uid())
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

alter table gen_logs enable row level security;

create policy "org_isolation" on gen_logs
  using (org_id = (select org_id from users where id = auth.uid()));

-- Prevent updates and deletes on gen_logs (append-only)
create policy "no_update" on gen_logs for update using (false);
create policy "no_delete" on gen_logs for delete using (false);

-- ─────────────────────────────────────────────
-- UPDATED_AT TRIGGER
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
