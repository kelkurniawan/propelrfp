# PropelRFP — Changelog

All notable changes to this project are recorded in this file.
Format: `[Week N — Phase] Date` → grouped by file, with what changed and why.

---

## [Week 8 — Security Hardening] 2026-05-17

**Branch:** `feature/security-hardening`
**Build status:** `pnpm build` clean. Merged to `develop`.

**Commits (oldest → newest):**

| SHA       | Message |
| --------- | ------- |
| `94e79d5` | `fix: add .trim() to all user-facing text schemas and enforce client_name min(1)` |
| `b685c51` | `feat: add CORS domain lockdown and security headers to all API routes` |
| `ee5e572` | `feat: add distributed rate limiting on auth, AI, and API routes via Upstash` |
| `9214e2e` | `feat: add custom 404 and root error boundary pages` |
| `d6eff3e` | `feat: integrate Sentry for error monitoring and alerting` |
| `41d97b1` | `docs: add database rollback scripts for migrations 003-006` |
| `46e2325` | `docs: add comprehensive error handling and rollback reference (errorhandler.md)` |

---

### Overview

Post-UAT security hardening sprint. 9 gaps addressed: RLS/UUID isolation confirmed solid (no code change needed), password reset expiry confirmed correct (Supabase dashboard config), input sanitization added across all Zod schemas, CORS headers + security headers locked to the app's own domain, distributed rate limiting via Upstash Redis (Vercel KV), custom 404 and error boundary pages, Sentry monitoring with alert rules, DB rollback SQL scripts for migrations 003-006, and a comprehensive `docs/errorhandler.md` covering all error codes, rate limit headers, UI screens, and the Vercel rollback procedure.

Design spec: `docs/superpowers/specs/2026-05-17-security-hardening-design.md`
Implementation plan: `docs/superpowers/plans/2026-05-17-security-hardening.md`

**New runtime dependencies:** `@upstash/ratelimit`, `@upstash/redis`, `@sentry/nextjs`

---

### Changes by Category

#### Input Sanitization

| File | Change |
|------|--------|
| `src/lib/schemas/auth.ts` | Added `.trim()` to `email` and `full_name` fields in all schemas. Added `.max(254)` to email fields. `signupBodySchema` create-org name and industry now trimmed. |
| `src/lib/schemas/projects.ts` | Added `.trim()` to all free-text fields. Fixed `client_name` — added `.min(1)` so whitespace-only strings are rejected. `detectSectionsBodySchema.rfp_text` now trimmed. |
| `src/lib/schemas/org.ts` | Added `.trim()` to `orgUpdateSchema.name` and `inviteCreateSchema.email`. Added `.max(254)` to email. |
| `src/lib/schemas/kb.ts` | Added `.trim()` to `name`, `docId`, `path`, and `query` fields across all three KB schemas. |

---

#### CORS + Security Headers

| File | Change |
|------|--------|
| `next.config.ts` | Added `headers()` config: `Access-Control-Allow-Origin` locked to `NEXT_PUBLIC_APP_URL`, plus `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` on all `/api/*` routes. Wrapped with `withSentryConfig`. |
| `src/proxy.ts` | Added OPTIONS preflight short-circuit (returns `204` immediately — no auth needed). |

---

#### Rate Limiting

| File | Change |
|------|--------|
| `src/lib/rate-limit.ts` | New file. Lazy Redis singleton + three `Ratelimit` instances: `authLimiter` (10/min), `genLimiter` (20/min), `apiLimiter` (100/min). |
| `src/proxy.ts` | Applies the correct limiter based on route prefix (`/api/auth/`, `/generate`, everything else). Returns `429` with `X-RateLimit-*` and `Retry-After` headers on breach. |
| `.env.example` | Added `KV_REST_API_URL` and `KV_REST_API_TOKEN` (Upstash/Vercel KV). |

---

#### Custom Error Pages (new files)

| File | What it shows |
|------|---------------|
| `src/app/not-found.tsx` | Global 404 — "Page not found" with links to Dashboard and Home. |
| `src/app/(dashboard)/not-found.tsx` | Dashboard-scoped 404 — shown for `/projects/fake-id` etc. |
| `src/app/error.tsx` | Root error boundary — shows digest reference code, "Try again" + "Go home" buttons. |

---

#### Sentry Monitoring

| File | Change |
|------|--------|
| `sentry.client.config.ts` | Browser Sentry init — production only, 10% trace sampling, ignores network errors. |
| `sentry.server.config.ts` | Server Sentry init — production only, 10% trace sampling. |
| `sentry.edge.config.ts` | Edge runtime Sentry init — production only, traces disabled. |
| `next.config.ts` | Wrapped with `withSentryConfig` for source maps and build-time upload. |
| `.env.example` | Added `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`. |

Manual step required: create two alert rules in Sentry dashboard (documented in `docs/errorhandler.md`).

---

#### DB Rollback Scripts (new files)

| File | Undoes |
|------|--------|
| `supabase/migrations/rollback/006_rollback.sql` | Removes `free` from plan constraint, reverts default to `starter` |
| `supabase/migrations/rollback/005_rollback.sql` | Drops `increment_proposals_if_under_limit()` function |
| `supabase/migrations/rollback/004_rollback.sql` | Drops `rfp_raw_text` column from `rfp_projects` |
| `supabase/migrations/rollback/003_rollback.sql` | Drops `doc_chunks`, `knowledge_docs`, and related functions (destructive — use only in emergency) |

---

#### Documentation

| File | Change |
|------|--------|
| `docs/errorhandler.md` | New file. Full error handling reference: all API error codes, rate limit headers, UI error screens, quota exceeded flow, Sentry integration details, alert rule setup, Vercel rollback procedure, git revert path. |

---

### Security Audit (confirmed this sprint)

- RLS + UUID isolation: `current_org_id()` is `SECURITY DEFINER`, reads from Supabase JWT — cross-org access impossible at the DB layer.
- Service role (`SUPABASE_SERVICE_ROLE_KEY`) only used in KB processing cron and billing webhook — both legitimate and auth-guarded.
- Password reset: Supabase Auth controls token TTL (set to 1h in dashboard). `redirectTo` URL is whitelisted.
- DB indexes: all hot-path queries (`doc_chunks_embedding_idx`, project/section lookups by `org_id`) were already indexed — no changes needed.

---

## [Week 8 — UAT & Launch] 2026-05-16

**Branch:** `feature/week8-launch`
**Build status:** `pnpm build` clean. Merged to `develop`.

**Commits (oldest → newest):**

| SHA       | Message |
| --------- | ------- |
| `d0ecf09` | `fix: remove console.error calls from error boundary and cron routes` |
| `d8d44ba` | `fix: return processed:null on doc processing failure to prevent cron false positive` |
| `672ea12` | `feat: add loading skeletons for all dashboard routes` |
| `5131d68` | `feat: add page-level metadata with title template` |
| `d493597` | `feat: add Vercel Analytics` |
| `da6e6ba` | `docs: add STRIPE_GROWTH_PRICE_ID to .env.example` |
| `2f6d952` | `fix: lazy-initialize Stripe client to prevent build failure without env vars` |

---

### Overview

Week 8 hardens PropelRFP for production. No new features — this week removes code quality violations (`console.error` in production code), adds loading skeleton UX for all dashboard routes, sets per-page metadata (browser tab titles), wires up Vercel Analytics for observability, fixes a Stripe client initialization bug that blocked CI builds without env vars, and documents the production deployment checklist. The design spec lives at `docs/superpowers/specs/2026-05-16-week8-uat-launch-design.md` and the implementation plan at `docs/superpowers/plans/2026-05-16-week8-uat-launch.md`.

---

### Changes by Category

#### Console Violation Fixes

| File | Change |
|------|--------|
| `src/app/(dashboard)/error.tsx` | Removed `useEffect` + `console.error`. Error boundary now shows the Next.js digest ID to the user instead of logging to console. |
| `src/app/api/cron/process-kb/route.ts` | Removed 2 `console.error` calls. On failure the loop simply `break`s. |
| `src/app/api/kb/process/route.ts` | Removed 2 `console.error` calls. On RPC error returns structured `fail()`. On doc processing failure now returns `{ processed: null }` (was incorrectly returning `{ processed: doc.id }` — a false-positive bug). |

---

#### Loading Skeletons (new files)

| File | What it shows |
|------|---------------|
| `src/app/(dashboard)/loading.tsx` | 4 stat cards + 5-row list (mirrors dashboard page) |
| `src/app/(dashboard)/kb/loading.tsx` | Heading + progress bar + upload zone + 4 doc rows |
| `src/app/(dashboard)/projects/loading.tsx` | Heading + button + 6 project rows |
| `src/app/(dashboard)/projects/[id]/loading.tsx` | Sidebar + editor two-column layout |
| `src/app/(dashboard)/settings/billing/loading.tsx` | 3 usage cards + 3 plan tile placeholders |

All use Tailwind `animate-pulse` on `bg-gray-200` divs. No new dependencies.

---

#### Page Metadata

| File | Change |
|------|--------|
| `src/app/layout.tsx` | Changed `metadata.title` from a flat string to `{ default: "PropelRFP — ...", template: "%s | PropelRFP" }` |
| `src/app/(dashboard)/dashboard/page.tsx` | Added `export const metadata: Metadata = { title: "Dashboard" }` |
| `src/app/(dashboard)/kb/page.tsx` | Added `export const metadata: Metadata = { title: "Knowledge Base" }` |
| `src/app/(dashboard)/projects/page.tsx` | Added `export const metadata: Metadata = { title: "Proposals" }` |
| `src/app/(dashboard)/settings/billing/page.tsx` | Added `export const metadata: Metadata = { title: "Billing" }` |

---

#### Vercel Analytics

| File | Change |
|------|--------|
| `package.json` | Added `@vercel/analytics` dependency |
| `src/app/layout.tsx` | Added `<Analytics />` from `@vercel/analytics/react` in body |

---

#### Stripe Client Fix

| File | Change |
|------|--------|
| `src/lib/stripe/client.ts` | Changed from top-level `new Stripe(...)` to lazy `getStripe()` function. Prevents build-time crash when `STRIPE_SECRET_KEY` is unset (CI environments). |
| `src/lib/stripe/webhooks.ts` | Updated to use `getStripe()` instead of imported `stripe` instance |
| `src/app/api/billing/checkout/route.ts` | Updated to use `getStripe()` |
| `src/app/api/billing/portal/route.ts` | Updated to use `getStripe()` |

---

#### Env Example

| File | Change |
|------|--------|
| `.env.example` | Added `STRIPE_GROWTH_PRICE_ID=price_...` (introduced in Week 7, was missing) |

---

### Security Audit (verified)

- All AI keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) server-side only — zero matches in `"use client"` files.
- `SUPABASE_SERVICE_ROLE_KEY` only in `src/lib/supabase/server.ts` and `src/app/api/kb/process/route.ts`.
- Stripe webhook validates signature via `stripe.webhooks.constructEvent` before processing.
- Cron route validates `CRON_SECRET` bearer token as first operation.
- `.gitignore` includes `.env.local`.
- `.env.example` contains only placeholder values.

---

---

## [Week 7 — Billing & Limits] 2026-05-16

**Branch:** `feature/week7-billing-limits`
**Build status:** `pnpm tsc --noEmit` clean. Merged to `develop`.

**Commits (oldest → newest):**

| SHA       | Message |
| --------- | ------- |
| `7b0d21f` | `feat: add 'free' plan to subscriptions constraint` |
| `ebae7ad` | `fix: add IF EXISTS to DROP CONSTRAINT for defensive migration` |
| `ff5a31b` | `feat: add free plan to Plan type and PLAN_LIMITS` |
| `c8cbbd9` | `feat: extend ApiError with optional extra fields for quota responses` |
| `ca01e64` | `fix: widen ApiResponse error type to allow extra quota fields` |
| `35e522d` | `feat: update quota checks to 402/QUOTA_EXCEEDED; add member limit; fix Infinity→int overflow` |
| `30eec0a` | `feat: auto-provision free subscription on org creation` |
| `25780db` | `fix: handle subscription insert failure in org creation` |
| `6a30284` | `feat: detect plan from Stripe price_id in webhook handler` |
| `fc5d4d1` | `feat: add billing API routes (subscription, checkout, portal, webhook)` |
| `8c23d97` | `feat: add upgrade modal context and handleApiError utility` |
| `cf011f7` | `feat: add UpgradeModal and mount in dashboard layout` |
| `458f642` | `feat: billing settings page (usage cards, plan tiles, checkout feedback)` |

---

### Overview

Week 7 implements Module 6 (Billing & Limits): Stripe-backed subscription management, per-plan quota enforcement, and the `/settings/billing` page. New orgs start on a permanent free plan (auto-provisioned at signup). Paid plans are gated via Stripe Checkout. Quota limits block at the API layer with `402 QUOTA_EXCEEDED` responses and surface an upgrade modal to the user. The design spec lives at `docs/superpowers/specs/2026-05-16-week7-billing-limits-design.md` and the implementation plan at `docs/superpowers/plans/2026-05-16-week7-billing-limits.md`.

---

### Plans & Limits

| Plan | Price | Proposals | Storage | Members |
|------|-------|-----------|---------|---------|
| Free | $0 | 3 | 250 MB | 1 |
| Starter | $299/mo | 10 | 500 MB | 1 |
| Growth | $599/mo | ∞ | 5 GB | 5 |
| Enterprise | custom | ∞ | custom | custom |

- Free plan is permanent — no trial expiry.
- Enterprise is sales-led; `plan = "enterprise"` set manually in DB, no Stripe involvement.

---

### New Environment Variables

```
STRIPE_GROWTH_PRICE_ID=price_...   # Growth plan price ID from Stripe dashboard
```

Existing required: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STARTER_PRICE_ID`.

---

### New Files

#### `supabase/migrations/006_free_plan.sql`

Widens the `subscriptions.plan` check constraint to include `'free'` and changes the column default from `'starter'` to `'free'`.

```sql
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN ('free', 'starter', 'growth', 'enterprise'));
ALTER TABLE subscriptions ALTER COLUMN plan SET DEFAULT 'free';
```

Run `supabase db push` to apply.

---

#### `src/lib/billing/upgrade-modal-context.tsx`

`"use client"` — React Context for global upgrade modal state. No new package dependency (replaces the Zustand store originally specced).

```ts
export type QuotaType = "proposals" | "storage" | "members";

export interface QuotaExceededInfo {
  limitType: QuotaType;
  current: number;
  limit: number;
  plan: string;
}

export function UpgradeModalProvider({ children }: { children: React.ReactNode })
export function useUpgradeModal(): { open, info, openModal, closeModal }
```

`openModal` and `closeModal` are memoised with `useCallback`. `UpgradeModalProvider` is mounted once in the dashboard layout so any child page can call `useUpgradeModal()`.

---

#### `src/lib/billing/handle-error.ts`

Client-side utility called after any `fetch` when `!res.ok`. On `402 + QUOTA_EXCEEDED` it calls `openModal` with the structured quota info from the response body. Otherwise throws the error message as a plain `Error`.

```ts
export async function handleApiError(
  res: Response,
  openModal: (info: QuotaExceededInfo) => void
): Promise<never>
```

---

#### `src/components/UpgradeModal.tsx`

`"use client"` — shadcn `<Dialog>` driven by `useUpgradeModal()`.

- Heading: "You've reached your [proposal / storage / team member] limit"
- Body: states the plan name, limit, and current usage
- "Upgrade plan" → navigates to `/settings/billing`
- "Dismiss" → closes modal

`formatValue` renders storage as MB, other types as plain numbers, `Infinity` as "unlimited".

---

#### `src/app/api/billing/subscription/route.ts`

`GET` — returns current plan, status, period end, and computed usage for all three quota types. Accessible to any authenticated org member.

```ts
// Response shape
{
  data: {
    plan: string;
    status: string;
    current_period_end: string | null;
    usage: {
      proposals: { current: number; limit: number };
      storage_bytes: { current: number; limit: number };
      members: { current: number; limit: number };
    };
  };
  error: null;
}
```

---

#### `src/app/api/billing/checkout/route.ts`

`POST { price_id: string }` — requires `owner` or `admin`. Creates or reuses a Stripe Customer, then creates a Checkout Session (`mode: "subscription"`). Returns `{ data: { url: string } }`. Client redirects to the URL.

- `success_url`: `/settings/billing?session_id={CHECKOUT_SESSION_ID}`
- `cancel_url`: `/settings/billing?canceled=1`
- `subscription_data.metadata.org_id` set so the webhook can resolve the org.

---

#### `src/app/api/billing/portal/route.ts`

`POST` — requires `owner` or `admin`. Creates a Stripe Customer Portal Session using the org's `stripe_customer_id`. Returns `{ data: { url: string } }`. Returns `404` if no Stripe customer exists (org is on free plan and has never checked out).

---

#### `src/app/api/billing/webhook/route.ts`

`POST` — raw body route (`req.text()`). No `requireRole` — validates Stripe signature via `verifyWebhookSignature`. Handles:

- `customer.subscription.created` → `handleSubscriptionUpsert`
- `customer.subscription.updated` → `handleSubscriptionUpsert`
- `customer.subscription.deleted` → `handleSubscriptionDeleted`

Returns `200 { received: true }` on success. App Router does not auto-parse the body so `req.text()` works without config.

---

#### `src/app/(dashboard)/settings/billing/page.tsx`

Server component. Fetches subscription + usage on the server (3 parallel Supabase queries), passes data as props to sub-components. Reads `STRIPE_STARTER_PRICE_ID` and `STRIPE_GROWTH_PRICE_ID` server-side and passes as string props to `PlanTiles`.

---

#### `src/app/(dashboard)/settings/billing/UsageCards.tsx`

Server component. Renders three metric cards (Proposals, Storage, Team members) in a responsive 3-column grid.

- Card turns amber (`border-amber-400 bg-amber-50`) when `current >= limit`
- Progress bar turns amber when at limit; hidden entirely for unlimited plans (`Infinity`)
- Storage displayed in MB via `formatStorage`

---

#### `src/app/(dashboard)/settings/billing/PlanTiles.tsx`

`"use client"`. Renders plan-conditional UI:

| Current plan | Renders |
|---|---|
| `free` | Starter tile (highlighted border) + Growth tile, both with Subscribe buttons |
| `starter` | "Manage subscription →" link + Growth tile with Upgrade button (highlighted border) |
| `growth` | "Manage subscription →" link + Enterprise contact link |
| `enterprise` | "Contact your account manager" note only |

`SubscribeButton` calls `POST /api/billing/checkout` and redirects to the Stripe Checkout URL. `ManageButton` calls `POST /api/billing/portal` and redirects to the Stripe Customer Portal.

---

#### `src/app/(dashboard)/settings/billing/CheckoutFeedback.tsx`

`"use client"`. Reads `?session_id` and `?canceled` search params via `useSearchParams` (wrapped in `<Suspense>` by the page). On mount:

- `session_id` present → `toast.success("Subscription activated!")` → `router.replace(pathname)` to clear params
- `canceled` present → neutral toast → `router.replace(pathname)`

---

### Modified Files

#### `src/types/database.ts`

Added `"free"` to the `plan` union in `subscriptions` Row, Insert, and Update types (three locations, previously `"starter" | "growth" | "enterprise"`).

---

#### `src/types/index.ts`

- `Plan` type: added `"free"` → `"free" | "starter" | "growth" | "enterprise"`
- `PLAN_LIMITS` const: added `free` entry (`proposals: 3, storageMb: 250, users: 1`)
- `ApiResponse.error`: widened from `{ code: string; message: string }` to `{ code: string; message: string; [key: string]: unknown }` to accommodate extra quota fields spread into error responses

---

#### `src/lib/auth/requireRole.ts`

`ApiError` extended with optional `extra?: Record<string, unknown>` as a 4th constructor parameter. Used by quota enforcement to attach `{ limit_type, current, limit, plan }` to 402 responses.

---

#### `src/lib/api.ts`

`withErrorHandling` catch block: `ApiError` branch now spreads `err.extra` into the error JSON instead of calling `fail()`. This allows quota metadata to pass through to the client without a separate response path.

```ts
if (err instanceof ApiError) {
  return NextResponse.json(
    { data: null, error: { code: err.code, message: err.message, ...err.extra } },
    { status: err.status }
  );
}
```

---

#### `src/lib/projects/limits.ts`

- `assertProposalLimit`: default fallback changed from `?? 10` to `?? 3`; added `isFinite(limit) &&` guard so unlimited plans (Growth/Enterprise) skip the check; error changed from `"limit_reached"` / 429 to `"QUOTA_EXCEEDED"` / 402 with `{ limit_type, current, limit, plan }` extra
- `atomicIncrementProposals`: **bug fix** — clamps `Infinity` to `2147483647` (Postgres `INT` max) before passing to the RPC (`p_limit` is typed as `int` in the DB function; passing `Infinity` caused a crash); error changed to `"QUOTA_EXCEEDED"` / 402

---

#### `src/lib/kb/limits.ts`

- Default plan fallback changed from `"starter"` to `"free"`
- `isFinite(limitMb)` replaces `limitMb === Infinity` for robustness
- Added `isFinite(limitBytes) &&` guard so unlimited plans skip the check
- Error changed from `"limit_reached"` / 429 to `"QUOTA_EXCEEDED"` / 402 with `{ limit_type, current, limit, plan }` extra

---

#### `src/app/api/org/invitations/route.ts`

Added member quota check at the top of the `POST` handler (before body parsing). Parallel-fetches the org's subscription plan and current member count, then throws `ApiError("QUOTA_EXCEEDED", ..., 402, { limit_type: "members", ... })` if `isFinite(memberLimit) && memberCount >= memberLimit`.

---

#### `src/app/api/auth/signup/route.ts`

In the `"create-org"` branch, after the user row is inserted, a free subscription record is inserted using the service role client:

```ts
const serviceClient = await createServiceClient();
const { error: subError } = await serviceClient.from("subscriptions").insert({
  org_id: org.id,
  plan: "free",
  status: "active",
});
if (subError) {
  console.error("[signup] subscription insert failed", subError);
  return ApiErrors.InternalError();
}
```

Service role is required because `subscriptions` RLS blocks inserts from non-service roles.

---

#### `src/lib/stripe/webhooks.ts`

- Added `planFromSubscription(subscription)` helper: reads `subscription.items.data[0].price.id` and returns `"growth"` if it matches `STRIPE_GROWTH_PRICE_ID`, otherwise `"starter"`
- `handleSubscriptionUpsert`: replaced hardcoded `plan: "starter"` with `plan: planFromSubscription(subscription)`
- `handleSubscriptionDeleted`: now also sets `plan: "free"` alongside `status: "canceled"`, so canceled orgs fall back to free-plan limits

---

#### `src/app/(dashboard)/layout.tsx`

Wrapped children in `<UpgradeModalProvider>` and mounted `<UpgradeModal />` once at the dashboard root so every child page can trigger quota exceeded dialogs via `useUpgradeModal()`.

---

#### `src/app/(dashboard)/settings/layout.tsx`

Enabled the Billing tab: removed the disabled `<span>` branch, replaced with a uniform `<Link>` for all three tabs, and updated `TABS` array (`href: "#"` / `disabled: true` → `href: "/settings/billing"`).

---

## [Week 6 — Review & Editor Completion] 2026-05-16

**Branch:** `feature/rfp-projects`
**Build status:** `pnpm tsc --noEmit` clean. `pnpm lint` 0 errors (3 pre-existing warnings). Merged to `develop`.

**Commits (oldest → newest):**

| SHA       | Message                                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `2675c49` | `chore(deps): add @tiptap/extension-underline`                                                                               |
| `5d9cfff` | `feat(export): add HTML-to-docx converter utility`                                                                           |
| `7fa7752` | `fix(export): guard non-element nodes in inlineRuns, fix PRE trailing line, use type import for UnderlineType`               |
| `b98617f` | `feat(export): add ExportButton client component`                                                                            |
| `d532291` | `feat(editor): add TiptapEditor with StarterKit + Underline and fixed toolbar`                                               |
| `b815739` | `feat(editor): replace textarea with TiptapEditor in SectionPanel`                                                          |
| `6935549` | `feat(projects): add inline status dropdown and DOCX export button to proposals list`                                        |
| `c44aaf3` | `fix: address final review — UnderlineType value import, prev guard, editable on approved, editor skeleton`                  |

---

### Overview

Week 6 completed Module 5 (Review & Editor) by upgrading the plain `<textarea>` to a Tiptap v3 rich-text editor, adding client-side DOCX export from the proposals list, and wiring up the `ProjectStatus` state machine with an inline editable dropdown. The design spec lives at `docs/superpowers/specs/2026-05-16-week6-editor-export-design.md` and the implementation plan at `docs/superpowers/plans/2026-05-16-week6-editor-export.md`.

---

### New Dependencies Added in Week 6

```bash
pnpm add @tiptap/extension-underline
```

`@tiptap/react`, `@tiptap/starter-kit`, `docx`, and `file-saver` were already installed. `@tiptap/extension-underline` was the only missing package.

---

### New Files

#### `src/lib/export/docx.ts`

Pure browser-only utility — no React, no API calls.

```ts
export interface ExportSection {
  title: string;
  final_content: string | null;
  ai_draft: string | null;
  position: number;
}

export async function buildProposalDocx(
  projectTitle: string,
  sections: ExportSection[]
): Promise<Blob>
```

**Document structure:** Project title → `HEADING_1`; each section title → `HEADING_2`; content → parsed paragraphs. Sections sorted by `position`; sections with no `final_content` and no `ai_draft` are skipped.

**HTML parsing** uses browser `DOMParser` to walk Tiptap's HTML output:
- `<p>` → `Paragraph`
- `<h1/h2/h3>` → `Paragraph` with `HeadingLevel.HEADING_1/2/3`
- `<ul><li>` → `Paragraph` with `bullet: { level: 0 }`
- `<ol><li>` → `Paragraph` with text prefix `1. `, `2. `, etc.
- `<blockquote>` → `Paragraph` with `indent: { left: 720 }`
- `<pre><code>` → one `Paragraph` per line, monospace font (`Courier New`)
- Inline: `<strong/b>` → bold, `<em/i>` → italics, `<u>` → underline (`UnderlineType.SINGLE`), `<s/del>` → strike, `<code>` inline → `Courier New`
- Plain text (no leading `<`) → split on `\n`, each non-empty line → `Paragraph`

Returns `Packer.toBlob(doc)` from `docx` v9.

**Key fixes applied during review:**
- `import type { UnderlineType }` changed back to value import; `type: "single"` changed to `type: UnderlineType.SINGLE`
- `inlineRuns`: added `if (child.nodeType !== Node.ELEMENT_NODE) return` guard before casting to `Element`
- `PRE` block: trailing empty string from `text.split("\n")` is popped before iterating

---

#### `src/app/(dashboard)/projects/ExportButton.tsx`

Client component (`"use client"`). Props: `{ projectId: string; projectTitle: string }`.

On click:
1. Sets `loading = true` (button shows "Exporting…", disabled)
2. `GET /api/projects/${projectId}/sections`
3. Filters to `status === "approved"`, sorts by `position`
4. `buildProposalDocx(projectTitle, approved)` → `saveAs(blob, sanitizedTitle.docx)` via `file-saver`
5. `finally`: `loading = false`

On error: `toast.error(message)` via sonner. Filename sanitised: `projectTitle.replace(/[^a-z0-9]/gi, "_")`.

---

#### `src/app/(dashboard)/projects/[id]/TiptapEditor.tsx`

Client component (`"use client"`). Props: `{ content: string; editable: boolean; onChange: (html: string) => void }`.

Extensions: `StarterKit.configure({ heading: { levels: [1, 2, 3] }, underline: false })` + separate `Underline` extension (`underline: false` in StarterKit avoids a duplicate-extension conflict in Tiptap v3). `immediatelyRender: false` (prevents SSR hydration warnings and makes return type `Editor | null`).

**Backward compatibility:** `normalizeContent()` wraps plain text in `<p>` if content doesn't start with `<`, transparent for existing plain-text `final_content` values.

**Fixed toolbar** renders 5 groups separated by `|` dividers:
`H1 · H2 · H3 | B · I · U · S | • · 1. | ❝ · </> | ↩ · ↪`

Active mark/node at cursor highlights the button (`bg-primary text-primary-foreground`). Undo/Redo never show as active.

**Skeleton:** While `editor === null` (first render tick), a height-preserving skeleton div (toolbar height + `min-h-[200px]` body) is rendered instead of `null` to prevent layout shift.

---

### Modified Files

#### `src/app/(dashboard)/projects/[id]/SectionPanel.tsx`

Replaced `<textarea>` with `<TiptapEditor>`. Three-way conditional:

```tsx
{!hasContent && !isStreaming ? (
  // unchanged "Click Generate" placeholder
) : isStreaming ? (
  <div className="...overflow-y-auto">{displayText}</div>
) : (
  <TiptapEditor
    content={section.final_content ?? section.ai_draft ?? ""}
    editable={section.status !== "approved"}
    onChange={onDraftChange}
  />
)}
```

`TiptapEditor` is only mounted when `!isStreaming` — avoids `setContent()` on every streamed chunk. `editable={section.status !== "approved"}` locks the editor once a section is approved, preventing silent post-approval content changes.

---

#### `src/app/(dashboard)/dashboard/ProjectsTable.tsx`

Two new features added to each project row:

**Inline status dropdown (replaces read-only badge):**
```tsx
<select
  value={p.status}
  onChange={(e) => handleStatusChange(p.id, e.target.value as ProjectStatus)}
  className={`... ${STATUS_COLORS[p.status]}`}
>
  {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((s) => (
    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
  ))}
</select>
```

`handleStatusChange`: optimistic update → `PUT /api/projects/[id]` with `{ status }` → revert + `toast.error` on `!res.ok`. Guards against `prev === undefined` with an early return.

`STATUS_COLORS`: `draft` → gray, `in_review` → blue, `submitted` → yellow, `won` → green, `lost` → red.

**Export column:**
```tsx
{allApproved ? (
  <ExportButton projectId={p.id} projectTitle={p.title} />
) : (
  <div className="w-16 shrink-0" />  // spacer keeps row alignment
)}
```

`allApproved = section_count > 0 && approved_count === section_count`. The `w-16` spacer prevents other columns from shifting when the button is absent.

---

### Key Decisions & Notes

| Decision | Reason |
|---|---|
| `StarterKit.configure({ underline: false })` | Tiptap v3 bundles `@tiptap/extension-underline` inside StarterKit. Registering the separate `Underline` extension without this flag causes a duplicate-extension runtime error. |
| `immediatelyRender: false` | Next.js SSR renders the component on the server where the editor cannot initialise. This flag tells Tiptap to skip the initial render, preventing hydration mismatches. |
| Client-side DOCX generation (no API route) | The `docx` and `file-saver` packages are already installed and browser-only. A server route would add latency, require streaming the blob back, and consume Vercel function compute for a task the browser handles natively. |
| `editable={section.status !== "approved"}` | Without this, editing an approved section fires `onDraftChange` → debounce save → `PUT .../sections/[sid]`, silently overwriting the approved content. Locking the editor after approval enforces the intended state machine. |
| Sanitised DOCX filename | `projectTitle.replace(/[^a-z0-9]/gi, "_")` prevents invalid characters in the filename (e.g., `/`, `:`, `?`) from breaking the download on Windows and macOS. |

---

*Next: Week 7 — Billing & Limits module*

---

## [Week 5 — AI Generation Engine + Editor UI] 2026-05-15

**Branch:** `feature/rfp-projects`
**Build status:** `pnpm tsc --noEmit` clean. `pnpm lint` 0 errors (3 pre-existing warnings). Merged to `develop`.

**Commits (oldest → newest):**

| SHA       | Message                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------ |
| `015f566` | `feat(schema): add genLog Zod schema`                                                            |
| `76e67d8` | `feat(api): add POST /api/gen-logs route`                                                        |
| `7ed0234` | `feat(api): add POST .../sections/[sid]/generate streaming route`                                |
| `b405687` | `fix(api): status rollback, org guard, update error check in generate route`                     |
| `4f6111b` | `feat(editor): add shared SectionDraft type`                                                     |
| `69b683d` | `feat(editor): add SectionSidebar component`                                                     |
| `470cd5f` | `feat(editor): add SectionPanel component`                                                       |
| `9329c66` | `feat(editor): add EditorShell client state component`                                           |
| `5e66f41` | `fix(editor): fix lost saves on section switch, missing generating status, reader leak`          |
| `7a7cad8` | `feat(editor): replace placeholder page with EditorShell`                                        |
| `bf1db63` | `fix(editor): remove console.error, sync model name via X-Model response header`                 |
| `19281ba` | `fix(sections): reset draft on edit open instead of useEffect setState`                          |

---

### Overview

Week 5 delivered the complete AI generation pipeline and the side-by-side editor UI. The RAG pipeline embeds each section's RFP text, retrieves the top-5 knowledge base chunks (pgvector cosine search), streams a Claude API response into the browser, and saves the draft on each debounced change. The design spec lives at `docs/superpowers/specs/2026-05-15-week5-ai-editor-design.md` and the plan at `docs/superpowers/plans/2026-05-15-week5-ai-editor.md`.

---

### New Files — API Routes

#### `src/app/api/gen-logs/route.ts`

| Method | Auth     | Behaviour |
|--------|----------|-----------|
| `POST` | any role | Validates with `genLogSchema` (`{ project_id, section_id, model, prompt_tokens, completion_tokens, org_id }`). Inserts to `gen_logs`. Returns `{ data: log }` with 201. |

#### `src/app/api/projects/[id]/sections/[sid]/generate/route.ts`

Streaming route — bare `Response` (not `NextResponse`), manual try/catch. Full RAG flow:

1. `requireRole(["owner","admin","member"])` + org-scope project lookup
2. Fetch section `rfp_content`
3. `embedText(rfp_content)` via OpenAI `text-embedding-3-small`
4. `matchDocChunks(embedding, orgId, 5)` — pgvector cosine search
5. Build system prompt (org name, industry, KB chunks, section text)
6. `anthropic.messages.stream({ model: MODEL, max_tokens: 4096, ... })` — Claude API stream
7. Stream `text_delta` events as plain text chunks via `ReadableStream`
8. On stream end: update `rfp_sections.ai_draft` + set `status = "draft"` + POST to `/api/gen-logs`

Response headers: `Content-Type: text/plain; charset=utf-8`, `X-Model: claude-sonnet-4-5`.

**Key fixes applied during review:**
- `status` update (`"generating"` → `"draft"`) wrapped in try/catch so a failed DB update doesn't crash the stream
- Added `org_id` guard on section lookup (belt-and-suspenders alongside RLS)
- Removed `console.error` (violates CLAUDE.md); errors propagate through existing catch chain
- `MODEL` exported from `generate.ts` and returned as `X-Model` header so the client always knows the actual model used

---

### New Files — Zod Schemas

#### `src/lib/schemas/genLog.ts`

```ts
export const genLogSchema = z.object({
  project_id: z.string().uuid(),
  section_id: z.string().uuid(),
  model: z.string().min(1),
  prompt_tokens: z.number().int().min(0),
  completion_tokens: z.number().int().min(0),
  org_id: z.string().uuid(),
});
```

---

### New Files — Editor UI Components

#### `src/app/(dashboard)/projects/[id]/types.ts`

Shared type file for the editor shell:

```ts
export type SectionStatus = "pending" | "generating" | "generated" | "approved";

export interface SectionDraft {
  id: string;
  title: string;
  rfp_content: string | null;
  ai_draft: string | null;
  final_content: string | null;
  status: SectionStatus;
  position: number;
}
```

#### `src/app/(dashboard)/projects/[id]/SectionSidebar.tsx`

Client component. Renders the vertical section list on the left side of the editor. Props: `{ sections: SectionDraft[]; activeId: string | null; onSelect: (id: string) => void }`.

Each item shows the section title, a colored status dot (gray=pending, amber=generating, blue=generated, green=approved), and highlights the active section. Clicking fires `onSelect`.

#### `src/app/(dashboard)/projects/[id]/SectionPanel.tsx`

Client component. Renders the right panel for the selected section. Props: section data, streaming state, save state, event callbacks.

Layout: header (title + status badge + Generate/Approve buttons) | optional custom instruction input | optional error banner | side-by-side RFP requirement (read-only) + draft editor (was `<textarea>`, replaced by `TiptapEditor` in Week 6).

**Generate flow:** "Add instruction" toggle → optional freetext → `onGenerate(instruction?)`. Button disabled while streaming. "Regenerate" shown if content exists.

**Save indicator:** `SaveIndicator` sub-component renders `"● Saving…"` / `"● Saved"` / `"⚠ Save failed"` based on `savedState` prop.

#### `src/app/(dashboard)/projects/[id]/EditorShell.tsx`

Client component (`"use client"`). The stateful coordinator for the entire editor page. Props: `{ projectId, projectTitle, sections: SectionDraft[] }`.

**State:**
- `sections: SectionDraft[]` — local copy for optimistic status updates
- `activeId: string | null` — currently selected section
- `streamingText: string` — accumulated streamed text for display
- `isStreaming: boolean` — true while a stream is in-flight
- `savedState` — `"idle" | "saving" | "saved" | "error"` for the save indicator
- `streamError: string | null`
- `saveTimersRef: Map<string, ReturnType<typeof setTimeout>>` — per-section debounce timers (fixed: was a single shared ref that cleared saves on section switch)

**Generate flow:**
1. Sets section status to `"generating"` optimistically in local state
2. `POST .../sections/${sid}/generate` with optional custom instruction
3. Reads `X-Model` header (`fallback: "claude-sonnet-4-5"`)
4. Streams `text_delta` into `streamingText`
5. On finish: sets `streamingText` as `ai_draft` in local state, status → `"generated"`, logs token usage to `/api/gen-logs`
6. On error: resets status to previous value, sets `streamError`
7. `reader.releaseLock()` in `finally` block (fixes stream lock leak)

**Debounce save flow:**
`onDraftChange(text)` → sets `saveTimersRef.get(sectionId)` to a 1500 ms timer → `PUT .../sections/${sid}` with `{ final_content: text }` → `savedState = "saved"`.

---

### Modified Files

#### `src/lib/ai/generate.ts`

Added `export const MODEL = "claude-sonnet-4-5"` (was unexported `const`). Consumed by the generate route for the `X-Model` header.

#### `src/app/(dashboard)/projects/[id]/page.tsx`

Replaced the Week 4 placeholder with a full server component: fetches project + sections (org-scoped), then renders `<EditorShell projectId={id} projectTitle={project.title} sections={sections ?? []} />`.

#### `src/app/(dashboard)/projects/[id]/sections/SectionList.tsx`

Fixed: removed a `useEffect` that was calling `setDraft(section.title)` synchronously, triggering a React lint error (`setState` on every render). Instead, `draft` is reset in the `onClick` handler when the user starts editing.

---

### Key Decisions & Notes

| Decision | Reason |
|---|---|
| `saveTimersRef: Map<string, timer>` instead of single ref | A single `useRef<timer>` was cleared when the user switched sections, silently discarding in-flight saves. Keying timers by `sectionId` ensures each section debounces independently. |
| `setStatus("generating")` before fetch, not after | The user sees immediate UI feedback (amber "Generating…" badge) without waiting for the network round-trip. |
| `reader.releaseLock()` in `finally` | If `reader.read()` throws mid-stream (e.g., network abort), the stream stays locked forever. `finally` ensures the lock is always released so the `ReadableStream` can be GC'd. |
| `X-Model` response header | Exporting `MODEL` from `generate.ts` and echoing it as a header means the client never needs its own copy of the model name — if the model changes on the server, the client adapts automatically. |
| Bare `Response` in streaming route | `NextResponse` does not support streaming in the same way. `new Response(stream, { headers })` is the App Router idiomatic pattern for SSE / chunked streaming. |

---

*Next: Week 6 — Rich Editor, DOCX Export & Project Status*

---

## [Week 4 — RFP Projects Module] 2026-05-15

**Branch:** `feature/rfp-projects`
**Build status:** `pnpm build` passes clean. 32 routes compiled successfully.

**Commits (oldest → newest):**

| SHA       | Message                                                                                     |
| --------- | ------------------------------------------------------------------------------------------- |
| `9ad4c42` | `chore(deps): add @dnd-kit/core, sortable, utilities for drag-to-reorder`                  |
| `a16880c` | `feat(db): add rfp_raw_text column to rfp_projects`                                        |
| `c6a1eed` | `feat(schemas): add project and section Zod schemas`                                       |
| `570b46e` | `feat(projects): add proposal limit check and increment helper`                            |
| `d615597` | `fix(projects): use ApiError instead of custom error class in limits helper`               |
| `a0fde3c` | `chore: merge feature/auth-and-org — resolve package.json conflict (keep dnd-kit + auth deps)` |
| `db3caf5` | `fix(projects): import ApiError from @/lib/auth/requireRole, remove spurious errors.ts`   |
| `7e84d79` | `feat(api): add GET /api/projects and POST /api/projects with section detection`           |
| `15142b5` | `feat(api): add GET/PUT/DELETE /api/projects/[id]`                                         |
| `ea82936` | `feat(api): add sections CRUD and bulk-replace endpoints`                                  |
| `9c4570c` | `feat(api): add POST /api/projects/[id]/detect-sections`                                   |
| `6215d44` | `feat(ui): update dashboard with stats cards and projects table`                           |
| `7c2b216` | `feat(ui): add /projects list page`                                                        |
| `0094940` | `fix(ui): apply type-safe fixes to projects list page`                                     |
| `e096147` | `feat(ui): add new project page with RFP text input`                                       |
| `1989410` | `fix(ui): type-safe form response, title guard, alias import in new project page`          |
| `5e189c2` | `feat(ui): add project detail placeholder page (editor shell for Module 5)`                |
| `a3927c1` | `fix(ui): surface real DB errors vs not-found in project detail page`                      |
| `7b438e7` | `feat(ui): add section review page with drag-to-reorder and confirm`                       |
| `16cde98` | `fix(ui): sensor activation distance and stale draft sync in SectionList`                  |
| `22e0a8b` | `fix: final review fixes — org_id guards, atomic limit increment, error boundary, minor improvements` |

---

### Overview

Week 4 delivered the complete RFP Projects module: project CRUD with plan-based proposal limits, AI-powered section detection (Claude API via existing `detectSections()`), a section review UI with drag-to-reorder, inline rename, and a bulk-replace confirm step, plus a revamped dashboard with live stats cards. The implementation plan lives at `docs/superpowers/plans/2026-05-15-week4-rfp-projects.md`. 9 new API routes, 2 DB migrations, and 10 new/modified UI files were added across 21 commits.

---

### New Migrations

#### `supabase/migrations/004_rfp_raw_text.sql`

**Must be applied manually in Supabase SQL Editor:**

```sql
alter table rfp_projects add column if not exists rfp_raw_text text;
```

Adds a `TEXT` column to `rfp_projects` to cache the raw RFP text pasted by the user. Used by `POST /api/projects` (initial detection) and `POST /api/projects/[id]/detect-sections` (re-detection without re-pasting).

---

#### `supabase/migrations/005_atomic_proposal_increment.sql`

**Must be applied manually in Supabase SQL Editor:**

```sql
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
```

Replaces the previous read-then-write pattern (`assertProposalLimit` + `incrementProposalsUsed`) with an atomic conditional increment. Returns `-1` if the limit has already been reached, preventing a race condition where two concurrent `POST /api/projects` requests from the same org could both pass the limit check and over-provision.

---

### New Dependencies Added in Week 4

```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Used in `SectionList.tsx` for drag-to-reorder sections. `PointerSensor` with `activationConstraint: { distance: 8 }` is used to prevent accidental drag initiation on tap.

---

### New Files — Zod Schemas

#### `src/lib/schemas/projects.ts`

```ts
export const createProjectSchema = z.object({
  title: z.string().min(1).max(200),
  client_name: z.string().max(200).nullish(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  notes: z.string().max(5000).nullish(),
  rfp_text: z.string().max(200_000).nullish(),
});

export const updateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  client_name: z.string().max(200).nullish(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  notes: z.string().max(5000).nullish(),
  status: z.enum(["draft", "in_review", "submitted", "won", "lost"]).optional(),
});

export const createSectionSchema = z.object({
  title: z.string().min(1).max(500),
  rfp_content: z.string().max(50_000).nullish(),
  position: z.number().int().min(0),
});

export const updateSectionSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  rfp_content: z.string().max(50_000).nullish(),
  position: z.number().int().min(0).optional(),
  ai_draft: z.string().max(200_000).nullish(),
  final_content: z.string().max(200_000).nullish(),
  status: z.enum(["pending", "generating", "generated", "approved"]).optional(),
});

export const bulkSectionsSchema = z.object({
  sections: z.array(z.object({
    title: z.string().min(1).max(500),
    rfp_content: z.string().max(50_000).nullish(),
    position: z.number().int().min(0),
  })).min(1),
});

export const detectSectionsBodySchema = z.object({
  rfp_text: z.string().min(1).max(200_000),
});
```

---

### New Files — Helpers

#### `src/lib/projects/limits.ts`

```ts
// assertProposalLimit — reads subscription, throws ApiError(429) if at limit.
// Returns the plan limit (used by atomicIncrementProposals).
export async function assertProposalLimit(supabase, orgId): Promise<number>

// atomicIncrementProposals — calls increment_proposals_if_under_limit RPC.
// Throws ApiError(429) if RPC returns -1 (limit hit by a concurrent request).
export async function atomicIncrementProposals(supabase, orgId, limit): Promise<void>
```

`PLAN_LIMITS` is read from `@/types/index`. Starter: 10 proposals/cycle; growth/enterprise: `Infinity`.

---

### New Files — API Routes

#### `src/app/api/projects/route.ts`

| Method | Auth | Behaviour |
|--------|------|-----------|
| `GET`  | any role | Returns all org projects with `section_count` + `approved_count` (computed from nested `rfp_sections(status)` select). Ordered by `created_at DESC`. |
| `POST` | any role | Limit check → insert project → `detectSections()` if `rfp_text` provided (wrapped in try/catch so AI failure doesn't block project creation) → `atomicIncrementProposals`. Returns `{ project, sections }` with 201. |

#### `src/app/api/projects/[id]/route.ts`

| Method   | Auth             | Behaviour |
|----------|------------------|-----------|
| `GET`    | any role         | Fetches project + `rfp_sections(*)` ordered by `position`. Returns 404 if not found or wrong org. |
| `PUT`    | any role         | Validates with `updateProjectSchema`, sets `updated_at`. Returns updated project. |
| `DELETE` | owner/admin only | Deletes project. `requireRole(["owner","admin"])` enforces permission. |

#### `src/app/api/projects/[id]/sections/route.ts`

| Method | Auth     | Behaviour |
|--------|----------|-----------|
| `GET`  | any role | Verifies project ownership, returns sections ordered by `position`. |
| `POST` | any role | Verifies project ownership, inserts single section, returns 201. |

#### `src/app/api/projects/[id]/sections/[sid]/route.ts`

| Method   | Auth     | Behaviour |
|----------|----------|-----------|
| `PUT`    | any role | Verifies project ownership, updates section + `updated_at`. |
| `DELETE` | any role | Verifies project ownership, deletes section by `id` + `project_id`. |

#### `src/app/api/projects/[id]/sections/bulk/route.ts`

| Method | Auth     | Behaviour |
|--------|----------|-----------|
| `POST` | any role | Atomic bulk-replace: `DELETE` all sections for project, then `INSERT` the new ordered set. Used by the section review "Confirm" step. Accepts `{ sections: [{ title, rfp_content, position }] }`. |

#### `src/app/api/projects/[id]/detect-sections/route.ts`

| Method | Auth     | Behaviour |
|--------|----------|-----------|
| `POST` | any role | Accepts optional `rfp_text` body; falls back to `project.rfp_raw_text`. Updates `rfp_raw_text` if new text provided (error checked). Runs `detectSections()`, bulk-replaces sections. Returns `{ project_id, sections }`. |

**Key invariant:** `rfp_sections` has no `org_id` column. Tenant isolation is enforced by joining through `project_id → rfp_projects.org_id`. All section routes first verify the project belongs to the requesting org.

---

### New Files — UI Pages & Components

#### `src/app/(dashboard)/dashboard/StatsCards.tsx`

Server component. Accepts `{ activeProposals, kbDocCount, winRate, timeSavedHours }`. Renders 4 stat cards in a 2×2 / 4×1 responsive grid. `winRate === null` renders `"—"` (no closed deals yet).

#### `src/app/(dashboard)/dashboard/ProjectsTable.tsx`

Client component (`"use client"`). Accepts `projects: Array<RfpProject & { section_count: number; approved_count: number }>`. Features:
- Radix `<Select>` filter by status (all/draft/in_review/submitted/won/lost).
- Empty state with 4-step onboarding list + "Create first proposal" CTA → `/projects/new`.
- Table rows: title link, client name, colored status badge, deadline, progress bar (green at 100%, blue otherwise), Open button.

#### `src/app/(dashboard)/dashboard/page.tsx` *(modified)*

Replaced stub. Now fetches `rfp_projects + rfp_sections(status)` and `knowledge_docs` count in parallel. Computes `activeProposals`, `winRate` (null if no closed deals), `timeSavedHours` (approved sections × 2.5). Renders `StatsCards` + `ProjectsTable`. Uses destructuring (`{ rfp_sections, ...p }`) to omit the nested relation from the spread.

#### `src/app/(dashboard)/projects/page.tsx`

Server component. Same data-fetch pattern as dashboard (org-scoped, with `rfp_sections(status)`, using `.returns<ProjectRow[]>()`). Header: "Proposals" + "New proposal" button. Renders `ProjectsTable`. Throws on DB error instead of silently returning an empty array.

#### `src/app/(dashboard)/projects/new/ProjectForm.tsx`

Client component. Fields: title (required, client-side guard), client_name, deadline (date), notes, rfp_text (10-row monospace textarea). `res.json()` typed as `{ data, error: { code, message } | null }` for strict-mode safety. On success: redirects to `/projects/[id]/sections` if rfp_text provided, else `/projects/[id]`. Cancel button → `/projects`.

#### `src/app/(dashboard)/projects/new/page.tsx`

Server wrapper. Auth guard only. Renders heading + `<ProjectForm />`.

#### `src/app/(dashboard)/projects/[id]/page.tsx`

Server component. Fetches project filtered by both `id` and `org_id` (defense-in-depth alongside RLS). Throws on non-404 DB errors. Shows: back-link, title, "Review sections" button → `/projects/[id]/sections`, "AI editor coming in Week 5" placeholder, section list with status dots (green=approved, blue=generated, gray=else).

#### `src/app/(dashboard)/projects/[id]/sections/page.tsx`

Server component. Fetches project (org-scoped) and sections ordered by position. Passes `initialSections` + `projectId` to `SectionList`.

#### `src/app/(dashboard)/projects/[id]/sections/SectionList.tsx`

Client component. Uses `@dnd-kit/sortable` with `PointerSensor` (activation distance 8px). Features:
- Drag handle per row.
- Click-to-rename with `<Input>` inline edit; Enter/blur commits, Escape cancels.
- Delete button removes from local state.
- "+ Add section manually" appends a new section with `crypto.randomUUID()` id.
- "Confirm & start generating →" POSTs to `/api/projects/[id]/sections/bulk` then navigates to `/projects/[id]`. Disabled when list is empty or loading.

#### `src/app/(dashboard)/error.tsx` *(new)*

Client error boundary for the entire `(dashboard)` route segment. Catches thrown errors from server components (DB failures, etc.) and renders a user-friendly "Something went wrong" message with a "Try again" reset button.

#### `src/components/ui/textarea.tsx` *(new)*

shadcn/ui-style `<Textarea>` component. Added because it was missing from the initial scaffold.

---

### Modified Files

#### `src/types/database.ts`

- Added `rfp_raw_text: string | null` to `rfp_projects` Row, Insert, Update types.
- Added `increment_proposals_if_under_limit` to the `Functions` block: `Args: { p_org_id: string; p_limit: number }`, `Returns: number`.

---

### Key Decisions & Notes

| Decision | Reason |
|---|---|
| `atomicIncrementProposals` uses a Postgres RPC instead of read-then-write | Two concurrent `POST /api/projects` requests from the same org could both pass the read-side limit check and create one too many projects. The RPC uses `UPDATE ... WHERE proposals_used < p_limit RETURNING proposals_used`, which is atomic under Postgres MVCC. |
| `detectSections()` wrapped in try/catch in POST `/api/projects` | An AI timeout or empty response should not roll back the project insert. The project is created; sections can be added manually. `atomicIncrementProposals` still fires so the limit slot is consumed. |
| No `org_id` on `rfp_sections` | The schema enforces tenant isolation via `project_id → rfp_projects.org_id`. All section routes verify project ownership before touching sections. RLS mirrors this join. |
| `SectionList` uses `crypto.randomUUID()` for new section IDs | `Date.now()` collides if two sections are added in the same millisecond. `crypto.randomUUID()` is available in all modern browsers and Node 18+. |
| `PointerSensor` with `activationConstraint: { distance: 8 }` | Without an activation constraint, a tap on the drag handle fires a drag before click handlers on child buttons can run. The 8px distance threshold lets taps through cleanly. |
| Server pages for `/projects/[id]` scope queries by `org_id` | Supabase RLS handles isolation at the DB level, but the application layer adds an `.eq("org_id", me.org_id)` guard for defense-in-depth. |

---

*Next: Week 5 — AI Editor module*

---

## [Week 3 — Knowledge Base Module] 2026-05-01

**Branch:** `feature/auth-and-org`
**Build status:** `pnpm build` passes clean. 26 routes compiled successfully.

**Commits (oldest → newest):**

| SHA       | Message                                                                          |
| --------- | -------------------------------------------------------------------------------- |
| `cf73d4c` | `feat(db): add match_doc_chunks and claim_next_queued_doc SQL functions`         |
| `dc8f536` | `feat(types): add match_doc_chunks and claim_next_queued_doc RPC types`          |
| `4ff6f13` | `feat(schemas): add KB upload and search Zod schemas`                            |
| `682e220` | `feat(kb): add Storage helpers (signedUploadUrl, downloadFile, deleteFile)`      |
| `a982f2e` | `feat(kb): add PDF and DOCX parser wrappers`                                     |
| `28eaefc` | `feat(kb): add tiktoken sliding-window chunker (1000 tok / 200 overlap)`         |
| `c243244` | `feat(kb): add plan-limit enforcement helper (assertWithinLimit)`                |
| `76dce02` | `feat(kb): add processDoc orchestrator (parse → chunk → embed → insert)`         |
| `cb08a9f` | `fix(kb): add error guard on final status='ready' update in processDoc`          |
| `f53c872` | `feat(api): add POST /api/kb/upload-url (plan preflight + signed URL)`           |
| `0d76531` | `feat(api): add GET/POST/DELETE /api/kb/docs`                                    |
| `2f51171` | `feat(api): add retry and download routes for knowledge docs`                    |
| `79fe4af` | `feat(api): add process route, cron route, vercel.json cron schedule`            |
| `89658c8` | `feat(api): add POST /api/kb/search (embedText + match_doc_chunks)`              |
| `f751e19` | `fix(build): unblock production build for KB module`                             |
| `e672afa` | `feat(ui): add KB page and UsageMeter server components`                         |
| `f50c661` | `feat(ui): add DropZone (3-wide semaphore upload) and KbClient state holder`     |
| `678af01` | `feat(ui): add DocsTable with status badges, retry, download, delete`            |
| `b7d83a7` | `feat(ui): add KB debug search page and SearchForm with similarity bars`         |
| `fb0fd15` | `feat(ui): add Knowledge Base link to dashboard, update placeholder text`        |
| `b29cecd` | `fix(kb): address final review — after() trigger, cron error handling, size cap` |

---

### Overview

Week 3 delivered the complete Knowledge Base module: file upload (PDF + DOCX up to 25 MB) via Supabase Storage signed URLs, an async background processing pipeline (parse → chunk → embed → store), a polling document list with status badges, retry/download/delete actions, plan-based storage limits, a Vercel cron safety net, and a debug semantic-search page. All 18 tasks from the implementation plan were completed. The implementation plan lives at `docs/superpowers/plans/2026-05-01-week3-knowledge-base.md` and the design spec at `docs/superpowers/specs/2026-05-01-week3-knowledge-base-design.md`.

---

### New Migration

#### `supabase/migrations/003_kb_storage.sql`

**Must be applied manually in Supabase SQL Editor** (see header comments in the file). Also requires:
1. Create a `documents` private Storage bucket in Supabase Studio.
2. Apply the three Storage RLS policies in the SQL Editor.

Two SQL functions:

```sql
-- Cosine similarity search over this org's chunks only.
-- security invoker: runs as caller, so RLS on doc_chunks applies.
CREATE OR REPLACE FUNCTION match_doc_chunks(
  query_embedding vector(1536),
  match_count      int DEFAULT 5
)
RETURNS TABLE (
  id           uuid,
  doc_id       uuid,
  content      text,
  token_count  int,
  chunk_index  int,
  similarity   float
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    id, doc_id, content, token_count, chunk_index,
    1 - (embedding <=> query_embedding) AS similarity
  FROM doc_chunks
  WHERE org_id = current_org_id()
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Atomic queue claim: marks one queued doc as 'processing' and returns it.
-- security definer: bypasses RLS so the cron service role can claim.
-- FOR UPDATE SKIP LOCKED: prevents two concurrent cron ticks from claiming the same doc.
CREATE OR REPLACE FUNCTION claim_next_queued_doc()
RETURNS TABLE (id uuid, file_type text, org_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    UPDATE knowledge_docs
    SET status = 'processing', updated_at = now()
    WHERE knowledge_docs.id = (
      SELECT kd.id FROM knowledge_docs kd
      WHERE kd.status = 'queued'
      ORDER BY kd.created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING knowledge_docs.id, knowledge_docs.file_type, knowledge_docs.org_id;
END;
$$;

-- Grant service_role only; REVOKE from public.
REVOKE ALL ON FUNCTION claim_next_queued_doc() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_next_queued_doc() TO service_role;
```

Three Storage RLS policies (applied on the `documents` bucket):

```sql
-- Org members can view their org's files
CREATE POLICY "org_members_read_objects" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = current_org_id()::text
  );

-- Org members can upload to their org's folder
CREATE POLICY "org_members_insert_objects" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = current_org_id()::text
  );

-- Only owner/admin can delete files
CREATE POLICY "org_admin_delete_objects" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = current_org_id()::text
    AND (SELECT role FROM users WHERE id = auth.uid()) IN ('owner', 'admin')
  );
```

Path scheme: `<orgId>/<docId>.<ext>` — the first path segment is always the orgId, which the Storage policies use for tenant isolation.

---

### New Dependencies Added in Week 3

No new `pnpm add` commands were run in Week 3. All three processing libraries (`pdf-parse`, `mammoth`, `tiktoken`) were already installed in Week 1. The only package.json change was adding them to `serverExternalPackages` in `next.config.ts` (see Modified Files).

---

### New Files — Zod Schemas

#### `src/lib/schemas/kb.ts`

```ts
export const KB_MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

// Used by /api/kb/upload-url (preflight)
export const kbUploadSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().min(1).max(KB_MAX_FILE_BYTES),
  type: z.enum(["pdf", "docx"]),
});

// Used by POST /api/kb/docs (after upload completes)
export const kbDocsPostSchema = z.object({
  docId: z.string().min(1),
  name: z.string().min(1).max(255),
  size: z.number().int().min(1).max(KB_MAX_FILE_BYTES),
  type: z.enum(["pdf", "docx"]),
  path: z.string().min(1),
});

// Used by POST /api/kb/search
export const kbSearchSchema = z.object({
  query: z.string().min(1).max(1000),
});
```

---

### New Files — Lib Helpers

#### `src/lib/kb/storage.ts`

Uses `createClient` from `@supabase/supabase-js` directly (not the SSR cookie client) with `SUPABASE_SERVICE_ROLE_KEY` — this is intentional: Storage operations in the processing pipeline run outside any user request context.

- `signedUploadUrl(orgId, docId, ext)` → `{ uploadUrl: string, path: string }` where `path = "${orgId}/${docId}.${ext}"`. Upload URL is valid for 60 seconds. The docId is a UUID generated server-side to prevent path collisions.
- `downloadFile(path)` → `Buffer`. Used by the processor to fetch the raw file bytes.
- `deleteFile(path)` → `void`. Used by `DELETE /api/kb/docs` for Storage cleanup (best-effort; DB cascade handles chunks).

#### `src/lib/kb/parse.ts`

Wraps two extraction libraries:

```ts
// pdf-parse v2 — BREAKING CHANGE from v1: class-based API, not default-export function
import { PDFParse } from "pdf-parse";
export async function parsePdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  await parser.destroy();
  return result.text.replace(/\f/g, " ").trim();
}

// mammoth: straightforward, extractRawText strips all DOCX markup
export async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}
```

`parsePdf` converts the buffer to `Uint8Array` (required by v2), calls `.getText()` (async), calls `.destroy()` to release WASM memory, and strips form-feed characters (`\f`) that pdf-parse emits as page breaks.

#### `src/lib/kb/chunk.ts`

Sliding-window token chunker using tiktoken:

```ts
export async function chunkText(text: string): Promise<Chunk[]> {
  const enc = get_encoding("cl100k_base");
  try {
    const tokens = enc.encode(text);
    const chunks: Chunk[] = [];
    let start = 0;
    while (start < tokens.length) {
      const end = Math.min(start + CHUNK_TOKENS, tokens.length);
      const slice = tokens.slice(start, end);
      if (slice.length >= MIN_CHUNK_TOKENS) {
        chunks.push({
          content: new TextDecoder().decode(enc.decode(slice)),
          tokenCount: slice.length,
          chunkIndex: chunks.length,
        });
      }
      start += CHUNK_TOKENS - OVERLAP_TOKENS;
    }
    return chunks;
  } finally {
    enc.free(); // Release WASM memory
  }
}
```

Constants: `CHUNK_TOKENS = 1000`, `OVERLAP_TOKENS = 200`, `MIN_CHUNK_TOKENS = 50`. Skips trailing fragments under 50 tokens. `enc.free()` is called in a `finally` block to prevent WASM memory leaks in long-running serverless functions.

#### `src/lib/kb/limits.ts`

```ts
export async function assertWithinLimit(
  supabase: SupabaseClient<Database>,
  orgId: string,
  incomingBytes: number,
) {
  const [subResult, usageResult] = await Promise.all([
    supabase.from("subscriptions").select("plan").eq("org_id", orgId).single(),
    supabase
      .from("knowledge_docs")
      .select("file_size_bytes")
      .eq("org_id", orgId)
      .eq("status", "ready"),
  ]);
  const plan = (subResult.data?.plan ?? "free") as Plan;
  const limitBytes = PLAN_LIMITS[plan].storageMb * 1024 * 1024;
  const usedBytes = (usageResult.data ?? []).reduce((s, r) => s + (r.file_size_bytes ?? 0), 0);
  if (usedBytes + incomingBytes > limitBytes) {
    throw new ApiError(
      "limit_reached",
      `Storage limit reached. Used ${formatMb(usedBytes)} of ${formatMb(limitBytes)} MB.`,
      429,
    );
  }
}

export function formatMb(bytes: number): string {
  if (!isFinite(bytes)) return "∞ MB";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

Called twice per upload: once in `upload-url` (preflight, before the file even uploads) and once in `POST /api/kb/docs` (race protection, in case two parallel uploads both passed the first check). Uses `PLAN_LIMITS` from `src/types/index.ts`. Returns `"∞ MB"` for Enterprise plan (whose limit is `Infinity`).

#### `src/lib/kb/process.ts`

Nine-step processing pipeline. Called by `POST /api/kb/process`:

```ts
export async function processDoc(
  docId: string,
  fileType: string,
  orgId: string,
): Promise<void> {
  const supabase = createServiceClient();
  // 1. Fetch file_url from knowledge_docs
  const { data: doc } = await supabase
    .from("knowledge_docs").select("file_url").eq("id", docId).single();
  // 2. Download file bytes from Storage
  const buffer = await downloadFile(doc.file_url);
  // 3. Parse text from PDF or DOCX
  const text = fileType === "pdf" ? await parsePdf(buffer) : await parseDocx(buffer);
  // 4. Chunk into 1000-token windows
  const chunks = await chunkText(text);
  // 5. Embed all chunks in parallel (batched to 100 per OpenAI call)
  const embeddings = await embedBatch(chunks.map((c) => c.content));
  // 6. Idempotency guard: delete any previous chunks for this doc
  await supabase.from("doc_chunks").delete().eq("doc_id", docId);
  // 7. Insert new chunks with embeddings
  const rows = chunks.map((c, i) => ({
    doc_id: docId, org_id: orgId,
    content: c.content, token_count: c.tokenCount,
    chunk_index: c.chunkIndex, embedding: embeddings[i],
  }));
  await supabase.from("doc_chunks").insert(rows);
  // 8. Update doc status to 'ready'
  const { error: updateError } = await supabase
    .from("knowledge_docs").update({ status: "ready" }).eq("id", docId);
  if (updateError) throw updateError;
}
```

On any thrown error, the caller (`/api/kb/process`) catches and updates `status = 'failed'` with `error_message`. The idempotency guard in step 6 ensures retries are safe — chunks are always rebuilt fresh.

---

### New Files — API Routes

#### `src/app/api/kb/upload-url/route.ts`

`POST /api/kb/upload-url` — generates a Supabase Storage signed upload URL.

Flow:
1. `requireRole(["owner", "admin", "member"])`.
2. Validate body with `kbUploadSchema` (name, size, type).
3. `assertWithinLimit(supabase, orgId, body.size)` — preflight limit check; throws `429` if over.
4. Generate `docId = crypto.randomUUID()`.
5. `signedUploadUrl(orgId, docId, body.type)` → `{ uploadUrl, path }`.
6. Return `ok({ uploadUrl, path, docId })`.

The client uses this URL to PUT the file directly to Supabase Storage, then calls `POST /api/kb/docs` with the returned `{ docId, path }` to register the document.

#### `src/app/api/kb/docs/route.ts`

Three methods:

**`GET /api/kb/docs`** — returns all documents for this org, ordered newest first.
```ts
.select("id, name, file_type, file_size_bytes, file_url, status, error_message, created_at")
.eq("org_id", orgId)
.order("created_at", { ascending: false })
```

**`POST /api/kb/docs`** — registers a document and triggers processing.
1. Validate body with `kbDocsPostSchema`.
2. `assertWithinLimit(supabase, orgId, body.size)` — race protection recheck.
3. Insert into `knowledge_docs` with `status: "queued"`.
4. Use `after(async () => { fetch /api/kb/process })` from `next/server` to trigger the processor after the response is flushed. `after()` keeps the serverless function alive long enough for the internal fetch to execute.
5. Return `ok({ doc })`.

**`DELETE /api/kb/docs?id=<uuid>`** — removes a document.
1. `requireRole(["owner", "admin"])`.
2. Fetch `file_url` to use for Storage cleanup.
3. DELETE the `knowledge_docs` row (cascades to `doc_chunks` via FK).
4. Best-effort `deleteFile(doc.file_url)` — logs error but doesn't fail the request.

#### `src/app/api/kb/docs/[id]/route.ts`

**`POST /api/kb/docs/[id]`** — retry a failed document (body: `{ action: "retry" }`).
1. `requireRole(["owner", "admin", "member"])`.
2. Validate body with `retrySchema`.
3. UPDATE `knowledge_docs SET status='queued', error_message=null WHERE id=? AND org_id=? AND status='failed'`.
4. Use `after(async () => { fetch /api/kb/process })` to re-trigger the processor.
5. Return `ok(null)`.

The `AND status='failed'` guard means idempotent retries on non-failed docs are silently ignored.

#### `src/app/api/kb/docs/[id]/download/route.ts`

**`GET /api/kb/docs/[id]/download`** — returns a 60-second signed download URL.
1. `requireRole(["owner", "admin", "member"])`.
2. Fetch `file_url` from DB, verifying `org_id` matches (defense in depth beyond RLS).
3. `supabase.storage.from("documents").createSignedUrl(doc.file_url, 60)`.
4. Return `ok({ url })`.

Client opens the signed URL in a new tab to trigger the browser's download dialog.

#### `src/app/api/kb/process/route.ts`

**`POST /api/kb/process`** — dequeues and processes one document. Bearer `CRON_SECRET` auth required.

```ts
export const POST = async (req: Request) => {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return fail("unauthorized", ..., 401);

  const supabase = createServiceClient();
  const { data: claimed } = await supabase.rpc("claim_next_queued_doc");
  if (!claimed?.length) return ok({ processed: null }); // Queue empty

  const { id, file_type, org_id } = claimed[0];
  try {
    await processDoc(id, file_type, org_id);
    return ok({ processed: id });
  } catch (err) {
    await supabase
      .from("knowledge_docs")
      .update({ status: "failed", error_message: String(err) })
      .eq("id", id);
    return ok({ processed: null });
  }
};
```

Returns `{ processed: <id> }` on success, `{ processed: null }` on empty queue or error. The cron loop uses `processed: null` as the stop signal.

#### `src/app/api/cron/process-kb/route.ts`

**`GET /api/cron/process-kb`** — Vercel cron endpoint. Runs every minute (see `vercel.json`).

```ts
for (let i = 0; i < 5; i++) {
  try {
    const res = await fetch(`${appUrl}/api/kb/process`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    if (!res.ok) { console.error(`[cron] process call returned ${res.status}`); break; }
    const body = (await res.json()) as { data: { processed: string | null } };
    if (!body.data?.processed) break;
    count += 1;
  } catch (err) {
    console.error("[cron] process call failed", err);
    break;
  }
}
return ok({ processed: count });
```

Loops up to 5 times, processing one document per iteration. Breaks early on empty queue (`processed: null`), non-2xx response, or thrown error. Kept well under Vercel's 60-second cron limit. The `after()` trigger in `POST /api/kb/docs` is the primary mechanism; the cron is a safety net for any dropped triggers.

#### `src/app/api/kb/search/route.ts`

**`POST /api/kb/search`** — semantic search over this org's KB chunks. Restricted to owner/admin.

1. `requireRole(["owner", "admin"])`.
2. Validate body with `kbSearchSchema`.
3. `embedText(body.query)` → 1536-dim vector.
4. `supabase.rpc("match_doc_chunks", { query_embedding, match_count: 5 })` → top-5 chunks with similarity scores.
5. Fetch doc names for each unique `doc_id` in one query.
6. Return enriched results (chunk content + similarity + doc name).

Used by the debug search page (`/kb/search`). Not in the main user flow — exposes raw KB retrieval for operators to validate embedding quality.

---

### New Files — UI Components

#### `src/app/(dashboard)/kb/page.tsx`

Server component. Reads session → `users(org_id, role)` → `knowledge_docs` (all columns) → `subscriptions(plan)`. Passes docs and `storageLimitMb` to `<KbClient>`. Renders:
- `<h1>Knowledge Base</h1>` with description.
- `<UsageMeter>` (hidden for Enterprise/Infinity plans).
- `<KbClient docs={docs} storageLimitMb={storageLimitMb} canManage={role !== "member"} />`.
- "Debug retrieval" link (`/kb/search`) shown to owner/admin only.

#### `src/app/(dashboard)/kb/UsageMeter.tsx`

Client component. Props: `usedBytes: number`, `limitMb: number`. Returns `null` if `limitMb === Infinity` (Enterprise). Calculates `pct = usedBytes / (limitMb * 1024 * 1024) * 100`. Renders a progress bar and `"X.X MB used of Y MB"` label. Bar turns red (`bg-red-500`) at ≥90% usage as a visual warning.

#### `src/app/(dashboard)/kb/KbClient.tsx`

Client component (`"use client"`). Owns the `docs` state array. Polls `GET /api/kb/docs` every 2 seconds while any document has `status === "queued"` or `status === "processing"`. Stops polling when all docs are settled.

Exposes three callbacks:
- `handleUploaded(doc)` — appends new doc to state and starts polling.
- `handleRetried(id)` — sets `status: "queued"` on the matching doc and starts polling.
- `handleDeleted(id)` — removes doc from state.

Renders `<DropZone onUploaded={handleUploaded} />` and `<DocsTable docs={docs} onRetried={handleRetried} onDeleted={handleDeleted} canManage={canManage} />`.

#### `src/app/(dashboard)/kb/DropZone.tsx`

Client component. Handles multi-file drag-and-drop and click-to-upload with a 3-wide concurrency semaphore.

Key implementation detail — uses **function declarations** (not `useCallback`) for `processQueue` and `enqueue` so they are hoisted and can reference each other recursively:

```ts
function processQueue() {
  while (semaphore.current < MAX_CONCURRENT && queue.current.length > 0) {
    semaphore.current += 1;
    const file = queue.current.shift()!;
    uploadFile(file).finally(() => {
      semaphore.current -= 1;
      processQueue(); // recursive call — safe because function declarations are hoisted
    });
  }
}

function enqueue(files: File[]) {
  const valid = files.filter(validate);
  queue.current.push(...valid);
  processQueue();
}
```

Client-side validation: rejects files >25 MB or with type other than `pdf`/`docx`. Upload sequence per file: `POST /api/kb/upload-url` → PUT to signed URL → `POST /api/kb/docs` → `onUploaded(doc)`.

#### `src/app/(dashboard)/kb/DocsTable.tsx`

Client component. Renders a `<Table>` with one row per document.

Status badge colors:
- `queued` → gray (`bg-gray-100 text-gray-700`)
- `processing` → blue (`bg-blue-100 text-blue-700`)
- `ready` → green (`bg-green-100 text-green-700`)
- `failed` → red (`bg-red-100 text-red-700`)

Row actions (right-aligned, conditional):
- **Retry** — shown only for `status === "failed"` docs. Calls `POST /api/kb/docs/{id}` with `{ action: "retry" }`, then `onRetried(id)`.
- **Download** — shown only for `status === "ready"` docs. Calls `GET /api/kb/docs/{id}/download`, opens `data.url` in a new tab.
- **Delete** — shown only if `canManage`. Opens a confirmation `<Dialog>` before calling `DELETE /api/kb/docs?id={id}`, then `onDeleted(id)`.
- **Details** — shown only for `status === "failed"` docs that have an `error_message`. Toggles an expandable row section showing the raw error.

#### `src/app/(dashboard)/kb/search/page.tsx`

Server component. Reads session → `users(role)`. Redirects to `/kb` if `role === "member"` (debug search is owner/admin only). Renders `<SearchForm />`.

#### `src/app/(dashboard)/kb/search/SearchForm.tsx`

Client component. Textarea for query input + Search button. On submit: `POST /api/kb/search`. Renders results as a list: doc name + similarity bar (percentage filled using `similarity * 100`) + content excerpt (first 500 characters). Shows "No results found" if the array is empty.

---

### Modified Files

#### `src/types/database.ts`

Replaced `Functions: Record<never, never>` with typed function definitions to enable type-safe `supabase.rpc()` calls:

```ts
Functions: {
  match_doc_chunks: {
    Args: { query_embedding: number[]; match_count?: number };
    Returns: Array<{
      id: string; doc_id: string; content: string;
      token_count: number; chunk_index: number; similarity: number;
    }>;
  };
  claim_next_queued_doc: {
    Args: Record<PropertyKey, never>;
    Returns: Array<{ id: string; file_type: string; org_id: string }>;
  };
  current_org_id: {
    Args: Record<PropertyKey, never>;
    Returns: string;
  };
};
```

#### `src/lib/ai/embeddings.ts`

Replaced top-level `const openai = new OpenAI(...)` with lazy initialization to fix a build-time error:

```ts
// Before (broken at build time):
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// After (lazy — only instantiated on first real call):
let cachedClient: OpenAI | null = null;
function getClient(): OpenAI {
  if (!cachedClient) cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return cachedClient;
}
```

**Why:** During `next build`, Next.js evaluates module code to collect page data. When `OPENAI_API_KEY` is not set in the build environment, `new OpenAI({ apiKey: undefined })` throws immediately at module import time, aborting the build before any route is even compiled.

#### `src/lib/ai/generate.ts`

Same lazy initialization pattern applied to the Anthropic client:

```ts
let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (!cachedClient) cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cachedClient;
}
```

#### `next.config.ts`

Added `serverExternalPackages` to prevent Turbopack from bundling WASM-dependent libraries:

```ts
const nextConfig: NextConfig = {
  serverExternalPackages: ["tiktoken", "pdf-parse", "mammoth"],
};
```

**Why:** Turbopack (used by `next dev` and `next build`) tried to bundle `tiktoken` into the route chunk, which broke WASM loading because the `.wasm` file path resolution relies on Node.js module resolution, not Webpack's asset pipeline. Same issue applies to `pdf-parse` and `mammoth` which both have native bindings. `serverExternalPackages` tells Next.js to keep these as external Node modules.

#### `src/app/(dashboard)/dashboard/page.tsx`

- Added "Knowledge Base" as the primary CTA button (`href="/kb"`).
- Demoted "Organization settings" and "Invite teammates" to outline variant.
- Updated placeholder description text to reflect the KB module being live.

#### `vercel.json` (new file)

```json
{
  "crons": [
    {
      "path": "/api/cron/process-kb",
      "schedule": "* * * * *"
    }
  ]
}
```

Runs the KB processing cron every minute on Vercel. Vercel cron invocations are GET requests; the route validates the `Authorization: Bearer <CRON_SECRET>` header.

#### `.env.example` (updated)

Added `CRON_SECRET=changeme`. Required by both `/api/kb/process` and `/api/cron/process-kb`. Should be set to a long random string in production.

---

### Bugs Fixed During Week 3

#### Bug 1 — pdf-parse v2 breaking API change

pdf-parse v2 (installed in Week 1) exports a `PDFParse` **class**, not a default-export function. The v1 API `const text = await pdfParse(buffer)` throws `TypeError: pdfParse is not a function` at runtime.

**Fix** (`a982f2e`): Switched to the v2 class-based API:
```ts
// Before (v1 API — broken with v2 package):
import pdfParse from "pdf-parse";
const data = await pdfParse(buffer);
return data.text;

// After (v2 API):
import { PDFParse } from "pdf-parse";
const parser = new PDFParse({ data: new Uint8Array(buffer) });
const result = await parser.getText();
await parser.destroy();
return result.text.replace(/\f/g, " ").trim();
```

#### Bug 2 — processDoc missing error guard on final UPDATE

The initial `processDoc` implementation called `supabase.from("knowledge_docs").update({ status: "ready" })` without checking the return value. If this UPDATE failed (network error, RLS rejection), the doc would be permanently stuck in `status = 'processing'` state with chunks already inserted — invisible to the cron and unable to be retried by the user.

**Fix** (`cb08a9f`):
```ts
const { error: updateError } = await supabase
  .from("knowledge_docs").update({ status: "ready" }).eq("id", docId);
if (updateError) throw updateError;
```
Throwing causes the process route to catch the error and set `status = 'failed'`, making it visible and retryable.

#### Bug 3 — DropZone React Compiler "access before declaration" error

`const processQueue = useCallback(() => { ... processQueue(); ... }, [])` — the recursive self-call inside the `.finally()` callback caused a `react-hooks/immutability` lint error: `Cannot access 'processQueue' before initialization`. `const` bindings are not hoisted; at the point `useCallback`'s closure is created, `processQueue` is in the temporal dead zone.

**Fix** (`f751e19`): Changed `processQueue` and `enqueue` from `useCallback` arrow functions to plain **function declarations**. Function declarations are hoisted to the top of their enclosing scope, making the recursive self-reference safe:
```ts
// Before (broken):
const processQueue = useCallback(() => { ... processQueue(); ... }, []);

// After (works — function declaration is hoisted):
function processQueue() { ... processQueue(); ... }
```

#### Bug 4 — Build failure: SDK instantiation at module top-level

```
Error: Next.js build failed — Cannot read properties of undefined (reading 'apiKey')
```

Both `src/lib/ai/embeddings.ts` and `src/lib/ai/generate.ts` instantiated their SDK clients at module top-level. During `next build`, Next.js imports these modules to collect page metadata. When `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` are not set in the build environment (CI, Vercel preview builds without env vars), the constructors throw immediately.

**Fix** (`f751e19`): Lazy initialization pattern with a module-level cache variable. The SDK constructor is only called on the first actual API call, which happens at runtime when env vars are available. See Modified Files above for exact code.

#### Bug 5 — Build failure: tiktoken WASM file not found

```
Error: Missing tiktoken_bg.wasm
```

Turbopack attempted to bundle `tiktoken` (and its WASM binary) into the route chunk. WASM loading in a bundled context requires special Webpack/Turbopack configuration that was not present; tiktoken relies on Node.js module resolution to find `tiktoken_bg.wasm`.

**Fix** (`f751e19`): `serverExternalPackages: ["tiktoken", "pdf-parse", "mammoth"]` in `next.config.ts`. These packages are kept as external Node modules and loaded via `require()` at runtime, bypassing Turbopack's bundler entirely.

#### Bug 6 — Fire-and-forget fetch unreliable on Vercel

The initial `POST /api/kb/docs` and retry route used a plain fire-and-forget `.catch(() => {})` pattern to trigger the processor after sending the response. On Vercel serverless, the function runtime is frozen immediately after `return` — any async work that hasn't been awaited is silently dropped.

**Fix** (`b29cecd`): Wrapped the trigger fetch in `after(async () => { ... })` from `next/server`. `after()` is specifically designed for post-response work on Vercel — it registers a callback that Vercel keeps the function alive for, separate from the response lifecycle.

```ts
// Before (dropped on Vercel):
fetch(`${appUrl}/api/kb/process`, { ... }).catch(() => {});
return ok({ doc });

// After (reliable):
after(async () => {
  try {
    await fetch(`${appUrl}/api/kb/process`, { ... });
  } catch (err) {
    console.error("[docs.post] process trigger failed", err);
  }
});
return ok({ doc });
```

#### Bug 7 — Cron loop silent failure on non-2xx response

The initial cron loop called `await res.json()` without first checking `res.ok`. A non-200 response (e.g., 500 from the process route) has a different JSON shape — the destructure `body.data?.processed` would be `undefined`, which matches the empty-queue stop condition. The cron would silently stop after one error instead of logging it.

**Fix** (`b29cecd`): Added per-iteration try/catch and explicit `res.ok` check before JSON parsing:
```ts
if (!res.ok) {
  console.error(`[cron] process call returned ${res.status}`);
  break;
}
```

---

### Architecture Decisions

| Decision | Reason |
|---|---|
| Two-phase upload (signed URL → register) | Files never touch the Next.js server process. Client PUTs directly to Supabase Storage, then calls the API to register the DB row. Keeps memory usage low and avoids multipart form parsing. |
| `FOR UPDATE SKIP LOCKED` in `claim_next_queued_doc` | Two concurrent cron ticks (possible with 1-minute schedule + slow processing) cannot claim the same document. The `SKIP LOCKED` strategy returns immediately instead of waiting, matching queue-drain semantics. |
| Idempotency guard (`DELETE doc_chunks WHERE doc_id=?` before INSERT) | Retries rebuild the chunk set from scratch. Without this, a partial first run would leave orphaned chunks alongside the new set, corrupting similarity search results. |
| `after()` instead of fire-and-forget fetch | Vercel freezes serverless functions immediately after `return`. `after()` is the supported mechanism for post-response async work — it registers the callback with Vercel's infrastructure so it runs to completion. |
| Cron as safety net, `after()` as primary trigger | `after()` processes documents within seconds of upload. The cron catches any dropped triggers (deploy restarts, cold starts, transient errors). Both mechanisms call the same idempotent `/api/kb/process` endpoint. |
| `security definer` on `claim_next_queued_doc`, `security invoker` on `match_doc_chunks` | The cron runs as service_role (no auth context) — it cannot call `security invoker` functions that depend on `auth.uid()`. Conversely, `match_doc_chunks` must run as the caller so it inherits RLS and automatically filters to the current org. |
| `REVOKE ... FROM PUBLIC` on `claim_next_queued_doc` | `security definer` functions run with elevated privileges. Restricting execution to `service_role` only prevents any authenticated user from invoking it and claiming (and stalling) documents from other orgs. |
| Lazy SDK initialization | `next build` evaluates module code for page-data collection. Top-level SDK constructors throw when API keys are absent (CI/staging). Lazy init defers construction to first actual call at runtime. |
| `serverExternalPackages` for tiktoken/pdf-parse/mammoth | All three have WASM or native bindings that cannot be bundled by Turbopack. Marking them external forces Node.js require() resolution at runtime, which correctly locates the binary assets. |
| 3-wide upload semaphore (not unlimited, not 1) | Unlimited parallel uploads can exhaust signed-URL TTLs and create a thundering-herd on the process queue. Sequential (1 at a time) is too slow for bulk uploads. 3 is a balanced default matching common browser connection limits. |
| Function declarations over `useCallback` for recursive queue functions | `const` bindings are not hoisted — recursive `useCallback` closures reference the variable before it is initialized. Function declarations are hoisted, making self-reference safe. This is a React Compiler strict-mode requirement. |
| Plan limit checked at two points | The `upload-url` preflight stops obviously-over-limit uploads before the client wastes bandwidth. The `POST /api/kb/docs` recheck handles the race where two uploads started simultaneously and both passed the first check. |

---

### Complete Route Table (Week 3 — new routes only)

| Method | Route | File | Minimum role |
|---|---|---|---|
| POST | `/api/kb/upload-url` | `src/app/api/kb/upload-url/route.ts` | Member |
| GET | `/api/kb/docs` | `src/app/api/kb/docs/route.ts` | Member |
| POST | `/api/kb/docs` | `src/app/api/kb/docs/route.ts` | Member |
| DELETE | `/api/kb/docs` | `src/app/api/kb/docs/route.ts` | Owner / Admin |
| POST | `/api/kb/docs/[id]` | `src/app/api/kb/docs/[id]/route.ts` | Member |
| GET | `/api/kb/docs/[id]/download` | `src/app/api/kb/docs/[id]/download/route.ts` | Member |
| POST | `/api/kb/process` | `src/app/api/kb/process/route.ts` | CRON_SECRET |
| GET | `/api/cron/process-kb` | `src/app/api/cron/process-kb/route.ts` | CRON_SECRET |
| POST | `/api/kb/search` | `src/app/api/kb/search/route.ts` | Owner / Admin |
| GET | `/kb` | `src/app/(dashboard)/kb/page.tsx` | Member |
| GET | `/kb/search` | `src/app/(dashboard)/kb/search/page.tsx` | Owner / Admin |

---

### Complete File Index — Week 3

**Created:**
- `supabase/migrations/003_kb_storage.sql`
- `src/lib/schemas/kb.ts`
- `src/lib/kb/storage.ts`
- `src/lib/kb/parse.ts`
- `src/lib/kb/chunk.ts`
- `src/lib/kb/limits.ts`
- `src/lib/kb/process.ts`
- `src/app/api/kb/upload-url/route.ts`
- `src/app/api/kb/docs/route.ts`
- `src/app/api/kb/docs/[id]/route.ts`
- `src/app/api/kb/docs/[id]/download/route.ts`
- `src/app/api/kb/process/route.ts`
- `src/app/api/cron/process-kb/route.ts`
- `src/app/api/kb/search/route.ts`
- `src/app/(dashboard)/kb/page.tsx`
- `src/app/(dashboard)/kb/UsageMeter.tsx`
- `src/app/(dashboard)/kb/KbClient.tsx`
- `src/app/(dashboard)/kb/DropZone.tsx`
- `src/app/(dashboard)/kb/DocsTable.tsx`
- `src/app/(dashboard)/kb/search/page.tsx`
- `src/app/(dashboard)/kb/search/SearchForm.tsx`
- `vercel.json`

**Modified:**
- `src/types/database.ts` — added `match_doc_chunks`, `claim_next_queued_doc`, `current_org_id` function types
- `src/lib/ai/embeddings.ts` — lazy OpenAI client initialization
- `src/lib/ai/generate.ts` — lazy Anthropic client initialization
- `next.config.ts` — added `serverExternalPackages` for WASM libraries
- `src/app/(dashboard)/dashboard/page.tsx` — added KB link, updated CTAs
- `.env.example` — added `CRON_SECRET`

---

### Manual Setup Steps (Week 3)

These steps must be completed manually; they are not automated by the codebase:

1. **Apply migration** — run `003_kb_storage.sql` in the Supabase SQL Editor (project > SQL Editor > New query).
2. **Create Storage bucket** — in Supabase Studio go to Storage → New bucket → name it `documents` → set to **Private** (not public).
3. **Apply Storage RLS policies** — run the three `CREATE POLICY` statements from the migration file in the SQL Editor against `storage.objects`.
4. **Set `CRON_SECRET`** — add a long random string (e.g., `openssl rand -hex 32`) to `.env.local` and to Vercel environment variables. Without this, both the cron and the internal process trigger will return 401.

---

### New Environment Variables (Week 3)

| Variable | Used by | Notes |
|---|---|---|
| `CRON_SECRET` | `src/app/api/kb/process/route.ts`, `src/app/api/cron/process-kb/route.ts` | Required. Any string, but should be a long random value in production. Set in both `.env.local` and Vercel dashboard. |

All other variables used in Week 3 (`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`) were already required in previous weeks.

---

### Open Issues / Deferred Items

| Item | Deferred to |
|---|---|
| Playwright/Vitest integration tests for KB flows | Later sprint (user decision) |
| Streaming upload progress bar in DropZone | Currently shows a spinner per file; byte-level progress would require `XMLHttpRequest` instead of `fetch`. Deferred. |
| Full-document re-indexing on org plan upgrade | Currently only new uploads are indexed. Documents uploaded under a lower storage limit are not re-indexed when the plan upgrades. Deferred to billing/admin tooling. |

---

*Next: Week 4 — RFP Projects module*

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
