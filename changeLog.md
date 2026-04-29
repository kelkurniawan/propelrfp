# PropelRFP — Changelog

All notable changes to this project are recorded in this file.
Format: `[Week N — Phase] Date` → grouped by file, with what changed and why.

---

## [Week 1 — Foundation Review] 2026-04-30

**Branch:** `main`
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
- All other source files — Prettier reformat

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
