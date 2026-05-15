# Week 7: Billing & Limits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stripe subscription management, per-plan quota enforcement, and `/settings/billing` page to PropelRFP.

**Architecture:** New orgs get a free plan subscription record inserted at signup. Three API routes handle Stripe Checkout, Customer Portal, and incoming webhooks. Quota is checked in the three existing enforcement routes (proposal creation, KB upload, member invite) and surfaced via a React Context–driven upgrade modal mounted in the dashboard layout.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (PostgreSQL + RLS), Stripe SDK v22 (`stripe@^22.1.0`), React Context (global upgrade modal state — no new package needed), shadcn/ui Dialog, Tailwind v4.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/006_free_plan.sql` | Create | Add `'free'` to subscriptions.plan constraint; change default to `'free'` |
| `src/types/database.ts` | Modify | Add `"free"` to plan union in subscriptions Row/Insert/Update |
| `src/types/index.ts` | Modify | Add `"free"` to `Plan` type; add `free` entry to `PLAN_LIMITS` |
| `src/lib/auth/requireRole.ts` | Modify | Add `extra?: Record<string, unknown>` to `ApiError` |
| `src/lib/api.ts` | Modify | Spread `err.extra` into error response in `withErrorHandling` |
| `src/lib/projects/limits.ts` | Modify | Change proposal quota error to 402 + QUOTA_EXCEEDED shape; fix `Infinity` passed to Postgres |
| `src/lib/kb/limits.ts` | Modify | Change storage quota error to 402 + QUOTA_EXCEEDED shape |
| `src/app/api/org/invitations/route.ts` | Modify | Add member quota check before invite insert |
| `src/app/api/auth/signup/route.ts` | Modify | Insert free subscription record after org + user creation |
| `src/lib/stripe/webhooks.ts` | Modify | Map `price.id` to plan name instead of hardcoding `"starter"` |
| `src/app/api/billing/subscription/route.ts` | Create | GET — current plan + computed usage |
| `src/app/api/billing/checkout/route.ts` | Create | POST — create Stripe Checkout Session |
| `src/app/api/billing/portal/route.ts` | Create | POST — create Stripe Customer Portal Session |
| `src/app/api/billing/webhook/route.ts` | Create | POST — handle Stripe subscription events |
| `src/lib/billing/upgrade-modal-context.tsx` | Create | React Context + Provider for upgrade modal global state |
| `src/lib/billing/handle-error.ts` | Create | `handleApiError` — opens upgrade modal on 402 QUOTA_EXCEEDED |
| `src/components/UpgradeModal.tsx` | Create | shadcn Dialog shown when quota is exceeded |
| `src/app/(dashboard)/layout.tsx` | Modify | Mount `UpgradeModalProvider` + `UpgradeModal` |
| `src/app/(dashboard)/settings/layout.tsx` | Modify | Enable the Billing tab (currently disabled) |
| `src/app/(dashboard)/settings/billing/page.tsx` | Create | Server component — fetch subscription + usage, render page |
| `src/app/(dashboard)/settings/billing/UsageCards.tsx` | Create | Server component — three metric cards with progress bars |
| `src/app/(dashboard)/settings/billing/PlanTiles.tsx` | Create | Client component — plan tiles with Subscribe/Manage buttons |
| `src/app/(dashboard)/settings/billing/CheckoutFeedback.tsx` | Create | Client component — toasts on Stripe return redirects |

---

## Task 1: DB migration — add 'free' plan

**Files:**
- Create: `supabase/migrations/006_free_plan.sql`

**Context:** The `subscriptions.plan` column has a `CHECK (plan IN ('starter','growth','enterprise'))` constraint. We need `'free'` added and the default changed from `'starter'` to `'free'`.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/006_free_plan.sql

-- Widen the plan check constraint to include 'free'
ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_plan_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN ('free', 'starter', 'growth', 'enterprise'));

-- New orgs default to free plan
ALTER TABLE subscriptions ALTER COLUMN plan SET DEFAULT 'free';
```

- [ ] **Step 2: Apply the migration to your local Supabase instance**

```bash
supabase db push
```

Expected: Migration applied with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/006_free_plan.sql
git commit -m "feat: add 'free' plan to subscriptions constraint"
```

---

## Task 2: Update Plan type and PLAN_LIMITS

**Files:**
- Modify: `src/types/database.ts` (lines 74, 86, 98 — the `plan` field in subscriptions Row/Insert/Update)
- Modify: `src/types/index.ts`

**Context:** `database.ts` is the manually maintained Supabase type file. `Plan` type and `PLAN_LIMITS` live in `src/types/index.ts`. The free plan is: 3 proposals, 250 MB storage, 1 user. `knowledge_docs.file_size_bytes` already exists in the DB and types — no migration needed for that column.

- [ ] **Step 1: Update `src/types/database.ts` — add `"free"` to the plan union in all three subscription type shapes**

In `src/types/database.ts`, find the three occurrences of `"starter" | "growth" | "enterprise"` that belong to the `plan` field of the `subscriptions` table (Row, Insert, Update). Change each to:

```ts
plan: "free" | "starter" | "growth" | "enterprise";
```

The three lines are approximately at lines 74, 86, and 98. Apply the same change to all three.

- [ ] **Step 2: Update `src/types/index.ts`**

```ts
export type Plan = "free" | "starter" | "growth" | "enterprise";

export const PLAN_LIMITS = {
  free: { proposals: 3, storageMb: 250, users: 1 },
  starter: { proposals: 10, storageMb: 500, users: 1 },
  growth: { proposals: Infinity, storageMb: 5120, users: 5 },
  enterprise: { proposals: Infinity, storageMb: Infinity, users: Infinity },
} as const;
```

Replace only the existing `Plan` type line and `PLAN_LIMITS` const. Leave everything else unchanged.

- [ ] **Step 3: Verify TypeScript passes**

```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts src/types/index.ts
git commit -m "feat: add free plan to Plan type and PLAN_LIMITS"
```

---

## Task 3: Extend ApiError to carry quota detail

**Files:**
- Modify: `src/lib/auth/requireRole.ts`
- Modify: `src/lib/api.ts`

**Context:** Quota exceeded errors need extra fields (`limit_type`, `current`, `limit`, `plan`) in the response body so the frontend upgrade modal can display specific numbers. The current `ApiError` only carries `code + message`. We add an optional `extra` bag that `withErrorHandling` spreads into the error response.

- [ ] **Step 1: Update `ApiError` in `src/lib/auth/requireRole.ts`**

Replace the existing `ApiError` class:

```ts
export class ApiError extends Error {
  code: string;
  status: number;
  extra?: Record<string, unknown>;
  constructor(
    code: string,
    message: string,
    status: number,
    extra?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}
```

- [ ] **Step 2: Update `withErrorHandling` in `src/lib/api.ts`**

In the `catch` block of `withErrorHandling`, replace the `ApiError` branch:

```ts
if (err instanceof ApiError) {
  return NextResponse.json(
    { data: null, error: { code: err.code, message: err.message, ...err.extra } },
    { status: err.status }
  );
}
```

The full updated `withErrorHandling`:

```ts
export function withErrorHandling(
  handler: (
    req: Request,
    ctx: { params: Promise<Record<string, string>> }
  ) => Promise<NextResponse>
) {
  return async (
    req: Request,
    ctx: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ZodError) {
        const msg = err.issues.map((i) => i.message).join(", ");
        return fail("validation_failed", msg, 400);
      }
      if (err instanceof ApiError) {
        return NextResponse.json(
          { data: null, error: { code: err.code, message: err.message, ...err.extra } },
          { status: err.status }
        );
      }
      console.error("[api] unhandled error", err);
      return ApiErrors.InternalError();
    }
  };
}
```

- [ ] **Step 3: Verify TypeScript passes**

```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/requireRole.ts src/lib/api.ts
git commit -m "feat: extend ApiError with optional extra fields for quota responses"
```

---

## Task 4: Update quota checks to 402 + QUOTA_EXCEEDED; add member limit

**Files:**
- Modify: `src/lib/projects/limits.ts`
- Modify: `src/lib/kb/limits.ts`
- Modify: `src/app/api/org/invitations/route.ts`

**Context:** Existing quota checks throw with status 429 and code `"limit_reached"`. Change to 402 + `"QUOTA_EXCEEDED"` with the extra fields the upgrade modal needs. Also fix a latent bug: `atomicIncrementProposals` passes `limit` to a Postgres `int` parameter — passing `Infinity` (for Growth/Enterprise) would crash. Fix by clamping to `INT_MAX`. Finally, `invitations/route.ts` has no member limit check — add one.

- [ ] **Step 1: Update `src/lib/projects/limits.ts`**

Full file replacement:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { PLAN_LIMITS } from "@/types/index";
import { ApiError } from "@/lib/auth/requireRole";

export async function assertProposalLimit(
  supabase: SupabaseClient<Database>,
  orgId: string
): Promise<number> {
  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("plan, proposals_used")
    .eq("org_id", orgId)
    .single();

  if (error || !sub) {
    throw new ApiError("internal_error", "Could not retrieve subscription", 500);
  }

  const limit =
    PLAN_LIMITS[sub.plan as keyof typeof PLAN_LIMITS]?.proposals ?? 3;

  if (isFinite(limit) && sub.proposals_used >= limit) {
    throw new ApiError(
      "QUOTA_EXCEEDED",
      `Proposal limit reached (${sub.proposals_used}/${limit}). Upgrade to create more proposals.`,
      402,
      {
        limit_type: "proposals",
        current: sub.proposals_used,
        limit,
        plan: sub.plan,
      }
    );
  }

  return limit;
}

export async function atomicIncrementProposals(
  supabase: SupabaseClient<Database>,
  orgId: string,
  limit: number
): Promise<void> {
  // Postgres INT max — used when plan has unlimited proposals so the RPC doesn't error
  const safeLimit = isFinite(limit) ? limit : 2147483647;

  const { data: newCount, error } = await supabase.rpc(
    "increment_proposals_if_under_limit",
    { p_org_id: orgId, p_limit: safeLimit }
  );

  if (error) {
    throw new ApiError("internal_error", "Could not update proposal count", 500);
  }

  if (newCount === -1) {
    throw new ApiError(
      "QUOTA_EXCEEDED",
      "Proposal limit reached. Upgrade to create more proposals.",
      402,
      { limit_type: "proposals" }
    );
  }
}
```

- [ ] **Step 2: Update `src/lib/kb/limits.ts`**

Full file replacement:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { PLAN_LIMITS } from "@/types";
import type { Plan } from "@/types";
import { ApiError } from "@/lib/auth/requireRole";

export function formatMb(bytes: number): string {
  if (!isFinite(bytes)) return "∞ MB";
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

export async function assertWithinLimit(
  supabase: SupabaseClient<Database>,
  orgId: string,
  incomingBytes: number,
): Promise<{ used: number; limitBytes: number }> {
  const [{ data: sub }, { data: rows }] = await Promise.all([
    supabase.from("subscriptions").select("plan").eq("org_id", orgId).single(),
    supabase.from("knowledge_docs").select("file_size_bytes").eq("org_id", orgId),
  ]);

  const used = (rows ?? []).reduce((acc, r) => acc + (r.file_size_bytes ?? 0), 0);
  const plan = (sub?.plan ?? "free") as Plan;
  const limitMb = PLAN_LIMITS[plan].storageMb;
  const limitBytes = isFinite(limitMb) ? limitMb * 1024 * 1024 : Infinity;

  if (isFinite(limitBytes) && used + incomingBytes > limitBytes) {
    throw new ApiError(
      "QUOTA_EXCEEDED",
      `KB storage limit reached. ${formatMb(used)} / ${formatMb(limitBytes)} used.`,
      402,
      {
        limit_type: "storage",
        current: used,
        limit: limitBytes,
        plan,
      }
    );
  }

  return { used, limitBytes };
}
```

- [ ] **Step 3: Add member quota check to `src/app/api/org/invitations/route.ts`**

At the top of the POST handler, after `requireRole` and before the existing `existingUser` check, insert:

```ts
import { PLAN_LIMITS } from "@/types";
import type { Plan } from "@/types";
import { ApiError } from "@/lib/auth/requireRole";
```

Add these imports at the top of the file (alongside existing imports).

Then add this block as the first thing inside the POST handler body, after `const { userId, orgId, supabase } = await requireRole(["owner", "admin"]);`:

```ts
// Member quota check
const [{ data: sub }, { count: memberCount }] = await Promise.all([
  supabase.from("subscriptions").select("plan").eq("org_id", orgId).single(),
  supabase.from("users").select("id", { count: "exact", head: true }).eq("org_id", orgId),
]);
const planName = (sub?.plan ?? "free") as Plan;
const memberLimit = PLAN_LIMITS[planName].users;
if (isFinite(memberLimit) && (memberCount ?? 0) >= memberLimit) {
  throw new ApiError(
    "QUOTA_EXCEEDED",
    `Team member limit reached (${memberCount ?? 0}/${memberLimit}). Upgrade to add more members.`,
    402,
    {
      limit_type: "members",
      current: memberCount ?? 0,
      limit: memberLimit,
      plan: planName,
    }
  );
}
```

- [ ] **Step 4: Verify TypeScript passes**

```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/limits.ts src/lib/kb/limits.ts src/app/api/org/invitations/route.ts
git commit -m "feat: update quota checks to 402/QUOTA_EXCEEDED; add member limit; fix Infinity→int overflow"
```

---

## Task 5: Auto-provision free subscription on org creation

**Files:**
- Modify: `src/app/api/auth/signup/route.ts`

**Context:** Org creation happens in `POST /api/auth/signup` when `body.action === "create-org"`. After the org and user rows are inserted, we insert a free subscription record using the service role client (the `subscriptions` table blocks inserts from non-service roles). `createServiceClient` is already in `src/lib/supabase/server.ts`.

- [ ] **Step 1: Update `src/app/api/auth/signup/route.ts`**

Add `createServiceClient` to the import:

```ts
import { createClient, createServiceClient } from "@/lib/supabase/server";
```

After the `userError` block (after confirming user insert succeeded), add:

```ts
const serviceClient = await createServiceClient();
await serviceClient.from("subscriptions").insert({
  org_id: org.id,
  plan: "free",
  status: "active",
});
```

The full `"create-org"` branch after the change:

```ts
// action === "create-org"
const {
  data: { user },
} = await supabase.auth.getUser();
if (!user) return ApiErrors.Unauthorized();

const { data: existing } = await supabase
  .from("users")
  .select("org_id")
  .eq("id", user.id)
  .maybeSingle();
if (existing?.org_id) return ok({ orgId: existing.org_id });

const { data: org, error: orgError } = await supabase
  .from("organizations")
  .insert({ name: body.name, industry: body.industry })
  .select("id")
  .single();
if (orgError || !org) {
  console.error("[signup] org insert failed", orgError);
  return ApiErrors.InternalError();
}

const { error: userError } = await supabase.from("users").insert({
  id: user.id,
  org_id: org.id,
  email: user.email!,
  full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
  role: "owner",
});
if (userError) {
  console.error("[signup] users insert failed", userError);
  return ApiErrors.InternalError();
}

const serviceClient = await createServiceClient();
await serviceClient.from("subscriptions").insert({
  org_id: org.id,
  plan: "free",
  status: "active",
});

return ok({ orgId: org.id });
```

- [ ] **Step 2: Verify TypeScript passes**

```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/signup/route.ts
git commit -m "feat: auto-provision free subscription on org creation"
```

---

## Task 6: Fix webhook to map price_id → plan name

**Files:**
- Modify: `src/lib/stripe/webhooks.ts`

**Context:** `handleSubscriptionUpsert` currently hardcodes `plan: "starter"`. We need to detect the correct plan from the Stripe subscription's `price.id` by comparing against environment variables. A new `STRIPE_GROWTH_PRICE_ID` env var must be added to `.env.local` and Vercel.

- [ ] **Step 1: Add `STRIPE_GROWTH_PRICE_ID` to your `.env.local`**

```
STRIPE_GROWTH_PRICE_ID=price_your_growth_price_id_here
```

(Create a Growth product + price in your Stripe dashboard if you haven't already, then paste the price ID here.)

- [ ] **Step 2: Update `src/lib/stripe/webhooks.ts`**

Full file replacement:

```ts
import type Stripe from "stripe";
import { stripe } from "./client";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

function getAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function planFromSubscription(subscription: Stripe.Subscription): "starter" | "growth" {
  const priceId = subscription.items?.data?.[0]?.price?.id;
  if (priceId && priceId === process.env.STRIPE_GROWTH_PRICE_ID) return "growth";
  return "starter";
}

export async function verifyWebhookSignature(
  body: string,
  signature: string
): Promise<Stripe.Event> {
  return stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
}

export async function handleSubscriptionUpsert(subscription: Stripe.Subscription) {
  const orgId = subscription.metadata?.org_id;
  if (!orgId) return;

  const supabase = getAdminClient();

  const item = subscription.items?.data?.[0];
  const periodStart = item?.current_period_start
    ? new Date(item.current_period_start * 1000).toISOString()
    : null;
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000).toISOString()
    : null;

  await supabase.from("subscriptions").upsert(
    {
      org_id: orgId,
      stripe_customer_id: subscription.customer as string,
      stripe_subscription_id: subscription.id,
      status: subscription.status as Database["public"]["Tables"]["subscriptions"]["Row"]["status"],
      plan: planFromSubscription(subscription),
      current_period_start: periodStart,
      current_period_end: periodEnd,
    },
    { onConflict: "org_id" }
  );
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const orgId = subscription.metadata?.org_id;
  if (!orgId) return;

  const supabase = getAdminClient();

  await supabase
    .from("subscriptions")
    .update({ status: "canceled", plan: "free" })
    .eq("org_id", orgId);
}
```

Note: `handleSubscriptionDeleted` now resets the plan to `"free"` when a subscription is canceled, so the user falls back to free limits.

- [ ] **Step 3: Verify TypeScript passes**

```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/stripe/webhooks.ts
git commit -m "feat: detect plan from Stripe price_id in webhook handler"
```

---

## Task 7: Billing API routes

**Files:**
- Create: `src/app/api/billing/subscription/route.ts`
- Create: `src/app/api/billing/checkout/route.ts`
- Create: `src/app/api/billing/portal/route.ts`
- Create: `src/app/api/billing/webhook/route.ts`

**Context:** Four routes. The `subscriptions` SELECT policy allows any org member to read their own row. Checkout and portal require `owner` or `admin`. Webhook bypasses `requireRole` — it validates the Stripe signature directly. App Router route handlers do not auto-parse request bodies, so `req.text()` works in the webhook without special config.

- [ ] **Step 1: Create `src/app/api/billing/subscription/route.ts`**

```ts
import { withErrorHandling, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { PLAN_LIMITS } from "@/types";
import type { Plan } from "@/types";

export const GET = withErrorHandling(async () => {
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);

  const [{ data: sub }, { data: docs }, { count: memberCount }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan, status, current_period_end, proposals_used")
      .eq("org_id", orgId)
      .single(),
    supabase.from("knowledge_docs").select("file_size_bytes").eq("org_id", orgId),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("org_id", orgId),
  ]);

  if (!sub) throw new Error("No subscription found");

  const plan = sub.plan as Plan;
  const limits = PLAN_LIMITS[plan];
  const storageUsed = (docs ?? []).reduce((sum, d) => sum + (d.file_size_bytes ?? 0), 0);
  const storageLimitBytes = isFinite(limits.storageMb) ? limits.storageMb * 1024 * 1024 : Infinity;

  return ok({
    plan: sub.plan,
    status: sub.status,
    current_period_end: sub.current_period_end,
    usage: {
      proposals: { current: sub.proposals_used, limit: limits.proposals },
      storage_bytes: { current: storageUsed, limit: storageLimitBytes },
      members: { current: memberCount ?? 0, limit: limits.users },
    },
  });
});
```

- [ ] **Step 2: Create `src/app/api/billing/checkout/route.ts`**

```ts
import { z } from "zod";
import { withErrorHandling, ok, fail } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { stripe } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/server";

const bodySchema = z.object({ price_id: z.string().min(1) });

export const POST = withErrorHandling(async (req) => {
  const { orgId } = await requireRole(["owner", "admin"]);
  const { price_id } = bodySchema.parse(await req.json());

  const serviceClient = await createServiceClient();
  const { data: sub } = await serviceClient
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("org_id", orgId)
    .single();

  let customerId = sub?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({ metadata: { org_id: orgId } });
    customerId = customer.id;
    await serviceClient
      .from("subscriptions")
      .update({ stripe_customer_id: customerId })
      .eq("org_id", orgId);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: price_id, quantity: 1 }],
    subscription_data: { metadata: { org_id: orgId } },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?canceled=1`,
  });

  if (!session.url) return fail("checkout_error", "Could not create checkout session", 500);
  return ok({ url: session.url });
});
```

- [ ] **Step 3: Create `src/app/api/billing/portal/route.ts`**

```ts
import { withErrorHandling, ok, fail } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { stripe } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/server";

export const POST = withErrorHandling(async () => {
  const { orgId } = await requireRole(["owner", "admin"]);

  const serviceClient = await createServiceClient();
  const { data: sub } = await serviceClient
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("org_id", orgId)
    .single();

  if (!sub?.stripe_customer_id) {
    return fail("not_found", "No billing account found. Subscribe to a plan first.", 404);
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
  });

  return ok({ url: session.url });
});
```

- [ ] **Step 4: Create `src/app/api/billing/webhook/route.ts`**

```ts
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  verifyWebhookSignature,
  handleSubscriptionUpsert,
  handleSubscriptionDeleted,
} from "@/lib/stripe/webhooks";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await verifyWebhookSignature(body, signature);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      await handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
    } else if (event.type === "customer.subscription.deleted") {
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
    }
  } catch (err) {
    console.error("[webhook] handler error", err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 5: Verify TypeScript passes**

```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/billing/
git commit -m "feat: add billing API routes (subscription, checkout, portal, webhook)"
```

---

## Task 8: Upgrade modal context + handleApiError

**Files:**
- Create: `src/lib/billing/upgrade-modal-context.tsx`
- Create: `src/lib/billing/handle-error.ts`

**Context:** Global modal state is kept in React Context — no new package needed. The Provider is mounted in the dashboard layout (Task 9). `handleApiError` is a client-side utility that components call after any `fetch` when `!res.ok`: it opens the upgrade modal on 402 + QUOTA_EXCEEDED, otherwise throws the error message.

- [ ] **Step 1: Create `src/lib/billing/upgrade-modal-context.tsx`**

```tsx
"use client";

import { createContext, useContext, useState, useCallback } from "react";

export type QuotaType = "proposals" | "storage" | "members";

export interface QuotaExceededInfo {
  limitType: QuotaType;
  current: number;
  limit: number;
  plan: string;
}

interface UpgradeModalContextValue {
  open: boolean;
  info: QuotaExceededInfo | null;
  openModal: (info: QuotaExceededInfo) => void;
  closeModal: () => void;
}

const UpgradeModalContext = createContext<UpgradeModalContextValue | null>(null);

export function UpgradeModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<QuotaExceededInfo | null>(null);

  const openModal = useCallback((newInfo: QuotaExceededInfo) => {
    setInfo(newInfo);
    setOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <UpgradeModalContext.Provider value={{ open, info, openModal, closeModal }}>
      {children}
    </UpgradeModalContext.Provider>
  );
}

export function useUpgradeModal() {
  const ctx = useContext(UpgradeModalContext);
  if (!ctx) throw new Error("useUpgradeModal must be used within UpgradeModalProvider");
  return ctx;
}
```

- [ ] **Step 2: Create `src/lib/billing/handle-error.ts`**

```ts
import type { QuotaExceededInfo, QuotaType } from "./upgrade-modal-context";

export async function handleApiError(
  res: Response,
  openModal: (info: QuotaExceededInfo) => void
): Promise<never> {
  const json = await res.json().catch(() => null);

  if (res.status === 402 && json?.error?.code === "QUOTA_EXCEEDED") {
    openModal({
      limitType: (json.error.limit_type ?? "proposals") as QuotaType,
      current: json.error.current ?? 0,
      limit: json.error.limit ?? 0,
      plan: json.error.plan ?? "free",
    });
    throw new Error("quota_exceeded");
  }

  const message = json?.error?.message ?? "An unexpected error occurred.";
  throw new Error(message);
}
```

- [ ] **Step 3: Verify TypeScript passes**

```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/billing/
git commit -m "feat: add upgrade modal context and handleApiError utility"
```

---

## Task 9: UpgradeModal component + dashboard layout

**Files:**
- Create: `src/components/UpgradeModal.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Context:** `UpgradeModal` is a shadcn `<Dialog>` driven by the context from Task 8. It shows which limit was hit and links to `/settings/billing`. The dashboard layout wraps all pages in `UpgradeModalProvider` and mounts the modal once — any child component can call `openModal` via `useUpgradeModal()`.

- [ ] **Step 1: Create `src/components/UpgradeModal.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUpgradeModal } from "@/lib/billing/upgrade-modal-context";

const LIMIT_LABELS: Record<string, string> = {
  proposals: "proposal",
  storage: "storage",
  members: "team member",
};

function formatValue(limitType: string, value: number): string {
  if (!isFinite(value)) return "unlimited";
  if (limitType === "storage") return `${Math.round(value / 1024 / 1024)} MB`;
  return String(value);
}

export function UpgradeModal() {
  const { open, info, closeModal } = useUpgradeModal();
  const router = useRouter();

  function handleUpgrade() {
    closeModal();
    router.push("/settings/billing");
  }

  if (!info) return null;

  const label = LIMIT_LABELS[info.limitType] ?? info.limitType;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) closeModal(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>You've reached your {label} limit</DialogTitle>
          <DialogDescription>
            Your <span className="font-medium capitalize">{info.plan}</span> plan includes{" "}
            {formatValue(info.limitType, info.limit)} {label}s. You're currently using{" "}
            {formatValue(info.limitType, info.current)}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={closeModal}>
            Dismiss
          </Button>
          <Button onClick={handleUpgrade}>Upgrade plan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Update `src/app/(dashboard)/layout.tsx`**

Full file replacement:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UpgradeModalProvider } from "@/lib/billing/upgrade-modal-context";
import { UpgradeModal } from "@/components/UpgradeModal";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <UpgradeModalProvider>
      {children}
      <UpgradeModal />
    </UpgradeModalProvider>
  );
}
```

- [ ] **Step 3: Verify TypeScript passes**

```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/UpgradeModal.tsx src/app/(dashboard)/layout.tsx
git commit -m "feat: add UpgradeModal and mount in dashboard layout"
```

---

## Task 10: Billing settings page

**Files:**
- Modify: `src/app/(dashboard)/settings/layout.tsx`
- Create: `src/app/(dashboard)/settings/billing/page.tsx`
- Create: `src/app/(dashboard)/settings/billing/UsageCards.tsx`
- Create: `src/app/(dashboard)/settings/billing/PlanTiles.tsx`
- Create: `src/app/(dashboard)/settings/billing/CheckoutFeedback.tsx`

**Context:** `page.tsx` is a server component that queries Supabase directly and passes data as props to the sub-components. `UsageCards` is a server component (just renders props). `PlanTiles` and `CheckoutFeedback` are client components (need interactivity / browser APIs). `CheckoutFeedback` uses `useSearchParams` — it must be wrapped in `<Suspense>` by the page.

Price IDs are server-side env vars. The page server component reads them and passes as string props to `PlanTiles` (safe — they're not secrets).

- [ ] **Step 1: Enable the Billing tab in `src/app/(dashboard)/settings/layout.tsx`**

Replace the full `TABS` array and the tab rendering logic:

```ts
const TABS = [
  { href: "/settings/org", label: "Organization" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/billing", label: "Billing" },
];
```

And in the `map`, remove the `disabled` branch — render all tabs as `<Link>`:

```tsx
<nav className="mt-4 flex gap-1 border-b border-border">
  {TABS.map((t) => (
    <Link
      key={t.href}
      href={t.href}
      className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-foreground hover:border-primary"
    >
      {t.label}
    </Link>
  ))}
</nav>
```

Full updated file:

```tsx
import Link from "next/link";

const TABS = [
  { href: "/settings/org", label: "Organization" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/billing", label: "Billing" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-4xl p-6 md:p-10">
      <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "#162B44" }}>
        Settings
      </h1>
      <nav className="mt-4 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-foreground hover:border-primary"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="mt-8">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/(dashboard)/settings/billing/UsageCards.tsx`**

```tsx

interface UsageEntry {
  current: number;
  limit: number;
}

interface Props {
  usage: {
    proposals: UsageEntry;
    storage_bytes: UsageEntry;
    members: UsageEntry;
  };
}

function formatStorage(bytes: number): string {
  if (!isFinite(bytes)) return "∞";
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function UsageCard({
  label,
  current,
  limit,
  display,
}: {
  label: string;
  current: number;
  limit: number;
  display: (n: number) => string;
}) {
  const atLimit = isFinite(limit) && current >= limit;
  const pct = isFinite(limit) && limit > 0 ? Math.min(100, (current / limit) * 100) : 0;

  return (
    <div
      className={`rounded-lg border p-5 space-y-3 ${
        atLimit ? "border-amber-400 bg-amber-50" : "border-border bg-card"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className={`text-2xl font-bold ${atLimit ? "text-amber-800" : ""}`}>
          {display(current)}
        </span>
        <span className="text-sm text-muted-foreground">
          / {isFinite(limit) ? display(limit) : "∞"}
        </span>
      </div>
      <p className={`text-sm font-medium ${atLimit ? "text-amber-700" : ""}`}>{label}</p>
      {isFinite(limit) && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full ${atLimit ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function UsageCards({ usage }: Props) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Current usage</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <UsageCard
          label="Proposals"
          current={usage.proposals.current}
          limit={usage.proposals.limit}
          display={String}
        />
        <UsageCard
          label="Storage"
          current={usage.storage_bytes.current}
          limit={usage.storage_bytes.limit}
          display={formatStorage}
        />
        <UsageCard
          label="Team members"
          current={usage.members.current}
          limit={usage.members.limit}
          display={String}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/app/(dashboard)/settings/billing/CheckoutFeedback.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";

export function CheckoutFeedback() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    const canceled = searchParams.get("canceled");

    if (sessionId) {
      toast.success("Subscription activated!");
      router.replace(pathname);
    } else if (canceled) {
      toast("Checkout canceled.", { duration: 3000 });
      router.replace(pathname);
    }
  }, [searchParams, router, pathname]);

  return null;
}
```

- [ ] **Step 4: Create `src/app/(dashboard)/settings/billing/PlanTiles.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Plan } from "@/types";

interface Props {
  plan: Plan;
  starterPriceId: string;
  growthPriceId: string;
}

function SubscribeButton({ priceId, label }: { priceId: string; label: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubscribe() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price_id: priceId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message ?? "Could not start checkout");
        return;
      }
      router.push(json.data.url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleSubscribe} disabled={loading || !priceId} className="w-full mt-4">
      {loading ? "Redirecting…" : label}
    </Button>
  );
}

function ManageButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleManage() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message ?? "Could not open billing portal");
        return;
      }
      router.push(json.data.url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleManage}
      disabled={loading}
      className="text-sm text-primary hover:underline disabled:opacity-50"
    >
      {loading ? "Loading…" : "Manage subscription →"}
    </button>
  );
}

export function PlanTiles({ plan, starterPriceId, growthPriceId }: Props) {
  if (plan === "enterprise") {
    return (
      <div className="text-sm text-muted-foreground">
        Contact your account manager to make changes to your Enterprise plan.
      </div>
    );
  }

  if (plan === "growth") {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Manage billing</h2>
        <ManageButton />
        <p className="text-sm text-muted-foreground">
          Need more?{" "}
          <a href="mailto:hello@propelrfp.com" className="text-primary hover:underline">
            Contact us for Enterprise →
          </a>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">
        {plan === "free" ? "Upgrade your plan" : "Manage billing"}
      </h2>

      {plan === "starter" && (
        <div className="mb-4">
          <ManageButton />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
        {(plan === "free" || plan === "starter") && (
          <div
            className={`rounded-lg border p-5 ${
              plan === "free" ? "border-primary border-2" : "border-border"
            }`}
          >
            <div className="font-semibold text-base">Starter</div>
            <div className="text-2xl font-bold mt-1">
              $299
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            </div>
            <ul className="mt-3 text-sm text-muted-foreground space-y-1">
              <li>10 proposals</li>
              <li>500 MB storage</li>
              <li>1 team member</li>
            </ul>
            {plan === "free" && (
              <SubscribeButton priceId={starterPriceId} label="Subscribe" />
            )}
          </div>
        )}

        <div
          className={`rounded-lg border p-5 ${
            plan === "starter" ? "border-primary border-2" : "border-border"
          }`}
        >
          <div className="font-semibold text-base">Growth</div>
          <div className="text-2xl font-bold mt-1">
            $599
            <span className="text-sm font-normal text-muted-foreground">/mo</span>
          </div>
          <ul className="mt-3 text-sm text-muted-foreground space-y-1">
            <li>Unlimited proposals</li>
            <li>5 GB storage</li>
            <li>5 team members</li>
          </ul>
          <SubscribeButton
            priceId={growthPriceId}
            label={plan === "free" ? "Subscribe" : "Upgrade"}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `src/app/(dashboard)/settings/billing/page.tsx`**

```tsx
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PLAN_LIMITS } from "@/types";
import type { Plan } from "@/types";
import { UsageCards } from "./UsageCards";
import { PlanTiles } from "./PlanTiles";
import { CheckoutFeedback } from "./CheckoutFeedback";

export default async function BillingPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userRow } = await supabase
    .from("users")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!userRow) redirect("/login");

  const orgId = userRow.org_id;

  const [{ data: sub }, { data: docs }, { count: memberCount }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan, status, current_period_end, proposals_used")
      .eq("org_id", orgId)
      .single(),
    supabase.from("knowledge_docs").select("file_size_bytes").eq("org_id", orgId),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("org_id", orgId),
  ]);

  const plan = (sub?.plan ?? "free") as Plan;
  const limits = PLAN_LIMITS[plan];
  const storageUsed = (docs ?? []).reduce((sum, d) => sum + (d.file_size_bytes ?? 0), 0);
  const storageLimitBytes = isFinite(limits.storageMb) ? limits.storageMb * 1024 * 1024 : Infinity;

  const usage = {
    proposals: { current: sub?.proposals_used ?? 0, limit: limits.proposals },
    storage_bytes: { current: storageUsed, limit: storageLimitBytes },
    members: { current: memberCount ?? 0, limit: limits.users },
  };

  return (
    <div className="space-y-10">
      <Suspense fallback={null}>
        <CheckoutFeedback />
      </Suspense>
      <UsageCards usage={usage} />
      <PlanTiles
        plan={plan}
        starterPriceId={process.env.STRIPE_STARTER_PRICE_ID ?? ""}
        growthPriceId={process.env.STRIPE_GROWTH_PRICE_ID ?? ""}
      />
    </div>
  );
}
```

- [ ] **Step 6: Verify TypeScript passes and build succeeds**

```bash
pnpm typecheck && pnpm build
```

Expected: No TypeScript errors. Build completes.

- [ ] **Step 7: Manual smoke test**

1. Start dev server: `pnpm dev`
2. Navigate to `/settings/billing` while logged in
3. Confirm: three usage cards visible, plan tiles visible below
4. If on free plan: Starter and Growth tiles appear with Subscribe buttons
5. Navigate to `/settings/billing?canceled=1` — confirm "Checkout canceled." toast appears and URL clears

- [ ] **Step 8: Commit**

```bash
git add src/app/(dashboard)/settings/
git commit -m "feat: add billing settings page with usage cards and plan tiles"
```

---

## Post-implementation: Configure Stripe webhook

To test the webhook locally:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

This prints a webhook signing secret (e.g. `whsec_...`). Set it as `STRIPE_WEBHOOK_SECRET` in `.env.local`.

To test a full checkout flow:
1. Click Subscribe in `/settings/billing`
2. Complete payment on Stripe's test checkout page (use card `4242 4242 4242 4242`, any future date, any CVC)
3. Stripe fires `customer.subscription.created` → webhook updates `subscriptions` row
4. Return redirect lands on `/settings/billing?session_id=...` → "Subscription activated!" toast
