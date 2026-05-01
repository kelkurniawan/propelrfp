# PropelRFP — Changelog

All notable changes to this project are recorded in this file.
Format: `[Week N — Phase] Date` → grouped by file, with what changed and why.

---

## [Week 2 — Auth & Org Module] 2026-05-01

**Branch:** `feature/auth-and-org` → PR into `develop`
**Build status:** `pnpm typecheck` and `pnpm build` both pass clean. 17 routes compiled successfully.

**Commits (oldest → newest):**

| SHA | Message |
|---|---|
| `67a7c6d` | `feat(db): add invitations table for team invite flow` |
| `44409d6` | `fix(db): remove overly permissive invitations token lookup policy` |
| `cc2d755` | `feat(types): add Invitation table to database type` |
| `7ce1f12` | `feat(ui): install react-hook-form and shadcn primitives` |
| `041ac6d` | `feat(schemas): add org and invite Zod schemas` |
| `6122855` | `feat(schemas): add auth Zod schemas` |
| `3ef5f96` | `feat(auth): add requireRole and withErrorHandling helpers` |
| `f8c7115` | `feat(ui): auth shared components (card, google, field)` |
| `ea68698` | `feat(auth): real login page with email/pass + Google` |
| `228364e` | `feat(auth): signup wizard step 1 (account)` |
| `7197723` | `feat(auth): signup wizard step 2 (org details)` |
| `4f188ef` | `feat(api): /api/auth/signup handles account + org creation` |
| `0f7647b` | `feat(auth): forgot password page` |
| `ffb81c2` | `feat(auth): reset password page` |
| `ed8d016` | `fix(auth): Suspense boundary for useSearchParams + Supabase client placeholder for build` |
| `96d20d5` | `feat(proxy): handle evicted users and orphan signup recovery` |
| `2ece9c2` | `feat(settings): tab nav layout` |
| `6973106` | `feat(settings): org details page with form and danger zone` |
| `757fcea` | `feat(api): /api/org PATCH and DELETE for owner` |
| `43bfc03` | `feat(email): invite template and Resend wrapper` |
| `7aa6f23` | `feat(api): POST/DELETE /api/org/invitations` |
| `2af302f` | `feat(api): POST /api/org/invitations/[token] accept flow` |
| `7a87aab` | `feat(auth): /invite/[token] landing page + signout endpoint` |
| `17a7e35` | `feat(settings): members page with invite form and table` |
| `e3a854c` | `feat(api): /api/org/members/[userId] role/transfer/remove` |
| `65e95ac` | `feat(dashboard): Week 2 placeholder with settings CTAs` |
| `4fb9070` | `docs(changelog): record Week 2 — Auth & Org module` |

---

### Overview

Week 2 delivered the complete Auth & Org module: real login/signup flows (email + Google OAuth), org creation wizard, team invite system, org and member settings pages, role-based access control, and eviction/orphan recovery in the proxy. All 27 tasks from the implementation plan were completed. The implementation plan lives at `docs/superpowers/plans/2026-04-30-week2-auth-org.md` and the design spec at `docs/superpowers/specs/2026-04-30-week2-auth-org-design.md`.

---

### New Migration

#### `supabase/migrations/002_invitations.sql`

Full DDL as committed:

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

create index invitations_org_id_idx       on invitations(org_id);
create index invitations_token_idx        on invitations(token);
create index invitations_email_status_idx on invitations(email, status);
```

RLS enabled. Three policies:
- `invitations_org_read` — members SELECT their org's invitations.
- `invitations_admin_insert` — owners/admins INSERT (with `with check` verifying `org_id = current_org_id()` and caller role).
- `invitations_admin_update` — owners/admins UPDATE (for revoke/resend).

**Security fix applied in commit `44409d6`:** The initial draft (`67a7c6d`) included a fourth policy `invitations_token_lookup for select using (true)`. This would have made the entire invitations table (all email addresses and tokens) publicly readable without authentication. The code quality review caught it. The policy was removed in the next commit. All server-side token lookups now use `createServiceClient()` (service role), which bypasses RLS safely and the service key is never exposed client-side.

---

### New Dependencies Added in Week 2

| Package | Installed version | Purpose |
|---|---|---|
| `react-hook-form` | `^7.74.0` | Controlled form state and submission |
| `@hookform/resolvers` | `^5.2.2` | Zod resolver bridge for react-hook-form |
| `sonner` | `^2.0.7` | Toast notifications (`<Toaster richColors />` in root layout) |
| `@radix-ui/react-dialog` | `^1.1.15` | Radix primitive for shadcn/ui `dialog` |
| `@radix-ui/react-dropdown-menu` | `^2.1.16` | Radix primitive for shadcn/ui `dropdown-menu` |
| `@radix-ui/react-label` | `^2.1.8` | Radix primitive for shadcn/ui `label` |
| `@radix-ui/react-select` | `^2.2.6` | Radix primitive for shadcn/ui `select` |
| `@radix-ui/react-slot` | `^1.2.4` | Radix primitive for shadcn/ui `button` |
| `next-themes` | `^0.4.6` | shadcn/ui peer dependency (installed, not yet used) |

shadcn/ui components added via `pnpm dlx shadcn@latest add`:

| Component | Output file |
|---|---|
| `button` | `src/components/ui/button.tsx` |
| `input` | `src/components/ui/input.tsx` |
| `label` | `src/components/ui/label.tsx` |
| `card` | `src/components/ui/card.tsx` |
| `dialog` | `src/components/ui/dialog.tsx` |
| `table` | `src/components/ui/table.tsx` |
| `dropdown-menu` | `src/components/ui/dropdown-menu.tsx` |
| `select` | `src/components/ui/select.tsx` |
| `alert` | `src/components/ui/alert.tsx` |
| `sonner` | `src/components/ui/sonner.tsx` |

---

### New Files — Zod Schemas

#### `src/lib/schemas/auth.ts`

```ts
export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

export const signupAccountSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

export const forgotSchema = z.object({ email: z.string().email("Invalid email") });

export const resetSchema = z
  .object({ password: z.string().min(8).max(72), confirm: z.string() })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

// Discriminated union used by /api/auth/signup to handle both wizard steps
export const signupBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create-account"), ...signupAccountSchema.shape }),
  z.object({ action: z.literal("create-org"), name: z.string().min(1).max(100), industry: z.string().min(1) }),
]);
```

#### `src/lib/schemas/org.ts`

```ts
export const orgUpdateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  industry: z.enum(INDUSTRIES as readonly [string, ...string[]]),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("").transform(() => undefined)),
  size: z.enum(["1-10", "11-50", "51-200", "201-1000", "1000+"]).optional(),
});

export const inviteCreateSchema = z.object({
  email: z.string().email("Invalid email"),
  role: z.enum(["admin", "member"]),
});

export const memberRoleSchema = z.object({ role: z.enum(["admin", "member"]) });

export const memberActionSchema = z.object({ action: z.literal("transfer-ownership") });
```

---

### New Files — Auth Utilities

#### `src/lib/auth/requireRole.ts`

```ts
export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function requireRole(allowed: UserRole[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ApiError("unauthorized", "Authentication required", 401);

  const { data: row, error } = await supabase
    .from("users").select("id, org_id, role").eq("id", user.id).single();

  if (error || !row) throw new ApiError("forbidden", "Not a member of any organization", 403);
  if (!allowed.includes(row.role as UserRole))
    throw new ApiError("forbidden", `Requires role: ${allowed.join(" or ")}`, 403);

  return { userId: row.id, orgId: row.org_id, role: row.role as UserRole, supabase };
}
```

Used by every authenticated API route. Returns a structured context object so routes don't need to repeat session/role logic.

#### `src/lib/api.ts` — extended from Week 1

`withErrorHandling()` added to the existing `ok`, `fail`, `ApiErrors` exports:

```ts
export function withErrorHandling(handler) {
  return async (req, ctx): Promise<NextResponse> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ZodError) {
        return fail("validation_failed", err.issues.map((i) => i.message).join(", "), 400);
      }
      if (err instanceof ApiError) return fail(err.code, err.message, err.status);
      console.error("[api] unhandled error", err);
      return ApiErrors.InternalError();
    }
  };
}
```

Every route handler is now wrapped: `export const POST = withErrorHandling(async (req) => { ... })`. Zod parse errors from `schema.parse(await req.json())` are caught automatically and returned as `{ data: null, error: { code: "validation_failed", message: "..." } }` without extra try/catch boilerplate in each route.

---

### New Files — Auth Shared UI Components

#### `src/components/auth/AuthCard.tsx`

Branded card wrapper used by every auth page. Props: `title`, `subtitle?`, `children`, `footer?`. Renders:
- PropelRFP logo: gradient square (`linear-gradient(135deg, #162B44, #2E75B6)`) with "P" lettermark + wordmark in navy.
- White rounded card (`rounded-xl border border-gray-200 bg-white p-8 shadow-sm`).
- Optional footer below the card for secondary links ("Already have an account?", "Back to sign in", etc.).
- Background: `bg-[#F7F9FB]` (light grey, full-screen).

#### `src/components/auth/GoogleButton.tsx`

Client component (`"use client"`). Single prop `next?: string` (defaults to `"/signup/org"`). On click: calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + /auth/callback?next=<encoded-next> } })`. Renders as a full-width outline Button.

#### `src/components/auth/FormField.tsx`

Accessibility wrapper. Props: `label`, `htmlFor`, `error?`, `children`. Renders `<Label htmlFor>` + children + optional `<p className="text-xs text-destructive">` error line. Used by all forms (login, signup, org, invite, members).

---

### New Files — Auth Pages

#### `src/app/(auth)/login/page.tsx` (replaced Week 1 placeholder)

Two sub-components:

**`RemovedBanner`**: calls `useSearchParams()` to read `?error=removed`. Renders amber alert box if present, null otherwise. Wrapped in `<Suspense>` inside `LoginForm` to satisfy Next.js static rendering requirements (see Bugs Fixed §2).

**`LoginForm`** (client component):
- `useForm` with `loginSchema`.
- On submit: `supabase.auth.signInWithPassword({ email, password })`. On error: `toast.error(error.message)`. On success: `router.replace("/dashboard")` + `router.refresh()`.
- Renders email Input, password Input, "Forgot password?" link, Sign in Button, divider, `<GoogleButton next="/dashboard" />`.

**`LoginPage`** (default export, server-compatible): wraps `LoginForm` in `AuthCard` with title "Welcome back" and sign-up footer link.

#### `src/app/(auth)/signup/page.tsx` (replaced Week 1 placeholder)

Wizard step 1. Client component. `useForm` with `signupAccountSchema`. On submit: `POST /api/auth/signup` with `{ action: "create-account", full_name, email, password }`. On success: `router.replace("/signup/org")`. Renders: full name, email, password fields + "Continue" button + Google OAuth button (which redirects directly to `/signup/org` after OAuth). Footer: "Already have an account? Sign in".

#### `src/app/(auth)/signup/org/page.tsx` (new)

Wizard step 2. Client component. Local `orgStepSchema` (name + industry enum). On mount: `supabase.auth.getUser()` to prefill org name from `user.user_metadata.full_name` → `"<FirstName>'s Workspace"` (handles Google and email signup). On submit: `POST /api/auth/signup` with `{ action: "create-org", name, industry }`. On success: `router.replace("/dashboard")` + `router.refresh()`. Idempotent — if org already exists the API returns the existing `orgId` without error.

#### `src/app/(auth)/forgot/page.tsx` (new)

Client component. `useForm` with `forgotSchema`. Local `sent` state (boolean). On submit: `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + /reset })`. On success: flips `sent = true` → renders confirmation text ("If that email is registered, a password reset link is on its way"). No email enumeration: does not reveal whether the address exists.

#### `src/app/(auth)/reset/page.tsx` (new)

Client component. `useForm` with `resetSchema` (password + confirm with `refine` cross-field check). On submit: `supabase.auth.updateUser({ password: values.password })`. On success: `toast.success("Password updated")` → `router.replace("/dashboard")`.

#### `src/app/api/auth/signout/route.ts` (new)

```ts
export async function POST(req: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
```

Used via `<form action="/api/auth/signout" method="post">` in the invite page's wrong-account state. HTTP 303 ensures browser GETs the redirect (standard POST-redirect-GET pattern).

---

### New Files — Invite System

#### `src/lib/email/templates/InviteEmail.tsx`

React function component (no `"use client"` — runs server-side inside Resend). Renders:
- Heading: "You've been invited to {orgName}".
- Paragraph: "{inviterName} invited you to join {orgName} on PropelRFP. Click the button below to accept. The link expires in 7 days."
- CTA button: navy `#162B44` background, white text, "Accept invitation" label, links to `acceptUrl`.
- Footer disclaimer: "If you weren't expecting this email, you can safely ignore it."
All styles are inline (required for email client compatibility).

#### `src/lib/email/sendInvite.ts`

```ts
export async function sendInvite({ to, orgName, inviterName, token }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.RESEND_FROM_EMAIL ?? "PropelRFP <onboarding@resend.dev>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: fromAddr,
    to,
    subject: `You're invited to ${orgName} on PropelRFP`,
    react: InviteEmail({ orgName, inviterName, acceptUrl: `${appUrl}/invite/${token}` }),
  });
}
```

Throws on failure. The caller (`POST /api/org/invitations`) catches and returns partial-success so the saved invitation is not lost.

#### `src/app/api/org/invitations/route.ts`

**POST** — Create or resend invite (owner/admin):
1. `requireRole(["owner", "admin"])`.
2. Guard: email already a member of this org → `409 conflict`.
3. Check for existing invite row (`org_id + email`). If found: UPDATE with new token, reset `expires_at` to +7 days, reset `status = "pending"`. If not: INSERT.
4. Token: `crypto.getRandomValues(new Uint8Array(24))` → `Buffer.from(bytes).toString("base64url")` (Web Crypto API, no `node:crypto` import).
5. Parallel fetch org name + inviter display name.
6. Call `sendInvite()`. If it throws: return `NextResponse.json({ data: { invitation }, error: { code: "email_failed", message: "Invite saved but email failed to send. Click Resend to try again." } }, { status: 200 })` — partial success, HTTP 200 so client reads the body.
7. On email success: `ok({ invitation })`.

**DELETE** — Soft-revoke (owner/admin): reads `?id=` query param, sets `status: "revoked"`.

#### `src/app/api/org/invitations/[token]/route.ts`

**POST** — Accept invite:
1. Validate session with `createClient()`. No session → `ApiError 401`.
2. Look up invite by token using `createServiceClient()` — bypasses RLS (no public select policy).
3. Validate chain: invite exists → status is `"pending"` → not expired → email matches `user.email` (case-insensitive). Returns `404 / 410 / 403` on any failure.
4. Check `users` table — if user already has a row (already in an org) → `409`.
5. Insert `users` row: `{ id: user.id, org_id: invite.org_id, email, full_name, role: invite.role }`.
6. Update invitation via service client: `{ status: "accepted", accepted_at: new Date().toISOString() }`.
7. Return `ok({ orgId })`.

#### `src/app/(auth)/invite/[token]/page.tsx`

Server component. Uses `createServiceClient()` for token lookup. Four render branches:
1. **Invalid/expired**: `!invite || invite.status !== "pending" || expires_at < now` → "Invite is no longer valid" card.
2. **Unauthenticated**: no session → "Join {orgName}" card showing invite email, Create Account link (prefilled with `?invite=<token>&email=<email>`), sign-in footer link.
3. **Wrong account**: signed-in user email ≠ invite email → "Wrong account" card with `<form action="/api/auth/signout" method="post">` sign-out button.
4. **Ready to accept**: all checks pass → "Join {orgName}" card with "You'll be added as {role}" subtitle + `<AcceptButton token={token} />`.

#### `src/app/(auth)/invite/[token]/AcceptButton.tsx`

Client component (`"use client"`). `useState(busy)`. On click: `POST /api/org/invitations/{token}`. On error: `toast.error(json.error.message)`, `setBusy(false)`. On success: `router.replace("/dashboard")` + `router.refresh()`.

---

### New Files — Org & Member Settings

#### `src/app/(dashboard)/settings/layout.tsx`

Server component. Tabs array:
```ts
const TABS = [
  { href: "/settings/org",     label: "Organization" },
  { href: "/settings/members", label: "Members" },
  { href: "#",                 label: "Billing", disabled: true },
];
```
Renders `<h1>Settings</h1>` + horizontal tab nav with border-bottom active indicator. Disabled tab rendered as `<span>` with `cursor-not-allowed` and `title="Coming soon"`.

#### `src/app/(dashboard)/settings/org/page.tsx`

Server component. Reads: session → `users(org_id, role)` → `organizations(id, name, industry, website, size)`. Redirects to `/login` on any missing step. Renders:
- "Organization details" section + `<OrgForm initialData={org} canEdit={role === "owner"} />`.
- "Danger zone" section + `<DangerZone orgName={org.name} />` — only shown when `role === "owner"`.

#### `src/app/(dashboard)/settings/org/OrgForm.tsx`

Client component. `useForm` with `orgUpdateSchema`. Fields:
- `name` — text Input.
- `industry` — shadcn/ui Select from `INDUSTRIES` constant. Uses `setValue` on `onValueChange`.
- `website` — url Input, optional.
- `size` — Select from `["1-10", "11-50", "51-200", "201-1000", "1000+"]`, optional.

All fields `disabled={!canEdit}` when viewer is not owner. On submit: `PATCH /api/org` with JSON body. On success: `toast.success("Saved")` + `router.refresh()`.

#### `src/app/(dashboard)/settings/org/DangerZone.tsx`

Client component. State: `confirm` (string), `open` (boolean), `busy` (boolean). Renders a destructive-bordered box with warning text and a Dialog:
- Trigger: "Delete organization" (destructive variant Button).
- Dialog body: user must type org name exactly into an Input to enable "Delete forever" button (`confirm !== orgName` keeps it disabled).
- On confirm: `DELETE /api/org` → on success: `createClient().auth.signOut()` → `router.replace("/signup")`.

#### `src/app/api/org/route.ts`

```
PATCH  /api/org  — requireRole(["owner"])
  body: orgUpdateSchema
  updates: name, industry, website (null if empty string), size (null if undefined)
  returns: ok({ id, name, industry, website, size })

DELETE /api/org  — requireRole(["owner"])
  deletes organizations row by orgId
  cascade removes: users, subscriptions, knowledge_docs, doc_chunks, rfp_projects, rfp_sections, gen_logs, invitations
  returns: ok(null)
```

Both wrapped in `withErrorHandling`.

#### `src/app/(dashboard)/settings/members/page.tsx`

Server component. Reads session → `users(id, org_id, role)`. Parallel fetch:
- Members: `users` WHERE `org_id = me.org_id` ORDER BY `created_at ASC` (all roles).
- Invites: `invitations` WHERE `org_id = me.org_id AND status = "pending"` ORDER BY `created_at DESC`.

`canInvite = role in ["owner", "admin"]`. Renders invite section (with `<InviteForm />` if `canInvite`) + members section with `<MembersTable>`.

#### `src/app/(dashboard)/settings/members/InviteForm.tsx`

Client component. `useForm` with `inviteCreateSchema` (defaults `role: "member"`). Fields: email Input + role Select (Member / Admin). On submit: `POST /api/org/invitations`. Three response paths:
- `json.error.code === "email_failed"` → `toast.warning(message)`, reset, refresh (invite saved, email failed — warning not error).
- Other error → `toast.error(message)`.
- Success → `toast.success("Invite sent to {email}")`, reset, refresh.

#### `src/app/(dashboard)/settings/members/MembersTable.tsx`

Client component. Types:
```ts
type Member = { id, email, full_name, role: UserRole, created_at };
type Invite = { id, email, role, status, expires_at, created_at };
```

**Active members table** — each row has a dropdown menu (shown only if `canManage && member.id !== currentUserId`):
- *Owner only*: "Change role" → sub-menu (Admin / Member) → `PATCH /api/org/members/{id}` with `{ role }`. "Transfer ownership" → opens `transferTarget` confirmation Dialog.
- *Owner + Admin*: "Remove from organization" (conditional on `canRemove()`) → opens `removeTarget` confirmation Dialog.

**Pending invites table** — each row has a dropdown menu (shown if `canManage`):
- "Resend" → `POST /api/org/invitations` with same `{ email, role }`.
- "Cancel invite" → `DELETE /api/org/invitations?id={id}`.

**Confirmation Dialogs**:
- *Transfer ownership*: "Will become new owner. You will become admin." → `POST /api/org/members/{id}` with `{ action: "transfer-ownership" }`.
- *Remove member*: "Will lose access immediately." → `DELETE /api/org/members/{id}`.

`canRemove(member)` logic: returns `false` if same user; `true` for owner (any non-owner); `true` for admin only if `member.role === "member"`.

#### `src/app/api/org/members/[userId]/route.ts`

```
PATCH  — requireRole(["owner"])
  body: memberRoleSchema { role }
  guards: cannot change own role | cannot demote owner directly | target must be in same org
  action: UPDATE users.role = body.role WHERE id = userId

POST   — requireRole(["owner"])
  body: memberActionSchema { action: "transfer-ownership" }
  guards: cannot self-transfer | target must be in same org
  action: UPDATE users.role = "owner" WHERE id = userId
          UPDATE users.role = "admin"  WHERE id = actorId
  (two sequential UPDATEs, not atomic — acceptable for MVP)

DELETE — requireRole(["owner", "admin"])
  guards: cannot self-remove | target must be in same org
          admin can only remove members (not other admins or owners)
          cannot remove the owner
  action: DELETE FROM users WHERE id = userId
```

All methods wrapped in `withErrorHandling`.

---

### New Files — Dashboard

#### `src/app/(dashboard)/dashboard/page.tsx` (replaced Week 1 placeholder)

Server component. Reads session → `users(org_id)` → `organizations(name)`. Redirects to `/signup/org` if no `org_id`. Renders:
- `<h1>Welcome to {org.name}.</h1>`.
- Subtext: "Knowledge Base lands next week. In the meantime, set up your team and review your organization details."
- Two CTAs: "Organization settings" (outline Button → `/settings/org`) and "Invite teammates" (primary Button → `/settings/members`).

---

### Modified Files

#### `src/types/database.ts`

Added `invitations` table entry with full `Row`, `Insert`, `Update` types. `Insert` allows `token`, `status`, `expires_at` to be optional (DB defaults apply). Two `Relationships` entries:
- `{ foreignKeyName: "invitations_org_id_fkey", columns: ["org_id"], referencedRelation: "organizations" }`
- `{ foreignKeyName: "invitations_invited_by_fkey", columns: ["invited_by"], referencedRelation: "users" }`

#### `src/types/index.ts`

Added after `GenLog`:
```ts
export type Invitation = Tables<"invitations">;
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type InviteRole = "admin" | "member";
```

#### `src/lib/supabase/client.ts`

```ts
// Before:
return createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// After:
return createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key"
);
```

**Why:** `pnpm build` prerenders client components. Without `.env.local` (CI, staging), `createBrowserClient` throws `TypeError: Invalid URL` at prerender time and aborts the build. Placeholder values let prerendering succeed; actual Supabase API calls only happen client-side inside event handlers where runtime env vars are present.

#### `src/lib/supabase/middleware.ts`

Full rewrite of `updateSession()`. Logic:

```
PUBLIC_PATHS    = ["/", "/login", "/signup", "/forgot", "/reset"]
ORPHAN_OK_PREFIXES = ["/signup/org", "/auth/", "/api/auth/signup"]

isPublic  = pathname in PUBLIC_PATHS || pathname.startsWith("/auth/") || pathname.startsWith("/invite/")
isOrphanOk = pathname.startsWith(any ORPHAN_OK_PREFIX)

if !user && !isPublic:
  → redirect /login

if user:
  fetch users row (.maybeSingle())

  if !dbUser && !isOrphanOk:
    → signOut()
    → redirect /login?error=removed          ← EVICTION

  if dbUser && (pathname === "/login" || "/signup"):
    → redirect /dashboard                    ← ALREADY LOGGED IN GUARD

  if dbUser && !dbUser.org_id && !isOrphanOk && !isPublic:
    → redirect /signup/org                   ← ORPHAN RECOVERY
```

Three behaviors added vs. Week 1:
1. **Eviction**: `auth.users` row exists but no `users` table row (user was removed from org by an admin). Signs out + redirects to `/login?error=removed`. The `RemovedBanner` in the login page reads this query param and shows an amber warning.
2. **Orphan recovery**: User is authenticated and has a `users` row but `org_id` is null (crashed mid-signup between step 1 and step 2). Redirects to `/signup/org` to complete org creation. Idempotent — the step 2 API has a guard that returns the existing `orgId` if already created.
3. **Invite path**: `/invite/*` added to `isPublic` so unauthenticated users can see the invite landing page.

#### `src/app/layout.tsx`

Added `<Toaster richColors />` from `@/components/ui/sonner` inside `<body>`. Required to render toast notifications from any client component in the app. Only change to the root layout in Week 2.

---

### Bugs Fixed During Week 2

#### Bug 1 — Security: `invitations_token_lookup` policy `using (true)`

Initial migration draft (`67a7c6d`) included:
```sql
create policy "invitations_token_lookup" on invitations
  for select using (true);
```
This would make the entire `invitations` table (all emails, tokens, org associations) publicly readable without authentication. Flagged during code quality review.

**Fix** (`44409d6`): removed the policy. Token lookups moved server-side using `createServiceClient()` — the service role key bypasses RLS and is never exposed to the browser.

#### Bug 2 — Build failure: `useSearchParams()` not wrapped in `<Suspense>`

```
Error: useSearchParams() should be wrapped in a suspense boundary at page "/login"
```

`LoginPage` called `useSearchParams()` directly at the top level of a client component rendered during static prerender.

**Fix** (`ed8d016`): extracted `RemovedBanner` as a separate component that contains the `useSearchParams()` call. Wrapped `<RemovedBanner />` in `<Suspense>` inside `LoginForm`. Next.js only requires the boundary around the component that calls the hook.

#### Bug 3 — Build failure: `createBrowserClient` throws without env vars

```
TypeError: Invalid URL
  at createBrowserClient (...)
```

`pnpm build` prerenders `/signup/org/page.tsx` which imports `createClient()` from `client.ts`. `process.env.NEXT_PUBLIC_SUPABASE_URL` is `undefined` in build environments without `.env.local`.

**Fix** (`ed8d016`): added `??` fallback values in `createBrowserClient` call (see `src/lib/supabase/client.ts` entry above).

---

### Architecture Decisions

| Decision | Reason |
|---|---|
| `createServiceClient()` for all invite token lookups | No RLS `using (true)` policy allowed. Service role is safe — service key is server-only, never in browser. |
| Upsert-or-resend pattern on `POST /api/org/invitations` | `unique(org_id, email)` constraint prevents duplicate rows. Re-inviting regenerates the token and resets expiry rather than creating a second row. |
| Partial success response when Resend fails | Invite row is written to DB before email send. If Resend fails, the invite still exists and can be resent. API returns `{ data, error }` at HTTP 200 so the UI can show a warning toast without losing the invite. |
| Two-step ownership transfer (not atomic) | Supabase JS client provides no transaction API at application layer. Two sequential UPDATEs used for MVP. Can be replaced with a Postgres `SECURITY DEFINER` function called via RPC in Week 7+. |
| `<Suspense>` wrapping `RemovedBanner` | Next.js static rendering requirement for any component calling `useSearchParams()`. Extracted as a dedicated child component to keep `LoginForm` clean. |
| Hybrid RSC + Client form pattern | Server components handle reads (org name, member list). Client components (`"use client"`) handle all mutations via `fetch` + react-hook-form. No Server Actions — API Route Handlers enforce Zod + RBAC uniformly. |
| `requireRole` throws `ApiError` | Route handlers wrapped by `withErrorHandling` which catches `ApiError` and maps it to `{ data, error }` envelope automatically. No per-route try/catch boilerplate for role errors. |
| Deferred automated tests | User chose to defer Playwright/Vitest integration tests to a later sprint. Manual smoke matrix (23 cases) documented in design spec §10. |

---

### Complete Route Table (Week 2)

| Method | Route | File | Minimum role |
|---|---|---|---|
| GET | `/login` | `src/app/(auth)/login/page.tsx` | Public |
| GET | `/signup` | `src/app/(auth)/signup/page.tsx` | Public |
| GET | `/signup/org` | `src/app/(auth)/signup/org/page.tsx` | Session (orphan-ok) |
| GET | `/forgot` | `src/app/(auth)/forgot/page.tsx` | Public |
| GET | `/reset` | `src/app/(auth)/reset/page.tsx` | Public |
| GET | `/invite/[token]` | `src/app/(auth)/invite/[token]/page.tsx` | Public (state-conditional UI) |
| POST | `/api/auth/signup` | `src/app/api/auth/signup/route.ts` | Varies by action |
| POST | `/api/auth/signout` | `src/app/api/auth/signout/route.ts` | Session |
| PATCH | `/api/org` | `src/app/api/org/route.ts` | Owner |
| DELETE | `/api/org` | `src/app/api/org/route.ts` | Owner |
| POST | `/api/org/invitations` | `src/app/api/org/invitations/route.ts` | Owner / Admin |
| DELETE | `/api/org/invitations` | `src/app/api/org/invitations/route.ts` | Owner / Admin |
| POST | `/api/org/invitations/[token]` | `src/app/api/org/invitations/[token]/route.ts` | Session |
| PATCH | `/api/org/members/[userId]` | `src/app/api/org/members/[userId]/route.ts` | Owner |
| POST | `/api/org/members/[userId]` | `src/app/api/org/members/[userId]/route.ts` | Owner |
| DELETE | `/api/org/members/[userId]` | `src/app/api/org/members/[userId]/route.ts` | Owner / Admin |
| GET | `/settings/org` | `src/app/(dashboard)/settings/org/page.tsx` | Session |
| GET | `/settings/members` | `src/app/(dashboard)/settings/members/page.tsx` | Session |
| GET | `/dashboard` | `src/app/(dashboard)/dashboard/page.tsx` | Session |

---

### Complete File Index — Week 2

**Created:**
- `supabase/migrations/002_invitations.sql`
- `src/lib/schemas/auth.ts`
- `src/lib/schemas/org.ts`
- `src/lib/auth/requireRole.ts`
- `src/lib/email/templates/InviteEmail.tsx`
- `src/lib/email/sendInvite.ts`
- `src/components/auth/AuthCard.tsx`
- `src/components/auth/GoogleButton.tsx`
- `src/components/auth/FormField.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/label.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/table.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/alert.tsx`
- `src/components/ui/sonner.tsx`
- `src/app/(auth)/signup/org/page.tsx`
- `src/app/(auth)/forgot/page.tsx`
- `src/app/(auth)/reset/page.tsx`
- `src/app/(auth)/invite/[token]/page.tsx`
- `src/app/(auth)/invite/[token]/AcceptButton.tsx`
- `src/app/api/auth/signup/route.ts`
- `src/app/api/auth/signout/route.ts`
- `src/app/api/org/route.ts`
- `src/app/api/org/invitations/route.ts`
- `src/app/api/org/invitations/[token]/route.ts`
- `src/app/api/org/members/[userId]/route.ts`
- `src/app/(dashboard)/settings/layout.tsx`
- `src/app/(dashboard)/settings/org/page.tsx`
- `src/app/(dashboard)/settings/org/OrgForm.tsx`
- `src/app/(dashboard)/settings/org/DangerZone.tsx`
- `src/app/(dashboard)/settings/members/page.tsx`
- `src/app/(dashboard)/settings/members/InviteForm.tsx`
- `src/app/(dashboard)/settings/members/MembersTable.tsx`

**Modified:**
- `src/types/database.ts` — added `invitations` table type
- `src/types/index.ts` — added `Invitation`, `InvitationStatus`, `InviteRole`
- `src/lib/api.ts` — added `withErrorHandling` wrapper
- `src/lib/supabase/client.ts` — added `??` env var fallbacks for build safety
- `src/lib/supabase/middleware.ts` — full rewrite with eviction + orphan recovery
- `src/app/(auth)/login/page.tsx` — replaced Week 1 placeholder with real implementation
- `src/app/(auth)/signup/page.tsx` — replaced Week 1 placeholder with real implementation
- `src/app/(dashboard)/dashboard/page.tsx` — replaced Week 1 placeholder with org-aware CTA page
- `src/app/layout.tsx` — added `<Toaster richColors />`
- `package.json` — added 9 new production deps (see New Dependencies above)
- `pnpm-lock.yaml` — regenerated

---

### Smoke Tests

Automated Playwright/Vitest tests deferred to a later sprint per user decision. Manual smoke matrix (23 test cases covering signup wizard, login, Google OAuth, invite flow, settings CRUD, eviction/orphan recovery, RBAC enforcement) documented in `docs/superpowers/specs/2026-04-30-week2-auth-org-design.md` §10.

---

### Open Issues / Deferred Items

| Item | Deferred to |
|---|---|
| Playwright/Vitest integration tests for all Week 2 flows | Later sprint (user decision) |
| Billing settings tab (currently `disabled` stub, shows "Coming soon") | Week 7 — Payments module |
| Ownership transfer atomicity (two sequential UPDATEs, not a Postgres transaction) | Week 7+ — replace with `SECURITY DEFINER` Postgres function via RPC |
| Subscription seat-count check on member invite (`PLAN_LIMITS` enforcement) | Week 7 — Payments module |

---

### New Environment Variables (Week 2)

No new variables beyond what was already in `.env.example` from Week 1. The variables used in Week 2 are:

| Variable | Used by | Notes |
|---|---|---|
| `RESEND_API_KEY` | `src/lib/email/sendInvite.ts` | Throws if missing |
| `RESEND_FROM_EMAIL` | `src/lib/email/sendInvite.ts` | Optional; defaults to `PropelRFP <onboarding@resend.dev>` |
| `NEXT_PUBLIC_APP_URL` | `src/lib/email/sendInvite.ts` | Used to build invite accept URL; defaults to `http://localhost:3000` |

---

*Next: Week 3 — Knowledge Base module (`feature/knowledge-base`)*

---

## [Week 1 — Foundation Review] 2026-04-30

**Commit:** `4962e6d` — `fix: Week 1 review — RLS, auth callback URL, lint, theme tokens`
**Branch:** `main` → fast-forward merged to `develop`
**Build status:** `pnpm build`, `pnpm lint`, and `pnpm format:check` all pass clean.

A full review of the initial Week 1 commit found 11 issues. All have been fixed in this revision.

### Bugs Fixed

#### 1. Auth callback URL was wrong
- **Was:** `src/app/(auth)/callback/route.ts` resolves to URL `/callback`.
- **Now:** Moved to `src/app/auth/callback/route.ts` (outside the route group), URL is `/auth/callback`.
- **Why:** The `(auth)` route group does not contribute to the URL path. The proxy allowlist expected `/auth/*` and Supabase OAuth conventions use `/auth/callback`. As written, OAuth signin would have failed because the callback URL would not match the proxy's public-path check.

#### 2. RLS policies blocked signup entirely
- **Was:** `organizations` had no INSERT policy → impossible to create an org. `users` had only one policy referencing `users` itself → impossible for a brand-new user to insert their own row (subquery returns NULL).
- **Now:** Granular policies on each table:
  - `organizations`: `auth_users_insert_org` (any authenticated user can create), `org_members_read`, `org_owner_update`.
  - `users`: `user_self_insert` (only `id = auth.uid()`), `users_org_read`, `users_self_or_admin_update`, `owner_delete_users`.
  - `subscriptions`: read-only for org members. INSERT/UPDATE only via service role (Stripe webhook handler).
  - `gen_logs`: explicit `gen_logs_org_insert` policy. UPDATE/DELETE remain denied (append-only audit).
- **Why:** Originally the schema would have been technically syntactically valid but operationally broken — Week 2 signup would fail on the first INSERT.

#### 3. ESLint failed with 4 errors on database.ts
- **Was:** `Views: {}; Functions: {}; Enums: {}; CompositeTypes: {};` — empty object types violate `@typescript-eslint/no-empty-object-type`.
- **Now:** `Record<never, never>` for each, which carries the same type meaning (a structurally empty object) without the lint warning.
- **Why:** `pnpm lint` is required by the project conventions (CLAUDE.md) and was failing.

#### 4. Tailwind theme missed 17 of the 19 shadcn color variables
- **Was:** Only `--color-background` and `--color-foreground` were exposed via `@theme`. Utility classes like `bg-card`, `border-border`, `text-muted-foreground`, `bg-primary`, etc. would silently render unstyled because the underlying `--color-*` variables didn't exist.
- **Now:** All 19 shadcn color tokens (card, popover, primary, secondary, muted, accent, destructive, border, input, ring) plus `--radius` are wired into `@theme inline` using `hsl(var(--token))`.
- **Why:** Without this, every shadcn/ui component added in later weeks would render incorrectly and the bug would only surface visually — easy to miss until the editor is built.

### Architectural Improvements

#### 5. Extracted `src/lib/supabase/middleware.ts` helper
- **Was:** All cookie/session logic lived inline in `src/proxy.ts`.
- **Now:** Logic moved to `src/lib/supabase/middleware.ts` exporting `updateSession(request)`. The `proxy.ts` is a thin shim that calls it.
- **Why:** Matches the folder structure specified in the Dev Setup Checklist Section 10. Makes the helper independently testable and matches the canonical Supabase + Next.js auth pattern.

#### 6. Proxy now gracefully handles missing env vars
- **Was:** Proxy crashed with `TypeError: Invalid URL` if `.env.local` did not exist (would block dev server startup before Supabase setup is complete).
- **Now:** Helper checks for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; returns the unmodified `NextResponse.next()` if either is missing.
- **Why:** Allows the user to run `pnpm dev` and view the landing page before completing Supabase setup. Auth checks resume automatically once env vars are present.

#### 7. Added 9 database indexes for hot query paths
- `users(org_id)` and `users(email)` — speeds up the `current_org_id()` RLS subquery used on every authenticated query, and email lookups for invites.
- `subscriptions(stripe_customer_id)` — for webhook lookup.
- `knowledge_docs(org_id)`, `knowledge_docs(status) WHERE status IN ('queued', 'processing')` — partial index for the cron job that picks up pending docs.
- `doc_chunks(org_id)` and `doc_chunks(doc_id)` — for delete cascade and per-doc queries.
- `rfp_projects(org_id)` and composite `(org_id, status, deadline)` — for the dashboard list/sort/filter.
- `rfp_sections(project_id, position)` — for ordered editor rendering.
- `gen_logs(org_id, created_at DESC)` and `gen_logs(section_id)` — for monthly counter queries and per-section audit lookups.
- **Why:** The IVFFlat index alone won't carry production load; ordinary B-tree indexes on RLS subquery columns and dashboard filters prevent quadratic behavior as data grows.

#### 8. Added `current_org_id()` SQL helper function
- A `STABLE` function caches the `auth.uid() → org_id` lookup within a single statement.
- All RLS policies now call `current_org_id()` instead of inline subqueries.
- **Why:** On hot paths like the `doc_chunks` vector search, the original RLS policy ran the same subquery for every row. With a `STABLE` function, Postgres caches the result per statement.

### Conventions Added

#### 9. New file: `src/lib/api.ts`
- Exports `ok(data)`, `fail(code, message, status)`, and `ApiErrors` (Unauthorized / Forbidden / NotFound / ValidationFailed / LimitReached / InternalError).
- All future API routes use these helpers instead of hand-rolling `NextResponse.json({ data, error })` envelopes.
- **Why:** CLAUDE.md mandates the `{ data, error }` envelope. Centralizing it prevents drift across 20+ route handlers.

#### 10. Added `zod` dependency (^4.3.6)
- **Why:** CLAUDE.md mandates "Use Zod for request body validation in API routes." It was missing from the original installs. Pulling it in now means Week 2 routes can use it on day one.

#### 11. Prettier config + scripts
- New file `.prettierrc.json` — 100-char width, 2-space indent, semicolons, trailing commas (es5), LF endings.
- New file `.prettierignore` — excludes lockfile, build output, markdown, public assets.
- ESLint config now imports `eslint-config-prettier` to disable conflicting rules.
- New `package.json` scripts:
  - `pnpm format` — write Prettier formatting to all files.
  - `pnpm format:check` — CI-friendly check without writing.
  - `pnpm typecheck` — `tsc --noEmit` for fast type-only verification.
- **Why:** `eslint-config-prettier` and `prettier` were installed in the initial commit but never wired up.

### Files Replaced

#### 12. `README.md` rewritten
- **Was:** Default Next.js boilerplate ("This is a Next.js project bootstrapped with create-next-app").
- **Now:** Project-specific README covering the stack, getting started, scripts, architecture, project layout, branching strategy, and the 8-week roadmap.

### Verification

After all fixes:

| Check | Result |
|---|---|
| `pnpm lint` | passes, 0 warnings |
| `pnpm build` | passes, TypeScript strict OK |
| `pnpm format:check` | passes, all files formatted |
| Routes generated | `/`, `/login`, `/signup`, `/auth/callback`, `/dashboard` |

### Files Added in This Revision

- `src/lib/supabase/middleware.ts`
- `src/lib/api.ts`
- `.prettierrc.json`
- `.prettierignore`
- `README.md` (replaced)

### Files Modified in This Revision

- `supabase/migrations/001_initial_schema.sql` — RLS rewrite, indexes, `current_org_id()` helper
- `src/types/database.ts` — `{}` → `Record<never, never>`, plus Prettier reformat
- `src/app/globals.css` — added 17 missing `@theme` color tokens
- `src/proxy.ts` — reduced to thin shim around `updateSession`
- `src/lib/stripe/webhooks.ts` — Prettier reformat
- `eslint.config.mjs` — added `eslint-config-prettier`, ignore `supabase/migrations`
- `package.json` — added `format`, `format:check`, `typecheck` scripts; added `zod`
- `components.json` — Prettier reformat (multi-line shadcn config)
- `pnpm-lock.yaml` — regenerated after adding `zod`
- All other source files — Prettier reformat (consistent style: 100-char width, 2-space indent, semicolons, LF endings)

### Files Moved in This Revision

- `src/app/(auth)/callback/route.ts` → `src/app/auth/callback/route.ts`

### Files Deleted in This Revision

- `README.md` (original Next.js boilerplate, replaced)

---

## [Week 1 — Foundation] 2026-04-30

**Commit:** `4975431` — `feat: Week 1 foundation — scaffold, schema, and all lib stubs`
**Branch:** `main` → merged to `develop`
**Build status:** `pnpm build` passes clean, zero TypeScript errors.

---

### New Project

**Tool:** `pnpm create next-app@latest propelrfp --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git`
**Framework version:** Next.js 16.2.4 (App Router), React 19.2.4, TypeScript 5.x, Tailwind CSS 4.x

> The PRD specifies Next.js 14, but the scaffolder installed the latest stable (v16.2.4). App Router APIs are compatible. One breaking change in v16: `middleware.ts` is deprecated and replaced by `proxy.ts` (handled below).

---

### Dependencies Installed

#### Production (`pnpm add`)

| Package | Version | Purpose |
|---|---|---|
| `@supabase/supabase-js` | ^2.105.1 | Supabase database + auth client |
| `@supabase/ssr` | ^0.10.2 | Supabase SSR helpers for Next.js App Router |
| `@supabase/auth-helpers-nextjs` | ^0.15.0 | Legacy auth helpers (deprecated, kept for compatibility) |
| `ai` | ^6.0.170 | Vercel AI SDK (streaming utilities) |
| `openai` | ^6.35.0 | OpenAI API client (embeddings) |
| `@anthropic-ai/sdk` | ^0.91.1 | Anthropic Claude API client |
| `stripe` | ^22.1.0 | Stripe payments SDK |
| `@stripe/stripe-js` | ^9.3.1 | Stripe browser-side JS |
| `resend` | ^6.12.2 | Transactional email |
| `docx` | ^9.6.1 | DOCX export generation |
| `file-saver` | ^2.0.5 | Browser file download trigger |
| `pdf-parse` | ^2.4.5 | Server-side PDF text extraction |
| `mammoth` | ^1.12.0 | Server-side DOCX text extraction |
| `tiktoken` | ^1.0.22 | Token counting for chunking pipeline |
| `class-variance-authority` | ^0.7.1 | shadcn/ui variant utility |
| `clsx` | ^2.1.1 | Conditional class names |
| `tailwind-merge` | ^3.5.0 | Tailwind class deduplication |
| `lucide-react` | ^1.14.0 | Icon library |
| `@tiptap/react` | ^3.22.5 | Rich text editor (Review & Editor module) |
| `@tiptap/pm` | ^3.22.5 | Tiptap ProseMirror core |
| `@tiptap/starter-kit` | ^3.22.5 | Tiptap default extensions |
| `@tiptap/extension-placeholder` | ^3.22.5 | Tiptap placeholder extension |

#### Dev (`pnpm add -D`)

| Package | Version | Purpose |
|---|---|---|
| `@types/pdf-parse` | ^1.1.5 | TypeScript types for pdf-parse |
| `@types/file-saver` | ^2.0.7 | TypeScript types for file-saver |
| `prettier` | ^3.8.3 | Code formatter |
| `eslint-config-prettier` | ^10.1.8 | Disables ESLint rules that conflict with Prettier |

---

### Files Modified

#### `.gitignore`
- **Changed:** Added `!.env.example` exception to the `.env*` ignore rule.
- **Why:** The default `.env*` glob would silently ignore `.env.example`, preventing it from being committed as a template for new developers.

```diff
- .env*
+ .env*
+ !.env.example
```

#### `src/app/globals.css`
- **Changed:** Replaced two bare hex color variables with a full shadcn/ui-compatible CSS variable system using HSL values.
- **Removed:** Dark mode `@media` block (PropelRFP is light-only for MVP).
- **Removed:** `font-family: Arial, Helvetica, sans-serif` (replaced with DM Sans stack).
- **Added:** 14 CSS custom properties: `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius` and their foreground counterparts.
- **Why:** shadcn/ui components reference these CSS variables. Without them, all shadcn components render unstyled. HSL format enables `hsl(var(--primary) / 0.5)` opacity manipulation.

```diff
- --background: #ffffff;
- --foreground: #171717;
+ --background: 0 0% 97%;
+ --foreground: 222 47% 11%;
+ --card: 0 0% 100%;
+ ... (14 total variables)
```

#### `src/app/layout.tsx`
- **Changed:** Updated `metadata.title` and `metadata.description` to PropelRFP branding.

```diff
- title: "Create Next App",
- description: "Generated by create next app",
+ title: "PropelRFP — Win more contracts, faster.",
+ description: "AI-powered RFP proposal automation grounded in your company's own winning history.",
```

#### `src/app/page.tsx`
- **Changed:** Complete rewrite. Replaced the default Next.js template page with the PropelRFP landing page.
- **Removed:** All Next.js boilerplate content (logo, links to docs/templates).
- **Added:** Branded hero with logo mark, headline, CTA buttons (Start free trial / Sign in), stat strip (60% Faster, 40% Accept rate, 10x ROI). Uses PropelRFP navy (`#162B44`) color scheme matching the UX wireframes.

---

### Files Created

#### `components.json`
- shadcn/ui configuration. Sets style to `default`, base color to `slate`, CSS variables enabled, RSC mode, TypeScript, and correct path aliases.

#### `.env.example`
- Template for all 11 required environment variables. Safe to commit — contains no real secrets.
- Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STARTER_PRICE_ID`, `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL`.

---

#### `src/proxy.ts`
- **Purpose:** Route protection for all authenticated routes.
- **Why `proxy.ts` not `middleware.ts`:** Next.js 16 deprecated `middleware.ts` in favor of `proxy.ts`. Using the old name still works but triggers a build warning; this uses the correct convention.
- **Logic:**
  - Calls `supabase.auth.getUser()` on every non-static request.
  - Unauthenticated requests to protected routes → redirect to `/login`.
  - Authenticated users hitting `/login` or `/signup` → redirect to `/dashboard`.
  - Uses `@supabase/ssr` cookie management pattern to keep session tokens in sync across the request/response cycle.
- **Matcher:** Excludes `_next/static`, `_next/image`, `favicon.ico`, and all static asset extensions.

---

#### `src/lib/utils.ts`
- Exports `cn()` utility combining `clsx` + `tailwind-merge`. Required by all shadcn/ui components.

---

#### `src/lib/supabase/client.ts`
- Browser-side Supabase client using `createBrowserClient` from `@supabase/ssr`.
- Typed with `Database` generic for full type inference on all queries.
- Used in Client Components only.

#### `src/lib/supabase/server.ts`
- Exports two functions:
  - `createClient()` — server-side client using the anon key + cookie store. Used in Server Components, Route Handlers, and Server Actions.
  - `createServiceClient()` — server-side client using the service role key. Bypasses RLS. Used only for privileged server operations (e.g., cron jobs, admin tasks).
- Both functions use `await cookies()` from `next/headers` for cookie access in Next.js App Router.

---

#### `src/lib/ai/prompts.ts`
- Exports two functions:
  - `buildGenerationPrompt()` — assembles the full system + user prompt for section draft generation. Injects `org_name`, `industry`, `kbChunks` (formatted as numbered reference blocks), `sectionTitle`, `rfpContent`, and optional `customInstruction`.
  - `buildSectionDetectionPrompt()` — prompts Claude to parse an RFP document and return a JSON array of `{ title, rfp_content }` objects.
- System prompt text matches the template specified in the PRD exactly.

#### `src/lib/ai/embeddings.ts`
- Exports `embedText(text)` — single text → 1536-dim vector via `text-embedding-3-small`.
- Exports `embedBatch(texts)` — batches up to 100 texts per API call to minimize latency and cost.
- Both functions strip newlines before sending (OpenAI recommendation).

#### `src/lib/ai/generate.ts`
- Exports `generateSectionStream()` — full RAG generation pipeline:
  1. Builds prompt via `buildGenerationPrompt`.
  2. Calls Claude API (`claude-sonnet-4-5`) with streaming.
  3. Returns a `ReadableStream<Uint8Array>` that the Route Handler pipes to the browser.
  4. Retries up to 3 times with exponential backoff (1s → 2s → 4s) on any error.
- Exports `detectSections()` — calls Claude to auto-detect RFP sections, parses the JSON response.
- `MAX_TOKENS` is set to 2,000 per generation call (matches PRD cost control requirement).

---

#### `src/lib/stripe/client.ts`
- Exports `stripe` — Stripe SDK instance initialized with `STRIPE_SECRET_KEY`.
- API version: `2026-04-22.dahlia` (latest stable for Stripe SDK v22; `2025-03-31.basil` caused a TypeScript error).

#### `src/lib/stripe/webhooks.ts`
- Exports `verifyWebhookSignature()` — HMAC verification of incoming Stripe webhook payloads.
- Exports `handleSubscriptionUpsert()` — syncs `checkout.session.completed` and `customer.subscription.updated` events to the `subscriptions` table.
- Exports `handleSubscriptionDeleted()` — sets subscription status to `canceled` on `customer.subscription.deleted`.
- Uses a direct `createClient()` (service role, no cookies) instead of the SSR client because webhook route handlers have no user session context.
- **Stripe SDK v22 note:** `current_period_start` / `current_period_end` moved from the top-level `Subscription` object to `subscription.items.data[0]`. Handler reads from the item.

---

#### `src/types/database.ts`
- Hand-authored TypeScript types for all 8 database tables following the exact structure Supabase JS v2 expects: `Row`, `Insert`, `Update`, and `Relationships` keys on every table.
- Tables: `organizations`, `users`, `subscriptions`, `knowledge_docs`, `doc_chunks`, `rfp_projects`, `rfp_sections`, `gen_logs`.
- `Views`, `Functions`, `Enums`, `CompositeTypes` set to `{}` (not `Record<string, never>` — the latter causes `upsert()` to infer `never` for argument types).
- Will be replaced by Supabase CLI auto-generated types (`supabase gen types typescript`) once the project is connected.

#### `src/types/index.ts`
- Re-exports row types as named aliases (`Organization`, `User`, `Subscription`, etc.) for convenience.
- Defines all status union types (`DocStatus`, `ProjectStatus`, `SectionStatus`, `SubscriptionStatus`, `Plan`, `UserRole`).
- Defines `ApiResponse<T>` envelope: `{ data: T | null, error: { code, message } | null }`.
- Defines `PLAN_LIMITS` constant with proposal counts, storage limits, and user limits per plan.
- Defines `INDUSTRIES` constant (array of industry options used in org creation form).

---

#### `src/app/(auth)/login/page.tsx`
- Placeholder page at `/login`. Renders a single line: "Login — Week 2".
- Full implementation deferred to Week 2 (Auth & Org module).

#### `src/app/(auth)/signup/page.tsx`
- Placeholder page at `/signup`. Renders a single line: "Signup — Week 2".
- Full implementation deferred to Week 2.

#### `src/app/(auth)/callback/route.ts`
- OAuth callback Route Handler at `/auth/callback`.
- Exchanges the `code` query parameter for a Supabase session via `exchangeCodeForSession`.
- On success: redirects to `/dashboard` (or `?next=` param if set).
- On failure: redirects to `/login?error=auth_callback_failed`.
- Required for Google OAuth flow (Supabase calls this URL after authentication).

#### `src/app/(dashboard)/layout.tsx`
- Server Component layout wrapping all dashboard routes.
- Calls `supabase.auth.getUser()` and redirects to `/login` if no session exists.
- Acts as a second layer of protection in addition to the proxy (defense in depth).

#### `src/app/(dashboard)/dashboard/page.tsx`
- Placeholder page at `/dashboard`. Renders a single line: "Dashboard — Week 2".
- Full implementation deferred to Week 2.

---

#### `supabase/migrations/001_initial_schema.sql`
- Initial database schema migration. Creates all 8 tables in dependency order.
- **Tables created:**

| Table | Key columns |
|---|---|
| `organizations` | `id`, `name`, `industry`, `website`, `size` |
| `users` | `id` (FK → `auth.users`), `org_id`, `email`, `full_name`, `role` (owner/admin/member) |
| `subscriptions` | `org_id` (unique FK), `stripe_*` IDs, `status`, `plan`, billing period dates, `proposals_used` |
| `knowledge_docs` | `org_id`, `name`, `file_url`, `file_type`, `file_size_bytes`, `status` |
| `doc_chunks` | `doc_id`, `org_id` (denormalized), `content`, `token_count`, `chunk_index`, `embedding vector(1536)` |
| `rfp_projects` | `org_id`, `title`, `client_name`, `deadline`, `notes`, `status` (state machine) |
| `rfp_sections` | `project_id`, `title`, `position`, `rfp_content`, `ai_draft`, `final_content`, `status` |
| `gen_logs` | `section_id`, `org_id`, `model`, `tokens_input`, `tokens_output`, `tokens_used`, `custom_instruction` |

- **RLS:** Enabled on all 8 tables. Every table uses `org_id = (SELECT org_id FROM users WHERE id = auth.uid())` isolation policy.
- **Append-only guard on `gen_logs`:** Two policies deny `UPDATE` and `DELETE` entirely, making it a true audit log.
- **pgvector index:** `CREATE INDEX ... USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)` on `doc_chunks.embedding` for approximate nearest-neighbor search.
- **Triggers:** `update_updated_at()` function + triggers on `rfp_projects` and `rfp_sections` to auto-set `updated_at` on every row update.

#### `supabase/seed.sql`
- Dev seed data: inserts a test organization (`Acme IT Solutions`) and a trialing subscription.
- Used only in local Supabase dev environment (`supabase db reset` applies migrations then seed).

---

### Folder Structure Created

```
propelrfp/
  src/
    app/
      (auth)/
        login/page.tsx          ← placeholder
        signup/page.tsx         ← placeholder
        callback/route.ts       ← OAuth callback handler
      (dashboard)/
        layout.tsx              ← auth guard
        dashboard/page.tsx      ← placeholder
        kb/                     ← empty, Week 3
        projects/[id]/          ← empty, Week 4
        billing/                ← empty, Week 7
        settings/               ← empty, Week 8
      api/
        auth/                   ← empty, Week 2
        kb/                     ← empty, Week 3
        projects/               ← empty, Week 4
        billing/                ← empty, Week 7
        cron/                   ← empty, Week 3
      globals.css               ← modified
      layout.tsx                ← modified
      page.tsx                  ← rewritten
    components/
      ui/                       ← empty, shadcn components added per module
      kb/                       ← empty, Week 3
      projects/                 ← empty, Week 4–6
      billing/                  ← empty, Week 7
    lib/
      supabase/
        client.ts               ← new
        server.ts               ← new
      ai/
        embeddings.ts           ← new
        generate.ts             ← new
        prompts.ts              ← new
      stripe/
        client.ts               ← new
        webhooks.ts             ← new
      utils.ts                  ← new
    types/
      database.ts               ← new
      index.ts                  ← new
    proxy.ts                    ← new (replaces middleware.ts in Next.js 16)
  supabase/
    migrations/
      001_initial_schema.sql    ← new
    seed.sql                    ← new
  .env.example                  ← new
  components.json               ← new
```

---

### Known Decisions & Notes

| Decision | Reason |
|---|---|
| Next.js 16 instead of v14 | Scaffolder installs latest stable. App Router APIs unchanged; only `middleware.ts` → `proxy.ts` differs. |
| `proxy.ts` instead of `middleware.ts` | Next.js 16 breaking change. `middleware.ts` still works but shows a deprecation warning at build time. |
| Stripe API version `2026-04-22.dahlia` | SDK v22 requires this exact version string; `2025-03-31.basil` causes a TypeScript compile error. |
| `current_period_*` read from subscription item | In Stripe SDK v22, these fields moved from the top-level `Subscription` to `subscription.items.data[0]`. |
| Supabase `Database` type uses `{}` for Views/Enums | Using `Record<string, never>` causes Supabase's `upsert()` to infer `never` for its argument type, breaking TypeScript. |
| Tiptap for rich text editor | Not specified in PRD. Chosen over Quill/ProseMirror because it is headless, has first-class React + TypeScript support, and works with Next.js App Router Server Components. |
| `gen_logs.Update: never` removed | Keeping `Update: never` blocks valid TypeScript usage patterns. Append-only behavior is enforced at the database level via RLS policy `for update using (false)`, not in the TypeScript type. |

---

*Next: Week 2 — Auth & Org module (`feature/auth-and-org`)*
