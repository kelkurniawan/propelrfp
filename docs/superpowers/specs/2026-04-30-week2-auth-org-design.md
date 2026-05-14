# Week 2 — Auth & Org Module: Design Spec

**Date:** 2026-04-30
**Branch:** `feature/auth-and-org`
**Status:** Approved, ready for implementation plan

## 1. Overview

Week 2 turns the placeholder auth pages from Week 1 into real working flows: users can sign up, create an organization, log in, reset their password, invite teammates, and manage org/member settings. RBAC is enforced at both the database layer (RLS, already in place) and the server layer (role guards in API routes).

Scope is intentionally tight: this sprint covers everything needed for a brand-new user to land on a working dashboard with at least one teammate joined. Knowledge Base, RFP projects, AI generation, and billing are explicitly **not** in scope and ship in Weeks 3–7.

## 2. Decisions Locked During Brainstorming

| # | Decision | Rationale |
|---|---|---|
| 1 | Combined wizard signup: `/signup` (auth) → `/signup/org` (org details) → `/dashboard` | Two routes (not one client state machine) so a half-completed signup is recoverable from the second step. |
| 2 | Email-link invites only via Resend; recipient email must match invite | Standard B2B pattern. Email lock prevents the obvious bypass (click invite for alice, sign up as bob). |
| 3 | Settings split into `/settings/org` and `/settings/members`, full features | Cleanly bounded pages, sets pattern for billing in Week 7. Includes role changes, ownership transfer, delete org. |
| 4 | Email/password + Google OAuth + password reset. No email confirmation gate | Google OAuth is a stated CLAUDE.md requirement. Password reset is B2B table-stakes. Email confirmation deferred to Week 8. |
| 5 | RLS + server-side Zod-validated role guards. UI hides forbidden actions | Defense in depth. RLS is the safety net; server checks give clean errors and audit. |
| 6 | Hybrid implementation: RSC reads + API route mutations + react-hook-form/Zod | Matches existing `src/lib/api.ts` envelope. Schemas reused client + server. |
| 7 | Eviction handling: removed users get signed out by proxy | Cleaner UX than orphan recovery. ~5 lines in `updateSession`. |
| 8 | Manual smoke tests as Week 2 acceptance gate; Playwright/Vitest in a later sprint | Avoids ballooning Week 2 scope. Smoke matrix documented below. |

## 3. New Dependencies

```bash
pnpm add react-hook-form @hookform/resolvers
```

shadcn/ui primitives to install in Week 2:

```
button input label card dialog table dropdown-menu select alert sonner
```

(`sonner` provides toasts. `dialog` powers the delete-org confirm and remove-member confirm.)

## 4. Database Changes

New migration: `supabase/migrations/002_invitations.sql`

```sql
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

-- Public read by token for unauth accept-invite landing.
-- Token is unguessable; accept logic gates DB writes server-side.
create policy "invitations_token_lookup" on invitations
  for select using (true);
```

**Design notes:**

- **Token instead of email-only matching** — random 24-byte base64url. Makes the URL `/invite/<token>` unguessable so unauth users can land on the accept page.
- **`unique (org_id, email)`** — one pending invite per email per org. Resending an invite upserts the row, regenerating `token` and bumping `expires_at`.
- **`role` excludes `owner`** — invites can only grant `admin` or `member`. Ownership transfer is a separate flow.
- **Two SELECT policies** — Supabase RLS is permissive (any allowing policy = allowed). `invitations_org_read` covers logged-in members; `invitations_token_lookup` covers logged-out token landing. The accept API still validates `email == auth.user.email` server-side.
- **Soft delete via `status='revoked'`** — preserves audit trail.
- **`expires_at` defaults to 7 days** — checked at accept time. No background cron job in Week 2; expiry is enforced lazily.

## 5. File Layout

```
src/
  app/
    (auth)/
      login/page.tsx                  ← real form (email/pass + Google)
      signup/page.tsx                 ← step 1 of wizard
      signup/org/page.tsx             ← step 2 of wizard (org details)
      forgot/page.tsx                 ← request reset email
      reset/page.tsx                  ← set new password (from email link)
      invite/[token]/page.tsx         ← accept invite landing
    (dashboard)/
      dashboard/page.tsx              ← redirects to /signup/org if no org_id
      settings/
        layout.tsx                    ← settings tab nav
        org/page.tsx                  ← server component: read org
        org/OrgForm.tsx               ← client form
        org/DangerZone.tsx            ← delete org (owner only)
        members/page.tsx              ← server: list members + pending invites
        members/InviteForm.tsx        ← client form
        members/MembersTable.tsx     ← client: role change, remove, transfer
    api/
      auth/
        signup/route.ts               ← creates auth.users / users / org rows
      org/
        route.ts                      ← PATCH org details, DELETE org
        invitations/route.ts          ← POST invite, DELETE cancel
        invitations/[token]/route.ts  ← POST accept
        members/[userId]/route.ts     ← PATCH role, DELETE remove, POST transfer
  components/
    ui/                               ← shadcn primitives
    auth/                             ← AuthCard, GoogleButton, FormField
  lib/
    schemas/
      auth.ts                         ← signupSchema, loginSchema, resetSchema
      org.ts                          ← orgSchema, inviteSchema, memberRoleSchema
    auth/
      requireRole.ts                  ← server util: throws if user lacks role
    email/
      sendInvite.ts                   ← Resend wrapper
      templates/InviteEmail.tsx       ← React email template
supabase/
  migrations/
    002_invitations.sql               ← new table + RLS + indexes
```

**Layout calls:**

- Wizard split into two routes (`/signup` + `/signup/org`) — orphan recovery via the proxy.
- Settings under `(dashboard)` so it inherits the dashboard auth gate.
- Invites use a token URL — same UX as Linear/Notion/Vercel.
- `react-hook-form` schemas live in `src/lib/schemas/` and are imported by both the client form and the server route.

## 6. Data Flows

### 6.1 Signup wizard

**Step 1 — `/signup`** (client form: full name, email, password)

```
User submits
  → POST /api/auth/signup  body: { action: 'create-account', ... }
      ├─ Zod validates body
      ├─ supabase.auth.signUp({ email, password, options: { data: { full_name } } })
      └─ returns { data: { userId }, error: null }
  → client redirects to /signup/org
```

**Step 2 — `/signup/org`** (client form: org name, industry — `INDUSTRIES` from `src/types`)

```
User submits
  → POST /api/auth/signup  body: { action: 'create-org', ... }
      ├─ Zod validates body
      ├─ requires authenticated session (auth.getUser)
      ├─ idempotency: rejects if user already has org_id
      ├─ insert into organizations  (RLS: auth_users_insert_org)
      ├─ insert into users          (role='owner', org_id=newOrg.id)
      └─ returns { data: { orgId }, error: null }
  → client redirects to /dashboard
```

### 6.2 Google OAuth

```
/login or /signup → click "Continue with Google"
  → supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${origin}/auth/callback?next=/signup/org` }
    })
  → /auth/callback exchanges code, redirects to next
  → /signup/org loads
      ├─ if user has users row with org_id → redirect to /dashboard
      └─ else → render org form (prefill name with `${full_name}'s Workspace`)
```

### 6.3 Login

```
/login → email+password OR Google
  → supabase.auth.signInWithPassword (or OAuth flow above)
  → on success: proxy redirects authed users away from /login
  → if no org_id → proxy routes to /signup/org (orphan recovery)
  → else → /dashboard
```

### 6.4 Password reset

```
/forgot → email field
  → supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset` })
  → user clicks email link → /reset (authed via recovery token)
  → form: new password → supabase.auth.updateUser({ password })
  → redirect to /dashboard
```

### 6.5 Send invite

```
Owner/admin enters email + role on /settings/members
  → POST /api/org/invitations  body: { email, role }
      ├─ Zod validates
      ├─ requireRole(['owner','admin'])
      ├─ rejects if email is already a user in this org
      ├─ upserts invitations row by (org_id, email):
      │   if exists → regenerates token + expires_at, status → 'pending'
      ├─ Resend.send({ to: email, react: <InviteEmail link={...} /> })
      └─ returns { data: { invitation }, error: null }
  → page revalidates; pending invite appears in list
```

### 6.6 Accept invite — `/invite/[token]`

```
User clicks email link
  → server component reads invitation by token
      ├─ token not found / status != 'pending' / expired → "Invite no longer valid"
      └─ valid → render accept page

  Branch A: user is logged out
    → "Sign in or create an account with email@example.com to join {OrgName}"
    → Sign up (prefilled email, locked) | Log in (prefilled email)
    → after auth → /auth/callback?next=/invite/<token> → re-enter accept page

  Branch B: user is logged in
    → check: auth.user.email === invitation.email
        ├─ no  → "Invite was sent to {invite.email}. Log out and sign in as that user."
        └─ yes → POST /api/org/invitations/[token]
                  ├─ requires auth
                  ├─ revalidates token (status, expiry, email match)
                  ├─ rejects if user already has org_id
                  ├─ insert users row (role from invitation, org_id from invitation)
                  ├─ update invitations: status='accepted', accepted_at=now()
                  └─ returns { data: { orgId } }
              → redirect to /dashboard
```

### 6.7 Cancel / resend invite

```
Cancel: DELETE /api/org/invitations?id=...
  → requireRole(['owner','admin'])
  → update invitations set status='revoked'  (soft delete)

Resend: POST /api/org/invitations  body: same email + role
  → upsert path runs: regenerates token, bumps expires_at, fires Resend
```

### 6.8 Settings — Org page

```
/settings/org (server component)
  reads:
    organizations row by id = current_org_id()
    users row for current user (for role)
  renders:
    <OrgForm initialData={org} canEdit={role === 'owner'} />
    <DangerZone visible={role === 'owner'} />

OrgForm (client):
  fields: name, industry, website, size
  → PATCH /api/org  body: validated by orgSchema
      ├─ requireRole(['owner'])
      ├─ update organizations
      └─ returns { data: org }
  → toast("Saved"), router.refresh()

DangerZone (client):
  "Delete organization" → confirm dialog (type org name) → DELETE /api/org
      ├─ requireRole(['owner'])
      ├─ delete organizations  ← cascades to users, projects, KB, invites, etc.
      └─ returns { data: null }
  → supabase.auth.signOut() → redirect /signup
```

### 6.9 Settings — Members page

```
/settings/members (server component)
  reads:
    users where org_id = current_org_id()
    invitations where org_id = current_org_id() and status = 'pending'
  renders:
    <InviteForm canInvite={role in ['owner','admin']} />
    <MembersTable
       members={...}
       invites={...}
       currentUserRole={role}
       currentUserId={...}
    />

MembersTable (client):
  Active members:
    columns: avatar | name + email | role badge | actions menu
    actions menu:
      owner sees: Change role > [Admin|Member] · Transfer ownership · Remove
      admin sees: Remove (members only — not other admins or owner)
      no menu on self row
  Pending invites:
    columns: email | role | invited X ago | expires in Y days | actions
    actions: Resend · Cancel  (owner/admin only)

Mutations:
  PATCH /api/org/members/[userId]  body: { role }
    → requireRole(['owner']) for role changes
  POST  /api/org/members/[userId]  body: { action: 'transfer-ownership' }
    → requireRole(['owner'])
    → atomic: target.role='owner', self.role='admin'
  DELETE /api/org/members/[userId]
    → requireRole(['owner','admin'])
    → server validates: admin can't remove admin/owner; cannot remove self
```

### 6.10 Dashboard placeholder

```
/dashboard (server component)
  reads users.org_id for current user
    ├─ null  → redirect /signup/org   (orphan recovery)
    └─ set   → render placeholder:
                 "Welcome to {orgName}. Knowledge Base lands next week."
                 CTAs: "Go to settings" | "Invite teammates"
```

## 7. RBAC Enforcement

### 7.1 `requireRole` server utility

```ts
// src/lib/auth/requireRole.ts
import { createClient } from "@/lib/supabase/server";
import { ApiErrors } from "@/lib/api";

type Role = "owner" | "admin" | "member";

export async function requireRole(allowed: Role[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw ApiErrors.unauthorized();

  const { data: row } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("id", user.id)
    .single();

  if (!row) throw ApiErrors.forbidden("Not a member of any organization");
  if (!allowed.includes(row.role as Role)) {
    throw ApiErrors.forbidden(`Requires role: ${allowed.join(" or ")}`);
  }

  return { userId: row.id, orgId: row.org_id, role: row.role as Role };
}
```

Every privileged route handler starts with `const { orgId } = await requireRole(['owner','admin'])`.

### 7.2 `withErrorHandling` route wrapper

Eliminates per-route try/catch. Catches:
- Zod validation errors → 400 with field details
- `ApiError` throws → their declared status
- Anything else → 500 with sanitized message; full stack logged via `console.error`

Lives in `src/lib/api.ts` as an extension of the existing helpers.

### 7.3 UI rules

- Hide buttons the user can't use
- No "permission denied" pages — if a forbidden action is somehow submitted (curl, etc.), the API returns 403 and the UI shows a toast
- Member-tier users see settings pages (transparency) but never see action menus

## 8. Error Handling

### 8.1 Envelope (already established)

```ts
{ data: T, error: null }                         // success
{ data: null, error: { code, message } }         // failure
```

Codes used in Week 2: `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `EXPIRED`, `EMAIL_FAILED`, `INTERNAL`.

### 8.2 UI surfacing

- Form errors (Zod, 400) → inline under field via react-hook-form
- Action errors (403, 409, 500) → `sonner` toast
- Not-found / expired invite pages → full-page render
- OAuth callback failure → redirect to `/login?error=auth_callback_failed` (already wired)

### 8.3 Email send failures

If Resend `send()` fails after the invitation row is inserted, return:

```json
{ "data": { "invitation": {...} },
  "error": { "code": "EMAIL_FAILED",
             "message": "Invite saved but email failed to send. Click Resend to try again." } }
```

Both `data` and `error` are populated so the client can revalidate the list AND toast a warning. No automatic retry in Week 2 — that's a queue concern for Week 5.

### 8.4 Logging

`console.error` only, only in `withErrorHandling` and the Resend catch block. No `console.log` anywhere (CLAUDE.md rule). Each error logs route, userId (if any), error.message, stack.

### 8.5 Validation

Every API route body validated with a Zod schema imported from `src/lib/schemas/*.ts`. The same schema is used by react-hook-form on the client — single source of truth.

## 9. Eviction Handling

When an active user is removed by an owner/admin, they have a valid Supabase session but no `users` row. The proxy handles this:

```ts
// updateSession in src/lib/supabase/middleware.ts
// after fetching user, before redirect logic:
if (user) {
  const { data: dbUser } = await supabase
    .from("users").select("id").eq("id", user.id).maybeSingle();

  if (!dbUser && !pathname.startsWith("/signup/org") && !pathname.startsWith("/auth/")) {
    // Evicted: signed-in but no users row, and not in the orphan-recovery flow
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "removed");
    return NextResponse.redirect(url);
  }
}
```

**Distinguishing eviction from orphan signup:** during the signup wizard, a user has `auth.users` but no `users` row mid-flow. We allow that ONLY when the user is on `/signup/org` or coming through `/auth/callback`. Anywhere else, missing-`users` = evicted.

## 10. Acceptance Criteria

The following 23 manual smoke tests gate Week 2 acceptance. All must pass plus `pnpm build` clean and `pnpm lint` clean.

| # | Flow | Steps | Pass criteria |
|---|---|---|---|
| 1 | Email signup | `/signup` → fill → `/signup/org` → fill → submit | Lands `/dashboard`. Rows in `auth.users`, `users`, `organizations`. `users.role='owner'`. |
| 2 | Signup interrupt + recovery | Step 1 done, close browser. Re-login. | Routed to `/signup/org`. Step 2 completes. No duplicate orgs. |
| 3 | Google OAuth (new user) | `/signup` → Google → consent → `/signup/org` | Org created with `full_name` from Google. |
| 4 | Google OAuth (returning user) | Sign out. `/login` → Google. | `/dashboard` directly. No wizard. |
| 5 | Login email/pass | `/login` → fill → submit | `/dashboard`. Wrong pass → inline error. |
| 6 | Forgot password | `/forgot` → enter email → click email link → set new pass | `/dashboard`. New pass works on next login. |
| 7 | Send invite | Members → InviteForm → submit | Pending invite appears. Email arrives. Link → `/invite/<token>`. |
| 8 | Accept invite (new user) | Invite link → "Sign up" → email locked → set pass | `users` row created with role/org from invite. Status `accepted`. |
| 9 | Accept invite (existing user, matching email) | Logged in → invite link | One-org guard blocks: "Already in {OtherOrg}." |
| 10 | Accept invite (wrong email) | Logged in as bob → click invite for alice | "Log out and sign in as alice@..." No DB writes. |
| 11 | Accept invite (expired) | Manually expire. Click link. | "Invite no longer valid." Status unchanged. |
| 12 | Cancel invite | Cancel from members page → confirm | Row gone (`status=revoked`). Old token returns 404 page. |
| 13 | Resend invite | Resend on pending row | New email. Old token invalid. |
| 14 | Edit org | `/settings/org` (owner) → change → save | Toast. Refresh shows new values. |
| 15 | Edit org as admin | Sign in as admin → `/settings/org` | Form disabled. PATCH returns 403 if forced. |
| 16 | Member view of settings | Sign in as member | Sees roster + invites. No invite form. No action menus. |
| 17 | Change role | Owner → MembersTable → change member to admin | Badge updates. Their permissions update. |
| 18 | Transfer ownership | Owner → Transfer to admin | Old owner becomes admin. New owner sees danger zone. |
| 19 | Remove member | Owner → Remove → confirm | Removed user signed out + redirected to `/login?error=removed` on next request. |
| 20 | Admin remove rules | Admin → try to remove another admin (forced via curl) | 403. Member-removal works. |
| 21 | Self-protection | Try `DELETE /api/org/members/<self>` | 403 "Cannot remove yourself." |
| 22 | Delete org | Owner → DangerZone → type org name → confirm | Signed out, lands `/signup`. All org data gone. |
| 23 | RLS isolation | Two browsers, different orgs | Each sees only own org's data. |

## 11. Out of Scope (Defer to Later Sprints)

- Email confirmation gate (Supabase setting, Week 8)
- Multiple orgs per user (schema decision, would need junction table — not for MVP)
- "Leave organization" self-action (Week 8)
- Rate limiting beyond Supabase defaults (Week 8)
- Concurrent signup race conditions on org name (no uniqueness constraint needed)
- Mobile layout polish (Week 8)
- Automated tests (Playwright + Vitest in a later sprint)
- Background job to mark expired invitations (lazy at-accept-time check is enough for Week 2)
- Audit log of admin actions (Week 7 or 8 if needed for compliance)

## 12. Pre-Flight Setup (One-Time)

Before implementation testing, the user needs:

1. `.env.local` filled with Supabase + Resend keys
2. `supabase db push` (runs migrations 001 and 002)
3. Supabase dashboard → Authentication → Providers → enable Google, paste OAuth credentials
4. Resend dashboard → verify a sender domain (or use `onboarding@resend.dev` for testing)
5. `pnpm install` (picks up new react-hook-form deps)
6. shadcn primitives installed (one-time per primitive)

## 13. Implementation Order (for the plan)

Suggested sequencing for the writing-plans skill to fan out:

1. Migration 002 + types regen
2. shadcn primitives + new components
3. Schemas (`src/lib/schemas/auth.ts`, `org.ts`)
4. Server utils (`requireRole`, `withErrorHandling` extension)
5. Auth flows: signup wizard, login, password reset
6. Proxy update (eviction handling, orphan recovery)
7. Settings org page + API route
8. Settings members page + invite/accept/cancel/resend APIs
9. Dashboard placeholder
10. Smoke-test pass + bug fixes
11. Update changeLog.md

End of spec.
