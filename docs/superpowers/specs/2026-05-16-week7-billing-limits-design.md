# Week 7: Billing & Limits — Design Spec

## Overview

Add Stripe-backed subscription management, per-plan quota enforcement, and a billing settings page to PropelRFP. New orgs start on a permanent free plan. Paid plans are gated via Stripe Checkout. Quota limits block at the API layer and surface an upgrade modal to the user.

---

## Plans & Limits

| Plan | Price | Proposals | Storage | Members |
|------|-------|-----------|---------|---------|
| Free | $0 | 3 | 250 MB | 1 |
| Starter | $299/mo | 10 | 500 MB | 1 |
| Growth | $599/mo | ∞ | 5 GB | 5 |
| Enterprise | custom | ∞ | custom | custom |

- Free plan is permanent (no trial expiry).
- Enterprise is sales-led — `plan = "enterprise"` set manually in DB, no Stripe involvement.
- `PLAN_LIMITS` constant in `src/lib/billing/limits.ts` maps plan name → `{ proposals, storage_bytes, members }`. Free plan added; Growth and Enterprise use `Infinity`.

---

## Data Model

### `subscriptions` table (existing)

Already has: `org_id`, `plan`, `status`, `stripe_customer_id`, `stripe_subscription_id`, `current_period_end`.

No migration needed for this table.

### `knowledge_docs` table

Add column: `file_size_bytes BIGINT NOT NULL DEFAULT 0`

Set on upload (from the multipart request `Content-Length` or computed after write). Used for `SUM(file_size_bytes)` storage quota checks.

### Free plan auto-provisioning

`POST /api/org` (org creation route) inserts a `subscriptions` row immediately after org creation:

```ts
{
  org_id: newOrg.id,
  plan: "free",
  status: "active",
  stripe_customer_id: null,
  stripe_subscription_id: null,
  current_period_end: null,
}
```

---

## Quota Enforcement

### Utility: `src/lib/billing/quota.ts`

```ts
export type QuotaType = "proposals" | "storage" | "members";

export interface QuotaResult {
  allowed: boolean;
  current: number;
  limit: number;
  plan: string;
}

export async function checkQuota(
  supabase: SupabaseClient,
  orgId: string,
  type: QuotaType,
  extraBytes?: number
): Promise<QuotaResult>
```

- Reads `subscriptions` for the org's plan.
- `proposals`: counts `rfp_projects` where `org_id = orgId AND status != 'lost'`.
- `storage`: sums `knowledge_docs.file_size_bytes` where `org_id = orgId`, adds `extraBytes ?? 0`.
- `members`: counts `users` where `org_id = orgId`.
- Returns `{ allowed, current, limit, plan }`.

### Enforcement points

All return `402` on quota exceeded:

```ts
// Response shape
{ data: null, error: { code: "QUOTA_EXCEEDED", limit_type: QuotaType, current: number, limit: number, plan: string } }
```

| Route | Type | Check |
|-------|------|-------|
| `POST /api/projects` | proposals | before insert |
| `POST /api/kb/upload` | storage | before accepting file, pass file size as `extraBytes` |
| `POST /api/org/invite` | members | before sending invite |

---

## Billing API Routes

### `GET /api/billing/subscription`

Returns current subscription state + computed usage. Requires any authenticated user in the org.

```ts
// Response
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

### `POST /api/billing/checkout`

Requires `owner` or `admin` role. Body: `{ price_id: string }`.

Creates Stripe Checkout Session (mode: `"subscription"`):
- `success_url`: `/settings/billing?session_id={CHECKOUT_SESSION_ID}`
- `cancel_url`: `/settings/billing?canceled=1`
- Attaches or creates `stripe_customer_id` on the org's subscription record.

Returns `{ data: { url: string }, error: null }`. Client redirects to `url`.

### `POST /api/billing/portal`

Requires `owner` or `admin` role. No body.

Creates Stripe Customer Portal Session using the org's `stripe_customer_id`. Returns `{ data: { url: string }, error: null }`. Client redirects to `url`.

### `POST /api/billing/webhook`

Raw body route (`req.text()`). Wires the existing `verifyWebhookSignature()` + `handleSubscriptionUpsert()` + `handleSubscriptionDeleted()` from `src/lib/stripe/webhooks.ts` to an HTTP route.

Handles:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Returns `200 { received: true }` on success. App Router route handlers do not auto-parse the body, so `req.text()` works directly — no special config needed.

---

## Billing Settings Page (`/settings/billing`)

Server component at `src/app/(dashboard)/settings/billing/page.tsx`.

Fetches subscription + usage on the server. Passes to client sub-components.

### Usage cards (top section)

Three cards in a row: Proposals, Storage, Members. Each shows:
- Large current value / limit (e.g., `1 / 3`)
- Label
- Progress bar

Card turns amber (border + progress bar color) when `current >= limit`. Enterprise plan shows `∞` as limit with no progress bar.

### Plan tiles (bottom section, conditional by plan)

**Free user:**
- Starter tile: blue highlighted border, `$299/mo`, feature summary, "Subscribe" button
- Growth tile: default border, `$599/mo`, feature summary, "Subscribe" button

**Starter user:**
- "Manage subscription →" text link (calls `POST /api/billing/portal`, redirects)
- Growth upgrade tile with "Upgrade" button

**Growth user:**
- "Manage subscription →" text link (calls `POST /api/billing/portal`, redirects)
- "Need more? Contact us for Enterprise →" link

**Enterprise user:**
- Usage cards only
- "Contact your account manager to make changes" note

### Post-checkout feedback

- `?session_id=...` in URL → success toast: "Subscription activated!"
- `?canceled=1` in URL → neutral toast: "Checkout canceled."
- Both read via `useSearchParams` in a client sub-component; URL params cleared after toast.

---

## Upgrade Modal

`src/components/UpgradeModal.tsx` — shadcn `<Dialog>`.

State managed by a Zustand store (`src/lib/billing/upgrade-modal-store.ts`):

```ts
interface UpgradeModalState {
  open: boolean;
  limitType: QuotaType | null;
  current: number;
  limit: number;
  plan: string;
  openModal: (opts: { limitType: QuotaType; current: number; limit: number; plan: string }) => void;
  closeModal: () => void;
}
```

Modal content:
- Heading: "You've reached your [proposals / storage / team member] limit"
- Body: "Your [plan] plan includes [limit]. You're currently using [current]."
- Primary CTA: "Upgrade plan" → navigates to `/settings/billing`
- Secondary: "Dismiss"

### `handleApiError` utility (`src/lib/api/handle-error.ts`)

```ts
export async function handleApiError(res: Response, upgradeModal: UpgradeModalState): Promise<void>
```

Called after any `fetch` in client code when `!res.ok`. If status is `402` and `error.code === "QUOTA_EXCEEDED"`, calls `upgradeModal.openModal(...)`. Otherwise, throws or toasts the generic error message.

`<UpgradeModal>` is mounted once in the dashboard layout so it's available everywhere.

---

## Files Created / Modified

| File | Action |
|------|--------|
| `supabase/migrations/20260516_add_file_size_bytes.sql` | Create — adds `file_size_bytes` to `knowledge_docs` |
| `src/lib/billing/limits.ts` | Modify — add `free` plan to `PLAN_LIMITS` |
| `src/lib/billing/quota.ts` | Create — `checkQuota` utility |
| `src/lib/billing/upgrade-modal-store.ts` | Create — Zustand store |
| `src/lib/api/handle-error.ts` | Create — `handleApiError` utility |
| `src/app/api/billing/subscription/route.ts` | Create |
| `src/app/api/billing/checkout/route.ts` | Create |
| `src/app/api/billing/portal/route.ts` | Create |
| `src/app/api/billing/webhook/route.ts` | Create — wires existing `webhooks.ts` |
| `src/app/api/projects/route.ts` | Modify — add quota check |
| `src/app/api/kb/upload/route.ts` | Modify — add quota check + set `file_size_bytes` |
| `src/app/api/org/invite/route.ts` | Modify — add quota check |
| `src/app/api/org/route.ts` | Modify — auto-provision free subscription |
| `src/app/(dashboard)/settings/billing/page.tsx` | Create — server component |
| `src/app/(dashboard)/settings/billing/UsageCards.tsx` | Create — client component |
| `src/app/(dashboard)/settings/billing/PlanTiles.tsx` | Create — client component |
| `src/app/(dashboard)/settings/billing/CheckoutFeedback.tsx` | Create — reads search params, shows toast |
| `src/components/UpgradeModal.tsx` | Create |
| `src/app/(dashboard)/layout.tsx` | Modify — mount `<UpgradeModal>` |
| `src/app/(dashboard)/settings/layout.tsx` (or nav component) | Modify — enable the billing tab (currently disabled) |

---

## Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Storage tracking | `file_size_bytes` column on `knowledge_docs` | No external API call needed; accurate per-doc |
| Quota check timing | Per-request DB read | MVP traffic; no Redis needed |
| Enterprise billing | Manual DB entry, no Stripe | Sales-led, no self-serve needed |
| Upgrade modal trigger | Shared `handleApiError` utility | Any component gets quota blocking for free |
| Portal vs custom cancel UI | Stripe Customer Portal | No custom cancel/payment UI to build |
| Free plan provisioning | Auto on org creation | Subscription record always exists; quota checks never null-check plan |
