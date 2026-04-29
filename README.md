# PropelRFP

> Win more contracts, faster. AI-powered RFP and proposal automation grounded in your company's own winning history.

## Stack

- **Framework**: Next.js 16 (App Router) with TypeScript strict mode
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Database**: Supabase (PostgreSQL + pgvector)
- **Auth**: Supabase Auth (email/password + Google OAuth)
- **Storage**: Supabase Storage (private `documents` bucket)
- **LLM**: Claude API (claude-sonnet-4-5) for draft generation + section detection
- **Embeddings**: OpenAI text-embedding-3-small (1,536 dimensions)
- **Payments**: Stripe (subscriptions + customer portal)
- **Email**: Resend
- **Deployment**: Vercel
- **Package Manager**: pnpm

## Getting Started

1. **Set up accounts** (one-time): Supabase, Anthropic, OpenAI, Stripe, Resend.
2. **Copy env template**:
   ```bash
   cp .env.example .env.local
   ```
   Fill in the values from each service's dashboard.
3. **Run the schema migration**:
   ```bash
   supabase db push
   ```
4. **Install dependencies and start the dev server**:
   ```bash
   pnpm install
   pnpm dev
   ```
   Open http://localhost:3000.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start the dev server with Turbopack |
| `pnpm build` | Production build (runs TypeScript check) |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format every file with Prettier |
| `pnpm format:check` | Check formatting without writing |
| `pnpm typecheck` | TypeScript type-check only |

## Architecture

- **Multi-tenant**: every table has `org_id`, isolated by Supabase RLS.
- **Server components by default**. Client components only for interactivity.
- **API**: Route Handlers under `src/app/api/*`. All responses follow the `{ data, error }` envelope (see `src/lib/api.ts`).
- **AI keys are server-side only**. Never exposed to the browser.
- **Streaming**: Claude API responses stream to the frontend via `ReadableStream`.
- **Background jobs**: Vercel Cron drives the document parse → chunk → embed pipeline.

## Project Layout

```
src/
  app/
    (auth)/             Login + signup pages
    (dashboard)/        Protected dashboard routes
    auth/callback/      OAuth callback handler
    api/                Route handlers per module
  lib/
    supabase/           Browser, server, service-role clients + middleware helper
    ai/                 Embeddings, Claude streaming, prompts
    stripe/             SDK client + webhook handlers
    api.ts              { data, error } response helpers
    utils.ts            cn() Tailwind helper
  types/                Database + app types
  proxy.ts              Auth route protection (was middleware.ts in Next.js < 16)
supabase/
  migrations/           SQL migrations
  seed.sql              Dev seed data
```

## Branching

| Branch | Purpose |
|---|---|
| `main` | Production. Auto-deploys to Vercel production. |
| `develop` | Integration branch. Auto-deploys to staging preview. |
| `feature/*` | One branch per module/sub-feature. PR into `develop`. |
| `hotfix/*` | Emergency fixes branched from `main`. |

## Roadmap

| Week | Module | Branch |
|---|---|---|
| 1 | Foundation (this) | `main` |
| 2 | Auth & Org | `feature/auth-and-org` |
| 3 | Knowledge Base | `feature/kb` |
| 4 | RFP Projects | `feature/rfp-projects` |
| 5 | AI Generation Engine | `feature/rag-pipeline` |
| 6 | Review & Editor + Export | `feature/editor-export` |
| 7 | Billing & Limits | `feature/billing` |
| 8 | UAT & Launch | `feature/launch` |

See `changeLog.md` for a per-week record of all file changes.
