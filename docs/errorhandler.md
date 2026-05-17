# PropelRFP — Error Handling Reference

All errors in PropelRFP flow through one of three layers:
1. **API layer** — structured JSON responses via `src/lib/api.ts`
2. **UI layer** — Next.js error boundaries and not-found pages
3. **Monitoring layer** — Sentry captures unhandled exceptions

---

## API Error Codes

All API responses use the envelope format: `{ data: T | null, error: { code, message } | null }`.

| HTTP Status | Error Code | When it's returned |
|-------------|-----------|-------------------|
| 400 | `validation_failed` | Zod schema rejected the request body |
| 401 | `unauthorized` | No Supabase session or invalid session |
| 403 | `forbidden` | Authenticated but insufficient role (e.g., member trying to delete org) |
| 404 | `not_found` | Resource doesn't exist or belongs to another org |
| 402 | `QUOTA_EXCEEDED` | Plan limit hit (proposals, storage, members) |
| 429 | `rate_limited` | Too many requests from this IP — see rate limit headers |
| 500 | `internal_error` | Unhandled exception (logged to Sentry) |

### Rate Limit Response Headers

When `429` is returned, these headers are included:

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1716000060000   (Unix ms timestamp)
Retry-After: 42                    (seconds until reset)
```

### Rate Limits by Endpoint Group

| Endpoint Pattern | Limit | Window |
|-----------------|-------|--------|
| `/api/auth/*` | 10 requests | 60 seconds per IP |
| `/api/projects/*/sections/*/generate` | 20 requests | 60 seconds per IP |
| All other `/api/*` | 100 requests | 60 seconds per IP |

---

## UI Error Screens

| Screen | File | Trigger |
|--------|------|---------|
| Global 404 | `src/app/not-found.tsx` | Any unknown route outside dashboard |
| Dashboard 404 | `src/app/(dashboard)/not-found.tsx` | Unknown route inside dashboard (e.g., `/projects/nonexistent-id`) |
| Root error | `src/app/error.tsx` | Unhandled exception in root layout |
| Dashboard error | `src/app/(dashboard)/error.tsx` | Unhandled exception inside dashboard |

All error pages:
- Do NOT expose stack traces.
- Show a user-readable message.
- Show a `digest` reference code (Next.js error digest) for support tickets.
- Provide a recovery action (retry button, back to dashboard link).

---

## Quota Exceeded Flow (`402`)

When any quota API returns `402 QUOTA_EXCEEDED`, the client-side `handleApiError()` utility in `src/lib/billing/handle-error.ts` automatically opens the `UpgradeModal`.

The response body includes:

```json
{
  "data": null,
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "Proposal limit reached",
    "limitType": "proposals",
    "current": 3,
    "limit": 3,
    "plan": "free"
  }
}
```

---

## Sentry Integration

Sentry captures all unhandled server-side exceptions automatically via `withSentryConfig` in `next.config.ts`.

- **Alert rule:** Any Error/Fatal event triggers an email within 1 minute.
- **Rate spike alert:** >50 `rate_limited` events in 5 minutes triggers an email.
- **Error digest:** The `digest` shown on error screens matches Sentry's event ID for cross-referencing.
- **Source maps:** Uploaded at build time via `SENTRY_AUTH_TOKEN` — stack traces in Sentry show original TypeScript source.

### Sentry Alert Setup

In Sentry dashboard → Alerts → Create Alert Rule:

**Alert 1 — Critical Errors:**
- Condition: Number of events is above 1 in 1 minute
- Filter: Level = Error or Fatal
- Action: Send email to your address
- Name: "PropelRFP — Critical Errors"

**Alert 2 — Rate Limit Spike:**
- Condition: Number of events is above 50 in 5 minutes
- Filter: Message contains "rate_limited"
- Action: Send email
- Name: "PropelRFP — Rate Limit Spike"

---

## Deployment Rollback

### Vercel Instant Rollback (recommended — ~10 seconds, zero downtime)

1. Go to Vercel dashboard → your project → Deployments.
2. Find the last known-good deploy (the one with the green "Production" badge before the broken deploy).
3. Click the three-dot menu → **Promote to Production**.
4. Vercel swaps traffic instantly. No redeployment needed.

### Git Revert (when you need to remove code from history)

```bash
git log --oneline -10          # find the commit to revert
git revert HEAD --no-edit      # creates a revert commit
git push origin main           # Vercel auto-deploys
```

### DB + Deploy Mismatch

If a deploy includes a migration and the deploy fails:
1. First rollback the Vercel deploy (Promote to Production above).
2. Apply the matching rollback SQL from `supabase/migrations/rollback/`.
3. Open Supabase dashboard → SQL Editor.
4. Paste and run the rollback SQL.
5. Verify data integrity before re-deploying.

---

## Adding a New Error Code

1. Add the code to the `ApiErrors` enum in `src/lib/api.ts`.
2. Return it from the route with `return fail("your_code", "Human message", httpStatus)`.
3. Add it to the table above in this document.
4. If it should trigger an UpgradeModal, add handling in `src/lib/billing/handle-error.ts`.

---

## Where NOT to Use `console.error`

Per project coding conventions, production code must not use `console.log` or `console.error`. Instead:
- **Server routes**: Let unhandled exceptions propagate — `withErrorHandling()` catches them, returns 500, and Sentry captures them.
- **Background jobs** (cron): Silently `break` on failure and return a structured `fail()` response.
- **Client components**: Let the error bubble to the nearest `error.tsx` boundary.
