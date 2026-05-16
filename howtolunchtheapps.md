# How to Launch and Test PropelRFP

Two sections: **Local Development** (for building and debugging) and **Staging Smoke Test** (UAT checklist against the Vercel preview URL).

---

## Part 1 — Running Locally

### Prerequisites

Make sure these are installed before starting:

| Tool | Min version | Check with |
|------|-------------|------------|
| Node.js | 20+ | `node -v` |
| pnpm | 9+ | `pnpm -v` |
| Supabase CLI | latest | `supabase --version` |
| Stripe CLI | latest | `stripe --version` |

Install pnpm if missing:
```bash
npm install -g pnpm
```

Install Supabase CLI:
```bash
# Windows (via scoop)
scoop install supabase

# or via npm
pnpm add -g supabase
```

Install Stripe CLI: https://stripe.com/docs/stripe-cli — download the Windows installer.

---

### Step 1: Install dependencies

```bash
cd propelrfp
pnpm install
```

---

### Step 2: Set up environment variables

Copy the example file and fill in your values:

```bash
copy .env.example .env.local
```

Open `.env.local` and fill in every value:

```env
# Supabase — get from Supabase dashboard > Project Settings > API
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI — get from Anthropic console and OpenAI platform
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-proj-...

# Stripe (test mode keys) — get from Stripe dashboard > Developers
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...        # filled in Step 5
STRIPE_STARTER_PRICE_ID=price_...      # your Starter plan price ID
STRIPE_GROWTH_PRICE_ID=price_...       # your Growth plan price ID

# Email — get from Resend dashboard
RESEND_API_KEY=re_...

# App URL (keep as localhost for local dev)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Cron auth secret — any random string works locally
CRON_SECRET=local-dev-secret
```

---

### Step 3: Apply database migrations

Link the Supabase CLI to your project and push all migrations:

```bash
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

This applies migrations 001 through 006 in order. Confirm in Supabase dashboard → Database → Migrations — all 6 should show as applied.

---

### Step 4: Start the dev server

```bash
pnpm dev
```

Open **http://localhost:3000**. You should see the PropelRFP landing page.

The dev server uses Turbopack and hot-reloads on file changes.

---

### Step 5: Start the Stripe webhook listener (for billing features)

Open a **second terminal** and run:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/billing/webhook
```

The CLI prints a webhook signing secret that starts with `whsec_`. Copy it and paste it into `.env.local` as `STRIPE_WEBHOOK_SECRET`, then restart the dev server (`Ctrl+C`, `pnpm dev`).

Leave this terminal running whenever you test billing flows.

---

### Step 6: Trigger the KB processing cron manually

The Vercel Cron runs automatically in production (every minute), but locally you need to trigger it manually after uploading documents to the Knowledge Base.

```bash
curl -X GET http://localhost:3000/api/cron/process-kb \
  -H "Authorization: Bearer local-dev-secret"
```

Run this after uploading a PDF or DOCX — wait a few seconds, then refresh the Knowledge Base page. The document status should change from **Processing** to **Ready**.

---

### Useful Commands

| Command | What it does |
|---------|-------------|
| `pnpm dev` | Start dev server with Turbopack |
| `pnpm build` | Production build (also runs type check) |
| `pnpm typecheck` | TypeScript type-check only |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format all files with Prettier |

---

### Common Local Issues

**`Error: STRIPE_SECRET_KEY is required`**
→ You restarted the dev server but `.env.local` is missing `STRIPE_SECRET_KEY`. Double-check the file exists and is not named `.env`.

**Supabase auth callback fails after Google OAuth**
→ Add `http://localhost:3000/auth/callback` to your Supabase project's allowed redirect URLs: Supabase dashboard → Auth → URL Configuration → Redirect URLs.

**KB document stuck on "Processing"**
→ The cron isn't running locally. Trigger it manually with the `curl` command in Step 6.

**`Invalid webhook signature`**
→ The `STRIPE_WEBHOOK_SECRET` in `.env.local` doesn't match the secret printed by `stripe listen`. Copy it again and restart the dev server.

---

## Part 2 — Staging Smoke Test (UAT)

Run this checklist against the Vercel staging preview URL (the `develop` branch deploy). Use a real email address and Stripe test mode cards.

**Staging URL:** get it from the Vercel dashboard → your project → Deployments → the latest `develop` branch deploy.

**Stripe test card:** `4242 4242 4242 4242` — any future expiry, any 3-digit CVC, any ZIP.

---

### 1. Auth

| # | Step | Expected result |
|---|------|----------------|
| 1.1 | Go to `/signup`, create account with email + password | Redirected to org creation page |
| 1.2 | Fill in org name and submit | Redirected to `/dashboard` |
| 1.3 | Sign out | Redirected to `/login` |
| 1.4 | Sign back in with same credentials | Redirected to `/dashboard` |
| 1.5 | Go to `/login`, click **Continue with Google** | Google OAuth flow opens, completes, lands on `/dashboard` |

---

### 2. Dashboard

| # | Step | Expected result |
|---|------|----------------|
| 2.1 | Open `/dashboard` | Browser tab title shows **Dashboard \| PropelRFP** |
| 2.2 | Observe loading state | Skeleton appears briefly before content loads |
| 2.3 | Check stats cards | 4 cards visible (Active proposals, KB docs, Win rate, Time saved) |
| 2.4 | No proposals exist yet | Empty state with "No proposals yet" message and **Create first proposal** button |

---

### 3. Knowledge Base

| # | Step | Expected result |
|---|------|----------------|
| 3.1 | Navigate to `/kb` | Tab title: **Knowledge Base \| PropelRFP** |
| 3.2 | Upload a PDF file (any proposal or document) | File appears in list with status **Processing** |
| 3.3 | Wait ~1–2 minutes for cron to run | Status changes to **Ready** |
| 3.4 | Upload a DOCX file | Same flow — ends in **Ready** |
| 3.5 | Check storage usage meter | Usage bar reflects uploaded file sizes |
| 3.6 | Delete one document | Document removed from list, storage meter updates |

---

### 4. RFP Projects

| # | Step | Expected result |
|---|------|----------------|
| 4.1 | Navigate to `/projects` | Tab title: **Proposals \| PropelRFP** |
| 4.2 | Click **New proposal** | Form at `/projects/new` loads |
| 4.3 | Fill in title, client name, paste sample RFP text (5+ lines), submit | Project created, redirected to project editor |
| 4.4 | Click **Detect sections** | Sections appear (Claude auto-detects from RFP text) |
| 4.5 | Confirm sections show in sidebar | Sidebar lists all detected sections |

---

### 5. AI Generation

| # | Step | Expected result |
|---|------|----------------|
| 5.1 | Click on a section in the sidebar | Section panel opens |
| 5.2 | Click **Generate** | Loading indicator appears, AI draft streams in progressively |
| 5.3 | Verify draft content | Draft text appears in the editor area; no meta-commentary or headings |
| 5.4 | Generate a second section | Same flow — each section streams independently |

---

### 6. Review & Editor

| # | Step | Expected result |
|---|------|----------------|
| 6.1 | Edit the AI draft in the Tiptap editor | Text is editable, bold/italic/underline toolbar works |
| 6.2 | Change section status to **Approved** via the dropdown | Status updates immediately |
| 6.3 | Approve all sections | Progress bar on project card reaches 100% |
| 6.4 | Click **Export DOCX** (appears when all sections approved) | `.docx` file downloads to your machine |
| 6.5 | Open the downloaded file | Content matches the approved draft text |

---

### 7. Settings — Org & Members

| # | Step | Expected result |
|---|------|----------------|
| 7.1 | Go to `/settings/org` | Org name form loads; can update and save |
| 7.2 | Go to `/settings/members` | Your account shows as **Owner** |
| 7.3 | Enter a second email address and click **Invite** | Success toast; invite email arrives in inbox |
| 7.4 | Open invite link from email in a new browser/incognito | Accept page loads; accepting creates new account and joins org |
| 7.5 | Check `/settings/members` | New member appears in the list |

---

### 8. Billing

| # | Step | Expected result |
|---|------|----------------|
| 8.1 | Go to `/settings/billing` | Tab title: **Billing \| PropelRFP**; usage cards and plan tiles visible |
| 8.2 | Current plan shows **Free** | Plan tiles highlight Free as current |
| 8.3 | Click **Upgrade** on Starter plan | Stripe Checkout page opens |
| 8.4 | Enter test card `4242 4242 4242 4242`, complete checkout | Redirected back to `/settings/billing?session_id=...` |
| 8.5 | Plan now shows **Starter** | Billing page reflects new plan |
| 8.6 | Click **Manage billing** | Stripe Customer Portal opens |
| 8.7 | Cancel subscription in portal | Redirected back to billing page |

---

### 9. Quota Enforcement

| # | Step | Expected result |
|---|------|----------------|
| 9.1 | On Free plan, create 3 proposals | All 3 succeed |
| 9.2 | Try to create a 4th proposal | API returns error; **Upgrade modal** appears showing "You've reached your proposal limit" |
| 9.3 | Click **Upgrade plan** in modal | Navigates to `/settings/billing` |
| 9.4 | Click **Dismiss** | Modal closes, no navigation |

---

### 10. Error States & Loading UX

| # | Step | Expected result |
|---|------|----------------|
| 10.1 | Hard-refresh any dashboard page | Loading skeleton appears briefly before content |
| 10.2 | Navigate to a non-existent project `/projects/fake-id` | Error boundary or 404 renders gracefully |
| 10.3 | Sign out, then manually navigate to `/dashboard` | Redirected to `/login` (auth guard works) |

---

### Smoke Test Sign-Off

Once all items above pass, the staging environment is ready for production deployment.

```
Smoke test completed by: ___________________
Date: ___________________
Staging URL: ___________________
All checks passed: YES / NO
Notes: ___________________
```

---

## Part 3 — After Smoke Test: Deploy to Production

Once staging smoke test passes, run the production deployment sequence:

```bash
# 1. Merge develop → main
git checkout main
git pull origin main
git merge develop --no-ff -m "chore: release v1.0.0 — PropelRFP MVP"
git push origin main

# 2. Tag the release
git tag -a v1.0.0 -m "PropelRFP MVP — all 6 modules complete"
git push origin v1.0.0
```

Then verify the production Vercel deploy completes and repeat a quick smoke test (steps 1.1, 3.2–3.3, 5.2, 6.4, 8.3) against the production URL with real email and Stripe live mode.
