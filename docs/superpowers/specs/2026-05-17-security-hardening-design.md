# Security Hardening — Design Spec

**Date:** 2026-05-17
**Branch:** `feature/security-hardening`
**Status:** Complete — merged to `develop`

---

## Problem Statement

PropelRFP's 6 MVP modules are complete and ready for production. Before going live, 9 security and operational gaps must be closed:

1. Confirm that multi-tenant data isolation is airtight (users cannot see other orgs' data)
2. Confirm password reset links expire
3. Input fields do not strip whitespace — a title of `"  "` (spaces only) passes validation
4. API routes have no explicit CORS policy — any origin can call them
5. No rate limiting — auth endpoints are open to brute-force and AI generation is unmetered
6. No custom error pages — Next.js shows its default dev-style errors in production
7. No error monitoring — failures are invisible unless a user reports them
8. No database rollback scripts — a bad migration in production requires manual reverse-engineering
9. No documented error handling reference for the team

---

## Goals

- Zero data leakage between organizations
- Protect auth endpoints from brute-force (rate limiting)
- Protect AI generation endpoint from abuse (rate limiting + CORS)
- User-facing errors show clean, branded pages with actionable recovery
- All server-side errors are automatically captured and alerted
- Any production migration can be safely reversed using a runbook
- One canonical reference document for all error codes and recovery procedures

## Non-Goals

- No schema changes (DB is already well-indexed and structured)
- No new user-facing features
- No changes to existing RLS policies (they are correct)
- No Sentry session replay or user feedback widgets

---

## Architecture

Changes are layered across four tiers:

```
Request → [Middleware: rate limit + CORS preflight]
        → [Route Handler: Zod validation with .trim()]
        → [Database: RLS enforces org isolation]
        → [Response: structured error envelope]

Uncaught exceptions → Sentry (server + edge + client)
                    → Error boundary UI (digest code shown to user)
```

---

## Decision Log

### Rate limiting: middleware vs. route-level

**Chosen:** middleware (`src/proxy.ts`). Reason: middleware runs before the route handler on every request, including before auth. Route-level would require adding limiter calls to every route individually and would miss unauthenticated hits. Middleware catches everything in one place.

**Backend:** Upstash Redis (Vercel KV). Reason: Next.js runs as serverless functions — in-memory state doesn't persist between invocations. Redis provides shared state across all instances. Upstash's `@upstash/ratelimit` library has native Next.js middleware support.

### Rate limit values

| Tier | Limit | Reasoning |
|------|-------|-----------|
| Auth (`/api/auth/*`) | 10 req / 60s per IP | Standard brute-force threshold. A legitimate user won't hit 10 login attempts per minute. |
| AI generation | 20 req / 60s per IP | Claude API calls are expensive. 20/min allows fast iterative editing without runaway costs. |
| All other API | 100 req / 60s per IP | Generous for interactive UI use; catches automated scraping. |

Algorithm: sliding window (vs. fixed window). Reason: prevents burst-at-boundary attacks that fixed windows allow.

### CORS: Next.js headers() vs. custom middleware

**Chosen:** `next.config.ts headers()`. Reason: declarative, runs at the CDN/edge layer before the application, and is the recommended Next.js approach. The proxy middleware additionally handles OPTIONS preflight with a `204` short-circuit so auth overhead is skipped for preflight requests.

### Sentry: withSentryConfig vs. manual instrumentation

**Chosen:** `withSentryConfig` wrapper. Reason: automatically instruments all server components, route handlers, and edge middleware without requiring manual `try/catch` additions. Source maps are uploaded at build time for readable stack traces.

### Error pages: three separate files

- `src/app/not-found.tsx` — Next.js convention for the global 404. Needed for routes outside the dashboard layout (e.g., `/some-bad-path`).
- `src/app/(dashboard)/not-found.tsx` — Scoped to the dashboard route group. Shows a simpler message appropriate for "resource not found" inside the authenticated app.
- `src/app/error.tsx` — Root error boundary. Must be a client component (`"use client"`) per Next.js requirements. Handles catastrophic errors in the root layout.
- `src/app/(dashboard)/error.tsx` — Already existed from Week 8. Handles errors inside the dashboard layout.

### Input sanitization: Zod `.trim()` vs. middleware

**Chosen:** Zod schemas. Reason: `.trim()` in Zod strips whitespace _before_ validation, so `min(1)` correctly rejects `"  "`. This is the right layer — validation schemas are the authoritative source of truth for acceptable input shape. Middleware-level sanitization would be too early (raw body not yet parsed) and too broad.

---

## File Map

### New Files

| File | Purpose |
|------|---------|
| `src/lib/rate-limit.ts` | Lazy Redis singleton + three `Ratelimit` instances |
| `src/app/not-found.tsx` | Global 404 page |
| `src/app/(dashboard)/not-found.tsx` | Dashboard-scoped 404 page |
| `src/app/error.tsx` | Root-level error boundary |
| `sentry.client.config.ts` | Browser Sentry SDK init |
| `sentry.server.config.ts` | Server Sentry SDK init |
| `sentry.edge.config.ts` | Edge runtime Sentry SDK init |
| `supabase/migrations/rollback/003_rollback.sql` | Undo 003_kb_storage |
| `supabase/migrations/rollback/004_rollback.sql` | Undo 004_rfp_raw_text |
| `supabase/migrations/rollback/005_rollback.sql` | Undo 005_atomic_proposal_increment |
| `supabase/migrations/rollback/006_rollback.sql` | Undo 006_free_plan |
| `docs/errorhandler.md` | Error handling reference |

### Modified Files

| File | What Changed |
|------|-------------|
| `src/proxy.ts` | OPTIONS short-circuit + IP-based rate limiting |
| `next.config.ts` | CORS/security headers + `withSentryConfig` wrap |
| `src/lib/schemas/auth.ts` | `.trim()` + `.max(254)` on all email/name fields |
| `src/lib/schemas/projects.ts` | `.trim()` on all text fields; `client_name` gets `min(1)` |
| `src/lib/schemas/org.ts` | `.trim()` on name and email fields |
| `src/lib/schemas/kb.ts` | `.trim()` on name, docId, path, query fields |
| `.env.example` | Added `KV_REST_API_URL`, `KV_REST_API_TOKEN`, Sentry vars |
| `package.json` | Added `@upstash/ratelimit`, `@upstash/redis`, `@sentry/nextjs` |

---

## Security Audit Findings

### RLS / UUID Isolation (confirmed — no action)

`current_org_id()` is `SECURITY DEFINER` and reads the org UUID from the Supabase JWT. The JWT is verified by Supabase Auth before any DB query executes. Users in the same org share data by design (PropelRFP is a team tool). Cross-org access is impossible regardless of what the application code does.

Service role (`SUPABASE_SERVICE_ROLE_KEY`) appears in exactly two legitimate places:
- `src/app/api/kb/process/route.ts` — cron route, auth-guarded by `CRON_SECRET` bearer token
- `src/app/api/billing/webhook/route.ts` — Stripe webhook, auth-guarded by signature verification

### Password Reset (confirmed — no action)

`supabase.auth.resetPasswordForEmail()` called with `redirectTo: ${NEXT_PUBLIC_APP_URL}/reset`. The redirect URL is whitelisted in Supabase Auth settings. Token TTL configured to 1 hour in Supabase dashboard → Authentication → Settings.

### DB Indexes (confirmed — no action)

Hot-path queries are already indexed:
- `doc_chunks_embedding_idx` — pgvector cosine search
- `rfp_projects.org_id` — project list queries
- `rfp_sections.project_id` — section list queries
- `subscriptions.org_id` — quota checks

No additional indexes needed at current scale.

---

## Environment Variables Added

| Variable | Where to get it | Used for |
|----------|----------------|---------|
| `KV_REST_API_URL` | Vercel dashboard → Storage → KV | Upstash Redis URL |
| `KV_REST_API_TOKEN` | Vercel dashboard → Storage → KV | Upstash Redis auth |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry → Project → Client Keys | Browser error reporting |
| `SENTRY_DSN` | Sentry → Project → Client Keys | Server error reporting |
| `SENTRY_AUTH_TOKEN` | Sentry → Settings → Auth Tokens | Source map upload at build |
| `SENTRY_ORG` | Your Sentry org slug | Build config |
| `SENTRY_PROJECT` | Your Sentry project slug | Build config |

---

## Manual Steps Required Post-Deploy

1. **Vercel KV** — create a KV store in Vercel dashboard → Storage → Connect Store → Create. Copy `KV_REST_API_URL` and `KV_REST_API_TOKEN` to Vercel env vars and `.env.local`.

2. **Sentry alerts** — in Sentry dashboard, create two alert rules:
   - "PropelRFP — Critical Errors": any Error/Fatal event → email immediately
   - "PropelRFP — Rate Limit Spike": >50 `rate_limited` events in 5 min → email

3. **Supabase OTP expiry** — confirm in Supabase dashboard → Authentication → Settings → Email OTP expiry is set to `3600` (1 hour) or lower.
