# Week 8: UAT & Launch — Design Spec

## Overview

Harden PropelRFP for production release. No new features — this week removes code quality violations, adds loading UX, wires up observability, fixes a build-time Stripe initialization issue, and prepares for deployment. Scope: code fixes, loading skeletons, page metadata, Vercel Analytics, Stripe client robustness, and deployment checklist.

---

## Goals

1. **Zero console violations** — remove all `console.error` / `console.log` calls from production code (per coding conventions).
2. **Loading UX** — add `loading.tsx` Suspense boundaries so route transitions show skeleton UI instead of a blank screen.
3. **SEO & Tab Titles** — every dashboard page gets a `<title>` via Next.js Metadata API with `"%s | PropelRFP"` template.
4. **Observability** — add `@vercel/analytics` for page-view and Web Vitals tracking in production.
5. **Build robustness** — Stripe client must not throw at import time when env vars are missing (e.g., during `pnpm build` in CI without secrets).
6. **Production deploy** — merge to `main`, apply DB migrations, register Stripe webhook, configure Resend domain, tag `v1.0.0`.

---

## Code Changes

### 1. Console Violation Fixes

**Files affected:**
- `src/app/(dashboard)/error.tsx`
- `src/app/api/cron/process-kb/route.ts`
- `src/app/api/kb/process/route.ts`

**Approach:** Remove all `console.error(...)` calls. The error boundary shows an error digest to the user instead. Server routes silently return structured error responses — external error tracking (Sentry, Vercel Logs) captures unhandled exceptions automatically. Additionally fix `kb/process/route.ts` to return `{ processed: null }` on failure instead of `{ processed: doc.id }` which was a false-positive bug causing the cron to count failed docs as successes.

---

### 2. Loading Skeletons

**New files (all exported as default React components):**
- `src/app/(dashboard)/loading.tsx` — 4-column stat cards + 5-row list skeleton
- `src/app/(dashboard)/kb/loading.tsx` — heading + progress bar + upload zone + doc list
- `src/app/(dashboard)/projects/loading.tsx` — heading + button + 6-row list
- `src/app/(dashboard)/projects/[id]/loading.tsx` — sidebar + editor area two-column layout
- `src/app/(dashboard)/settings/billing/loading.tsx` — heading + 3 usage cards + 3 plan tiles

**Pattern:** Pure Tailwind `animate-pulse` on `bg-gray-200` divs. No dependencies on shadcn/ui `<Skeleton>` (which is not installed). Each skeleton mirrors the page's DOM structure to minimize cumulative layout shift (CLS).

---

### 3. Page Metadata

**Root layout change:**

```ts
export const metadata: Metadata = {
  title: {
    default: "PropelRFP — Win more contracts, faster.",
    template: "%s | PropelRFP",
  },
  description: "AI-powered RFP proposal automation...",
};
```

**Per-page metadata (static export):**

| Page | Title |
|------|-------|
| `/dashboard` | "Dashboard" |
| `/kb` | "Knowledge Base" |
| `/projects` | "Proposals" |
| `/settings/billing` | "Billing" |

Browser tab shows e.g. "Dashboard | PropelRFP".

---

### 4. Vercel Analytics

**Package:** `@vercel/analytics` (added to dependencies).

**Integration:** `<Analytics />` component from `@vercel/analytics/react` placed in root `layout.tsx` body, after `<Toaster />`. Automatically tracks page views and Web Vitals. Zero config needed — it detects Vercel deployment environment automatically.

---

### 5. Stripe Client Lazy Initialization

**Problem:** `src/lib/stripe/client.ts` called `new Stripe(process.env.STRIPE_SECRET_KEY!)` at module top-level. During `pnpm build` in CI (where env vars aren't available), this throws because the Stripe SDK validates the key format on construction.

**Solution:** Export a `getStripe()` function that lazily initializes the client on first call, cached in a module-level variable. This defers the Stripe constructor to runtime (when env vars are present) instead of build time.

```ts
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "..." });
  }
  return _stripe;
}
```

All call sites (`webhooks.ts`, `checkout/route.ts`, `portal/route.ts`) updated from `stripe.xxx()` to `getStripe().xxx()`.

---

### 6. .env.example Update

Add `STRIPE_GROWTH_PRICE_ID=price_...` which was introduced in Week 7 but missing from the example file.

---

## Security Audit (Read-Only)

Verified during implementation:
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` never imported in any `"use client"` file.
- Stripe webhook route validates signature before processing events.
- Cron route checks `CRON_SECRET` bearer token as first operation.
- `.gitignore` includes `.env.local`.
- `.env.example` contains only placeholder values.

---

## Production Deployment Checklist

| Step | Detail |
|------|--------|
| Vercel env vars | All 12 vars from `.env.example` set with production (live) values |
| Supabase migration | `supabase db push` against production project (migrations 001–006) |
| Stripe webhook | Register `https://domain/api/billing/webhook` listening for `customer.subscription.*` events |
| Resend domain | DNS verified, sender address matches `sendInvite.ts` |
| Vercel Cron | Confirm `/api/cron/process-kb` runs every minute (requires Pro tier) |
| Merge sequence | `feature/week8-launch` → `develop` → verify staging → `main` → verify production |
| Tag | `v1.0.0` annotated tag on `main` |

---

## Out of Scope

- No new features, modules, or DB migrations.
- No test suite setup (deferred to post-launch iteration).
- No Sentry integration (can be added later — Vercel Logs provide basic error visibility).
- No landing page redesign.
