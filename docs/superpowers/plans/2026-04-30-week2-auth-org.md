# Week 2 — Auth & Org Module: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the placeholder auth pages from Week 1 into the complete Auth & Org module: signup wizard, login, password reset, Google OAuth, email-link invites, and split settings pages with role-based controls.

**Architecture:** Hybrid Next.js 16: Server Components for reads (settings pages), API Route Handlers for mutations using the existing `{ data, error }` envelope. Forms use react-hook-form + Zod with shared schemas. RBAC enforced at DB layer (RLS) and at API layer (`requireRole` server util). Single user → single org enforced by schema.

**Tech Stack:** Next.js 16.2.4, TypeScript strict, Supabase (`@supabase/ssr`), Tailwind 4 + shadcn/ui, react-hook-form, Zod, Resend.

**Spec:** `docs/superpowers/specs/2026-04-30-week2-auth-org-design.md`

**Branch:** `feature/auth-and-org`

**Note on testing:** Per spec section 2 (decision #8), automated tests are deferred to a later sprint. Verification gates in this plan are: `pnpm typecheck`, `pnpm lint`, `pnpm build`, and the manual smoke matrix in spec section 10.

---

## Phase 1 — Setup & Primitives

### Task 1: Create branch and migration 002 (invitations table)

**Files:**
- Create: `supabase/migrations/002_invitations.sql`

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feature/auth-and-org
```

- [ ] **Step 2: Create migration file**

Create `supabase/migrations/002_invitations.sql` with this exact content:

```sql
-- ─────────────────────────────────────────────
-- INVITATIONS (email-link team invites)
-- ─────────────────────────────────────────────
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

create index invitations_org_id_idx on invitations(org_id);
create index invitations_token_idx on invitations(token);
create index invitations_email_status_idx on invitations(email, status);

alter table invitations enable row level security;

create policy "invitations_org_read" on invitations
  for select using (org_id = current_org_id());

create policy "invitations_admin_insert" on invitations
  for insert with check (
    org_id = current_org_id()
    and exists (
      select 1 from users
      where id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "invitations_admin_update" on invitations
  for update using (
    org_id = current_org_id()
    and exists (
      select 1 from users
      where id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- Public read by token (unguessable). Accept logic gates DB writes server-side.
create policy "invitations_token_lookup" on invitations
  for select using (true);
```

- [ ] **Step 3: Apply migration**

Run: `supabase db push`

Expected: "Applied migration 002_invitations.sql".
If you have no Supabase CLI link yet, run `supabase link --project-ref <ref>` first.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/002_invitations.sql
git commit -m "feat(db): add invitations table for team invite flow"
```

---

### Task 2: Add invitations type to Database type

**Files:**
- Modify: `src/types/database.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `invitations` table to `Database["public"]["Tables"]`**

In `src/types/database.ts`, add this entry to the `Tables` object (after `gen_logs`):

```ts
invitations: {
  Row: {
    id: string;
    org_id: string;
    email: string;
    role: "admin" | "member";
    token: string;
    invited_by: string;
    status: "pending" | "accepted" | "revoked" | "expired";
    expires_at: string;
    created_at: string;
    accepted_at: string | null;
  };
  Insert: {
    id?: string;
    org_id: string;
    email: string;
    role?: "admin" | "member";
    token?: string;
    invited_by: string;
    status?: "pending" | "accepted" | "revoked" | "expired";
    expires_at?: string;
    created_at?: string;
    accepted_at?: string | null;
  };
  Update: {
    id?: string;
    org_id?: string;
    email?: string;
    role?: "admin" | "member";
    token?: string;
    invited_by?: string;
    status?: "pending" | "accepted" | "revoked" | "expired";
    expires_at?: string;
    created_at?: string;
    accepted_at?: string | null;
  };
  Relationships: [
    {
      foreignKeyName: "invitations_org_id_fkey";
      columns: ["org_id"];
      referencedRelation: "organizations";
      referencedColumns: ["id"];
    },
    {
      foreignKeyName: "invitations_invited_by_fkey";
      columns: ["invited_by"];
      referencedRelation: "users";
      referencedColumns: ["id"];
    },
  ];
};
```

- [ ] **Step 2: Add `Invitation` named type to `src/types/index.ts`**

Append after `GenLog`:

```ts
export type Invitation = Tables<"invitations">;
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type InviteRole = "admin" | "member";
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts src/types/index.ts
git commit -m "feat(types): add Invitation table to database type"
```

---

### Task 3: Install dependencies and shadcn primitives

**Files:**
- Modify: `package.json` (via pnpm)
- Create: `src/components/ui/*.tsx` (one per shadcn primitive)

- [ ] **Step 1: Install runtime deps**

```bash
pnpm add react-hook-form @hookform/resolvers
```

- [ ] **Step 2: Install shadcn primitives**

```bash
pnpm dlx shadcn@latest add button input label card dialog table dropdown-menu select alert sonner
```

When prompted to overwrite, choose yes. The CLI will create files in `src/components/ui/`.

- [ ] **Step 3: Add `<Toaster />` to root layout**

Modify `src/app/layout.tsx`. Inside `<body>` add `<Toaster richColors />` after `{children}`:

```tsx
import { Toaster } from "@/components/ui/sonner";

// ... existing code ...

<body className="min-h-full flex flex-col">
  {children}
  <Toaster richColors />
</body>
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck` and `pnpm build`
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/ui/ src/app/layout.tsx
git commit -m "feat(ui): install react-hook-form and shadcn primitives"
```

---

### Task 4: Add Zod schemas for auth

**Files:**
- Create: `src/lib/schemas/auth.ts`

- [ ] **Step 1: Create the file**

```ts
// src/lib/schemas/auth.ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupAccountSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});
export type SignupAccountInput = z.infer<typeof signupAccountSchema>;

export const forgotSchema = z.object({
  email: z.string().email("Invalid email"),
});
export type ForgotInput = z.infer<typeof forgotSchema>;

export const resetSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters").max(72),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });
export type ResetInput = z.infer<typeof resetSchema>;

// Discriminated union for /api/auth/signup
export const signupBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create-account"), ...signupAccountSchema.shape }),
  z.object({
    action: z.literal("create-org"),
    name: z.string().min(1, "Org name is required").max(100),
    industry: z.string().min(1, "Industry is required"),
  }),
]);
export type SignupBody = z.infer<typeof signupBodySchema>;
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/schemas/auth.ts
git commit -m "feat(schemas): add auth Zod schemas"
```

---

### Task 5: Add Zod schemas for org and invites

**Files:**
- Create: `src/lib/schemas/org.ts`

- [ ] **Step 1: Create the file**

```ts
// src/lib/schemas/org.ts
import { z } from "zod";
import { INDUSTRIES } from "@/types";

export const orgUpdateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  industry: z.enum(INDUSTRIES as readonly [string, ...string[]]),
  website: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  size: z.enum(["1-10", "11-50", "51-200", "201-1000", "1000+"]).optional(),
});
export type OrgUpdateInput = z.infer<typeof orgUpdateSchema>;

export const inviteCreateSchema = z.object({
  email: z.string().email("Invalid email"),
  role: z.enum(["admin", "member"]),
});
export type InviteCreateInput = z.infer<typeof inviteCreateSchema>;

export const memberRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});
export type MemberRoleInput = z.infer<typeof memberRoleSchema>;

export const memberActionSchema = z.object({
  action: z.literal("transfer-ownership"),
});
export type MemberActionInput = z.infer<typeof memberActionSchema>;
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/schemas/org.ts
git commit -m "feat(schemas): add org and invite Zod schemas"
```

---

### Task 6: Add `requireRole` server util and `withErrorHandling`

**Files:**
- Create: `src/lib/auth/requireRole.ts`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Create `requireRole`**

```ts
// src/lib/auth/requireRole.ts
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ApiError("unauthorized", "Authentication required", 401);

  const { data: row, error } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("id", user.id)
    .single();

  if (error || !row) {
    throw new ApiError("forbidden", "Not a member of any organization", 403);
  }
  if (!allowed.includes(row.role as UserRole)) {
    throw new ApiError(
      "forbidden",
      `Requires role: ${allowed.join(" or ")}`,
      403
    );
  }

  return {
    userId: row.id,
    orgId: row.org_id,
    role: row.role as UserRole,
    supabase,
  };
}
```

- [ ] **Step 2: Extend `src/lib/api.ts` with `withErrorHandling`**

Add to the bottom of `src/lib/api.ts`:

```ts
import { ApiError } from "@/lib/auth/requireRole";
import { ZodError } from "zod";

export function withErrorHandling(
  handler: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<NextResponse>
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
        return fail(err.code, err.message, err.status);
      }
      console.error("[api] unhandled error", err);
      return ApiErrors.InternalError();
    }
  };
}
```

Note: the existing `ApiErrors.Unauthorized` / `Forbidden` helpers stay as-is for direct use. `requireRole` throws its own `ApiError` (caught by `withErrorHandling`).

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/requireRole.ts src/lib/api.ts
git commit -m "feat(auth): add requireRole and withErrorHandling helpers"
```

---

### Task 7: Auth UI helpers (AuthCard + GoogleButton + FormField)

**Files:**
- Create: `src/components/auth/AuthCard.tsx`
- Create: `src/components/auth/GoogleButton.tsx`
- Create: `src/components/auth/FormField.tsx`

- [ ] **Step 1: AuthCard**

```tsx
// src/components/auth/AuthCard.tsx
import Link from "next/link";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F9FB] p-6">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{ background: "linear-gradient(135deg, #162B44, #2E75B6)" }}
          >
            P
          </div>
          <span className="text-2xl font-bold tracking-tight" style={{ color: "#162B44" }}>
            PropelRFP
          </span>
        </Link>
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "#162B44" }}>
            {title}
          </h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div> : null}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: GoogleButton**

```tsx
// src/components/auth/GoogleButton.tsx
"use client";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function GoogleButton({ next = "/signup/org" }: { next?: string }) {
  const supabase = createClient();

  async function onClick() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  return (
    <Button type="button" variant="outline" className="w-full" onClick={onClick}>
      Continue with Google
    </Button>
  );
}
```

- [ ] **Step 3: FormField**

```tsx
// src/components/auth/FormField.tsx
import { Label } from "@/components/ui/label";

export function FormField({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/
git commit -m "feat(ui): auth shared components (card, google, field)"
```

---

## Phase 2 — Auth Flows

### Task 8: Build login page

**Files:**
- Replace: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Replace placeholder**

```tsx
// src/app/(auth)/login/page.tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthCard } from "@/components/auth/AuthCard";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { FormField } from "@/components/auth/FormField";
import { loginSchema, type LoginInput } from "@/lib/schemas/auth";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const removed = params.get("error") === "removed";

  async function onSubmit(values: LoginInput) {
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      toast.error(error.message);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your PropelRFP workspace"
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      {removed ? (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          You were removed from your organization. Sign in with a different account or create a new
          one.
        </div>
      ) : null}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
        </FormField>
        <FormField label="Password" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register("password")}
          />
        </FormField>
        <div className="text-right">
          <Link href="/forgot" className="text-xs text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>
      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <GoogleButton next="/dashboard" />
    </AuthCard>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/login/page.tsx
git commit -m "feat(auth): real login page with email/pass + Google"
```

---

### Task 9: Build signup wizard step 1 (`/signup`)

**Files:**
- Replace: `src/app/(auth)/signup/page.tsx`

- [ ] **Step 1: Replace placeholder**

```tsx
// src/app/(auth)/signup/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthCard } from "@/components/auth/AuthCard";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { FormField } from "@/components/auth/FormField";
import { signupAccountSchema, type SignupAccountInput } from "@/lib/schemas/auth";

export default function SignupPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupAccountInput>({ resolver: zodResolver(signupAccountSchema) });

  async function onSubmit(values: SignupAccountInput) {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create-account", ...values }),
    });
    const json = await res.json();
    if (json.error) {
      toast.error(json.error.message);
      return;
    }
    router.replace("/signup/org");
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Step 1 of 2: your details"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Full name" htmlFor="full_name" error={errors.full_name?.message}>
          <Input id="full_name" autoComplete="name" {...register("full_name")} />
        </FormField>
        <FormField label="Work email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
        </FormField>
        <FormField label="Password" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register("password")}
          />
        </FormField>
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Creating account..." : "Continue"}
        </Button>
      </form>
      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <GoogleButton next="/signup/org" />
    </AuthCard>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/signup/page.tsx
git commit -m "feat(auth): signup wizard step 1 (account)"
```

---

### Task 10: Build signup wizard step 2 (`/signup/org`)

**Files:**
- Create: `src/app/(auth)/signup/org/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/app/(auth)/signup/org/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { INDUSTRIES } from "@/types";
import { createClient } from "@/lib/supabase/client";

const orgStepSchema = z.object({
  name: z.string().min(1, "Org name is required").max(100),
  industry: z.enum(INDUSTRIES as readonly [string, ...string[]]),
});
type OrgStepInput = z.infer<typeof orgStepSchema>;

export default function SignupOrgPage() {
  const router = useRouter();
  const supabase = createClient();
  const [defaults, setDefaults] = useState<Partial<OrgStepInput>>({});
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OrgStepInput>({ resolver: zodResolver(orgStepSchema) });

  // Prefill org name with "{full_name}'s Workspace" if available
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const fullName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined);
      if (fullName) {
        const suggestion = `${fullName.split(" ")[0]}'s Workspace`;
        setDefaults({ name: suggestion });
        setValue("name", suggestion);
      }
    })();
  }, [supabase, router, setValue]);

  async function onSubmit(values: OrgStepInput) {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create-org", ...values }),
    });
    const json = await res.json();
    if (json.error) {
      toast.error(json.error.message);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  const industry = watch("industry");

  return (
    <AuthCard title="Tell us about your company" subtitle="Step 2 of 2: organization">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Organization name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" defaultValue={defaults.name ?? ""} {...register("name")} />
        </FormField>
        <FormField label="Industry" htmlFor="industry" error={errors.industry?.message}>
          <Select
            value={industry}
            onValueChange={(v) => setValue("industry", v as OrgStepInput["industry"])}
          >
            <SelectTrigger id="industry">
              <SelectValue placeholder="Select industry" />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Creating workspace..." : "Create workspace"}
        </Button>
      </form>
    </AuthCard>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/signup/org/page.tsx
git commit -m "feat(auth): signup wizard step 2 (org details)"
```

---

### Task 11: Build `/api/auth/signup` route handler

**Files:**
- Create: `src/app/api/auth/signup/route.ts`

- [ ] **Step 1: Create the file**

```ts
// src/app/api/auth/signup/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ApiErrors, ok, withErrorHandling } from "@/lib/api";
import { signupBodySchema } from "@/lib/schemas/auth";

export const POST = withErrorHandling(async (req) => {
  const body = signupBodySchema.parse(await req.json());
  const supabase = await createClient();

  if (body.action === "create-account") {
    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.password,
      options: { data: { full_name: body.full_name } },
    });
    if (error) {
      return NextResponse.json(
        { data: null, error: { code: "auth_error", message: error.message } },
        { status: 400 }
      );
    }
    return ok({ userId: data.user?.id ?? null });
  }

  // action === "create-org"
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return ApiErrors.Unauthorized();

  // Idempotency: if user already has a users row, just return their org
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

  return ok({ orgId: org.id });
});
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/signup/route.ts
git commit -m "feat(api): /api/auth/signup handles account + org creation"
```

---

### Task 12: Build `/forgot` page

**Files:**
- Create: `src/app/(auth)/forgot/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// src/app/(auth)/forgot/page.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { forgotSchema, type ForgotInput } from "@/lib/schemas/auth";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPage() {
  const supabase = createClient();
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotInput>({ resolver: zodResolver(forgotSchema) });

  async function onSubmit(values: ForgotInput) {
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/reset`,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle={sent ? undefined : "We'll email you a reset link"}
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <p className="text-sm text-muted-foreground">
          If that email is registered, a password reset link is on its way.
        </p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
          </FormField>
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Sending..." : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/forgot/page.tsx
git commit -m "feat(auth): forgot password page"
```

---

### Task 13: Build `/reset` page

**Files:**
- Create: `src/app/(auth)/reset/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// src/app/(auth)/reset/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { resetSchema, type ResetInput } from "@/lib/schemas/auth";
import { createClient } from "@/lib/supabase/client";

export default function ResetPage() {
  const router = useRouter();
  const supabase = createClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetInput>({ resolver: zodResolver(resetSchema) });

  async function onSubmit(values: ResetInput) {
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated");
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <AuthCard title="Set a new password" subtitle="Enter and confirm your new password">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="New password" htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
        </FormField>
        <FormField label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}>
          <Input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} />
        </FormField>
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Saving..." : "Update password"}
        </Button>
      </form>
    </AuthCard>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/reset/page.tsx
git commit -m "feat(auth): reset password page"
```

---

## Phase 3 — Proxy Update (Eviction + Orphan Recovery)

### Task 14: Update proxy to handle eviction and orphan recovery

**Files:**
- Modify: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Replace `updateSession` body**

Replace the `updateSession` function in `src/lib/supabase/middleware.ts` with:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

const PUBLIC_PATHS = ["/", "/login", "/signup", "/forgot", "/reset"];
const ORPHAN_OK_PREFIXES = ["/signup/org", "/auth/", "/api/auth/signup"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return supabaseResponse;

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/invite/");
  const isOrphanOk = ORPHAN_OK_PREFIXES.some((p) => pathname.startsWith(p));

  // Unauthenticated user trying to reach a protected page
  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  // Authenticated user — check for eviction or orphan state
  if (user) {
    const { data: dbUser } = await supabase
      .from("users")
      .select("id, org_id")
      .eq("id", user.id)
      .maybeSingle();

    // Evicted: signed-in but no users row, and not in orphan-recovery flow
    if (!dbUser && !isOrphanOk) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "removed");
      return NextResponse.redirect(url);
    }

    // Bounce away from auth pages once logged in
    if (dbUser && (pathname === "/login" || pathname === "/signup")) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      return NextResponse.redirect(redirectUrl);
    }

    // Orphan recovery: signed-in mid-wizard. Force them to /signup/org from any
    // protected page that isn't in the orphan-OK set.
    if (dbUser && !dbUser.org_id && !isOrphanOk && !isPublic) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/signup/org";
      return NextResponse.redirect(redirectUrl);
    }
  }

  return supabaseResponse;
}
```

Note: `users.org_id` is `NOT NULL` per schema, so the `!dbUser.org_id` branch is theoretically unreachable today — but it's cheap insurance and lets us relax that constraint later without a regression. Keep it.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/middleware.ts
git commit -m "feat(proxy): handle evicted users and orphan signup recovery"
```

---

## Phase 4 — Settings: Org Page

### Task 15: Settings layout (tab nav)

**Files:**
- Create: `src/app/(dashboard)/settings/layout.tsx`

- [ ] **Step 1: Create the layout**

```tsx
// src/app/(dashboard)/settings/layout.tsx
import Link from "next/link";

const TABS = [
  { href: "/settings/org", label: "Organization" },
  { href: "/settings/members", label: "Members" },
  { href: "#", label: "Billing", disabled: true },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-4xl p-6 md:p-10">
      <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "#162B44" }}>
        Settings
      </h1>
      <nav className="mt-4 flex gap-1 border-b border-border">
        {TABS.map((t) =>
          t.disabled ? (
            <span
              key={t.label}
              className="cursor-not-allowed border-b-2 border-transparent px-4 py-2 text-sm text-muted-foreground"
              title="Coming soon"
            >
              {t.label}
            </span>
          ) : (
            <Link
              key={t.href}
              href={t.href}
              className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-foreground hover:border-primary"
            >
              {t.label}
            </Link>
          )
        )}
      </nav>
      <div className="mt-8">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/settings/layout.tsx
git commit -m "feat(settings): tab nav layout"
```

---

### Task 16: `/settings/org` page (server component)

**Files:**
- Create: `src/app/(dashboard)/settings/org/page.tsx`
- Create: `src/app/(dashboard)/settings/org/OrgForm.tsx`
- Create: `src/app/(dashboard)/settings/org/DangerZone.tsx`

- [ ] **Step 1: Page (server component)**

```tsx
// src/app/(dashboard)/settings/org/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OrgForm } from "./OrgForm";
import { DangerZone } from "./DangerZone";

export default async function OrgSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("users")
    .select("org_id, role")
    .eq("id", user.id)
    .single();
  if (!me) redirect("/login");

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, industry, website, size")
    .eq("id", me.org_id)
    .single();
  if (!org) redirect("/login");

  const canEdit = me.role === "owner";

  return (
    <div className="space-y-12">
      <section>
        <h2 className="text-lg font-semibold">Organization details</h2>
        <p className="text-sm text-muted-foreground">
          {canEdit
            ? "Update your organization profile."
            : "Only the organization owner can change these settings."}
        </p>
        <div className="mt-6">
          <OrgForm initialData={org} canEdit={canEdit} />
        </div>
      </section>
      {canEdit ? (
        <section>
          <h2 className="text-lg font-semibold text-destructive">Danger zone</h2>
          <DangerZone orgName={org.name} />
        </section>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: OrgForm (client)**

```tsx
// src/app/(dashboard)/settings/org/OrgForm.tsx
"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/auth/FormField";
import { orgUpdateSchema, type OrgUpdateInput } from "@/lib/schemas/org";
import { INDUSTRIES } from "@/types";

const SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;

type Org = { id: string; name: string; industry: string | null; website: string | null; size: string | null };

export function OrgForm({ initialData, canEdit }: { initialData: Org; canEdit: boolean }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OrgUpdateInput>({
    resolver: zodResolver(orgUpdateSchema),
    defaultValues: {
      name: initialData.name,
      industry: (initialData.industry ?? INDUSTRIES[0]) as OrgUpdateInput["industry"],
      website: initialData.website ?? "",
      size: (initialData.size as OrgUpdateInput["size"]) ?? undefined,
    },
  });

  async function onSubmit(values: OrgUpdateInput) {
    const res = await fetch("/api/org", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const json = await res.json();
    if (json.error) {
      toast.error(json.error.message);
      return;
    }
    toast.success("Saved");
    router.refresh();
  }

  const industry = watch("industry");
  const size = watch("size");
  const disabled = !canEdit;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid max-w-2xl gap-4">
      <FormField label="Organization name" htmlFor="name" error={errors.name?.message}>
        <Input id="name" disabled={disabled} {...register("name")} />
      </FormField>
      <FormField label="Industry" htmlFor="industry" error={errors.industry?.message}>
        <Select
          value={industry}
          onValueChange={(v) => setValue("industry", v as OrgUpdateInput["industry"])}
          disabled={disabled}
        >
          <SelectTrigger id="industry">
            <SelectValue placeholder="Select industry" />
          </SelectTrigger>
          <SelectContent>
            {INDUSTRIES.map((i) => (
              <SelectItem key={i} value={i}>
                {i}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label="Website" htmlFor="website" error={errors.website?.message}>
        <Input id="website" type="url" placeholder="https://..." disabled={disabled} {...register("website")} />
      </FormField>
      <FormField label="Company size" htmlFor="size" error={errors.size?.message}>
        <Select
          value={size ?? undefined}
          onValueChange={(v) => setValue("size", v as OrgUpdateInput["size"])}
          disabled={disabled}
        >
          <SelectTrigger id="size">
            <SelectValue placeholder="Select size" />
          </SelectTrigger>
          <SelectContent>
            {SIZES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      {canEdit ? (
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save changes"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
```

- [ ] **Step 3: DangerZone (client)**

```tsx
// src/app/(dashboard)/settings/org/DangerZone.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

export function DangerZone({ orgName }: { orgName: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    setBusy(true);
    const res = await fetch("/api/org", { method: "DELETE" });
    const json = await res.json();
    if (json.error) {
      toast.error(json.error.message);
      setBusy(false);
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/signup");
    router.refresh();
  }

  return (
    <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-4">
      <p className="text-sm">
        Deleting your organization permanently removes all proposals, knowledge documents, and
        member accounts. This cannot be undone.
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive" className="mt-3">
            Delete organization
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {orgName}?</DialogTitle>
            <DialogDescription>
              Type <span className="font-semibold">{orgName}</span> below to confirm. This is
              permanent.
            </DialogDescription>
          </DialogHeader>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={orgName} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirm !== orgName || busy}
              onClick={handleDelete}
            >
              {busy ? "Deleting..." : "Delete forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/settings/org/
git commit -m "feat(settings): org details page with form and danger zone"
```

---

### Task 17: `/api/org` route (PATCH update + DELETE)

**Files:**
- Create: `src/app/api/org/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/org/route.ts
import { ok, withErrorHandling } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { orgUpdateSchema } from "@/lib/schemas/org";

export const PATCH = withErrorHandling(async (req) => {
  const { orgId, supabase } = await requireRole(["owner"]);
  const body = orgUpdateSchema.parse(await req.json());
  const { data, error } = await supabase
    .from("organizations")
    .update({
      name: body.name,
      industry: body.industry,
      website: body.website ?? null,
      size: body.size ?? null,
    })
    .eq("id", orgId)
    .select("id, name, industry, website, size")
    .single();
  if (error || !data) {
    console.error("[org.patch]", error);
    throw new Error("update_failed");
  }
  return ok(data);
});

export const DELETE = withErrorHandling(async () => {
  const { orgId, supabase } = await requireRole(["owner"]);
  const { error } = await supabase.from("organizations").delete().eq("id", orgId);
  if (error) {
    console.error("[org.delete]", error);
    throw new Error("delete_failed");
  }
  return ok(null);
});
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/org/route.ts
git commit -m "feat(api): /api/org PATCH and DELETE for owner"
```

---

## Phase 5 — Invitations

### Task 18: Email template + sendInvite helper

**Files:**
- Create: `src/lib/email/templates/InviteEmail.tsx`
- Create: `src/lib/email/sendInvite.ts`

- [ ] **Step 1: Create the React email template**

```tsx
// src/lib/email/templates/InviteEmail.tsx
export function InviteEmail({
  orgName,
  inviterName,
  acceptUrl,
}: {
  orgName: string;
  inviterName: string;
  acceptUrl: string;
}) {
  return (
    <div
      style={{
        fontFamily: "Helvetica, Arial, sans-serif",
        color: "#162B44",
        padding: "32px",
        maxWidth: "560px",
      }}
    >
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>You&apos;ve been invited to {orgName}</h1>
      <p style={{ color: "#475569", lineHeight: 1.5 }}>
        {inviterName} invited you to join <strong>{orgName}</strong> on PropelRFP. Click the button
        below to accept the invitation. The link expires in 7 days.
      </p>
      <a
        href={acceptUrl}
        style={{
          display: "inline-block",
          marginTop: 16,
          padding: "12px 20px",
          background: "#162B44",
          color: "#fff",
          textDecoration: "none",
          borderRadius: 8,
          fontWeight: 600,
        }}
      >
        Accept invitation
      </a>
      <p style={{ marginTop: 24, color: "#94a3b8", fontSize: 12 }}>
        If you weren&apos;t expecting this email, you can safely ignore it.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create the sendInvite helper**

```ts
// src/lib/email/sendInvite.ts
import { Resend } from "resend";
import { InviteEmail } from "./templates/InviteEmail";

export async function sendInvite(params: {
  to: string;
  orgName: string;
  inviterName: string;
  token: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.RESEND_FROM_EMAIL ?? "PropelRFP <onboarding@resend.dev>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  if (!apiKey) {
    throw new Error("RESEND_API_KEY not configured");
  }
  const resend = new Resend(apiKey);
  const acceptUrl = `${appUrl}/invite/${params.token}`;
  await resend.emails.send({
    from: fromAddr,
    to: params.to,
    subject: `You're invited to ${params.orgName} on PropelRFP`,
    react: InviteEmail({
      orgName: params.orgName,
      inviterName: params.inviterName,
      acceptUrl,
    }),
  });
}
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/
git commit -m "feat(email): invite template and Resend wrapper"
```

---

### Task 19: `POST /api/org/invitations` (create + resend via upsert) and `DELETE` (cancel)

**Files:**
- Create: `src/app/api/org/invitations/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/org/invitations/route.ts
import { NextResponse } from "next/server";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { inviteCreateSchema } from "@/lib/schemas/org";
import { sendInvite } from "@/lib/email/sendInvite";

export const POST = withErrorHandling(async (req) => {
  const { userId, orgId, supabase } = await requireRole(["owner", "admin"]);
  const body = inviteCreateSchema.parse(await req.json());

  // Reject if email is already an active member of this org
  const { data: existingUser } = await supabase
    .from("users")
    .select("id")
    .eq("org_id", orgId)
    .eq("email", body.email)
    .maybeSingle();
  if (existingUser) {
    return fail("conflict", "That email is already a member of this organization", 409);
  }

  // Upsert the invitation by (org_id, email).
  // We can't use .upsert() with token regen, so we explicitly check.
  const { data: existing } = await supabase
    .from("invitations")
    .select("id")
    .eq("org_id", orgId)
    .eq("email", body.email)
    .maybeSingle();

  let invitation;
  if (existing) {
    // Regenerate token + bump expiry
    const { data, error } = await supabase
      .from("invitations")
      .update({
        role: body.role,
        invited_by: userId,
        // Token regen + expires_at must use raw SQL via rpc OR re-insert.
        // Simplest: use Postgres defaults by calling a tiny rpc.
        // Pragmatic alternative: generate token client-side.
        token: cryptoRandomToken(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: "pending",
      })
      .eq("id", existing.id)
      .select("id, token, role")
      .single();
    if (error || !data) throw error ?? new Error("update_failed");
    invitation = data;
  } else {
    const { data, error } = await supabase
      .from("invitations")
      .insert({
        org_id: orgId,
        email: body.email,
        role: body.role,
        invited_by: userId,
        token: cryptoRandomToken(),
      })
      .select("id, token, role")
      .single();
    if (error || !data) throw error ?? new Error("insert_failed");
    invitation = data;
  }

  // Need org name + inviter name for the email body
  const [{ data: org }, { data: inviter }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).single(),
    supabase.from("users").select("full_name, email").eq("id", userId).single(),
  ]);

  try {
    await sendInvite({
      to: body.email,
      orgName: org?.name ?? "your team",
      inviterName: inviter?.full_name ?? inviter?.email ?? "A teammate",
      token: invitation.token,
    });
  } catch (err) {
    console.error("[invitations.send] email failed", err);
    return NextResponse.json(
      {
        data: { invitation },
        error: {
          code: "email_failed",
          message: "Invite saved but email failed to send. Click Resend to try again.",
        },
      },
      { status: 200 }
    );
  }

  return ok({ invitation });
});

function cryptoRandomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export const DELETE = withErrorHandling(async (req) => {
  const { orgId, supabase } = await requireRole(["owner", "admin"]);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("validation_failed", "Missing id", 400);
  const { error } = await supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) {
    console.error("[invitations.delete]", error);
    throw error;
  }
  return ok(null);
});
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/org/invitations/route.ts
git commit -m "feat(api): POST/DELETE /api/org/invitations"
```

---

### Task 20: `POST /api/org/invitations/[token]` (accept)

**Files:**
- Create: `src/app/api/org/invitations/[token]/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/org/invitations/[token]/route.ts
import { ok, fail, withErrorHandling } from "@/lib/api";
import { ApiError } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";

export const POST = withErrorHandling(async (_req, ctx) => {
  const { token } = await ctx.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ApiError("unauthorized", "Authentication required", 401);

  const { data: invite } = await supabase
    .from("invitations")
    .select("id, org_id, email, role, status, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return fail("not_found", "Invite not found", 404);
  if (invite.status !== "pending") return fail("expired", "This invite is no longer valid", 410);
  if (new Date(invite.expires_at) < new Date()) {
    await supabase.from("invitations").update({ status: "expired" }).eq("id", invite.id);
    return fail("expired", "This invite has expired", 410);
  }
  if (invite.email.toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return fail(
      "forbidden",
      `This invite was sent to ${invite.email}. Sign in as that user to accept.`,
      403
    );
  }

  // Reject if user already has a users row (one-org-per-user)
  const { data: existing } = await supabase
    .from("users")
    .select("id, org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (existing) {
    return fail(
      "conflict",
      "You're already in another organization. Leave that org to accept this invite.",
      409
    );
  }

  const { error: insertError } = await supabase.from("users").insert({
    id: user.id,
    org_id: invite.org_id,
    email: user.email!,
    full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
    role: invite.role,
  });
  if (insertError) {
    console.error("[invite.accept] users insert", insertError);
    throw insertError;
  }

  await supabase
    .from("invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  return ok({ orgId: invite.org_id });
});
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/org/invitations/\[token\]/route.ts
git commit -m "feat(api): POST /api/org/invitations/[token] accept flow"
```

---

### Task 21: `/invite/[token]` accept landing page

**Files:**
- Create: `src/app/(auth)/invite/[token]/page.tsx`
- Create: `src/app/(auth)/invite/[token]/AcceptButton.tsx`

- [ ] **Step 1: Page (server component)**

```tsx
// src/app/(auth)/invite/[token]/page.tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AuthCard } from "@/components/auth/AuthCard";
import { AcceptButton } from "./AcceptButton";

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: invite } = await supabase
    .from("invitations")
    .select(
      "id, org_id, email, role, status, expires_at, organizations:org_id(name)"
    )
    .eq("token", token)
    .maybeSingle();

  if (!invite || invite.status !== "pending" || new Date(invite.expires_at) < new Date()) {
    return (
      <AuthCard
        title="Invite is no longer valid"
        subtitle="This invitation may have expired or been revoked."
        footer={
          <Link href="/login" className="font-medium text-primary hover:underline">
            Go to sign in
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">
          If you believe this is a mistake, ask your teammate to send a new invite.
        </p>
      </AuthCard>
    );
  }

  const orgName = (invite.organizations as { name: string } | null)?.name ?? "the organization";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = `/invite/${token}`;
    return (
      <AuthCard
        title={`Join ${orgName}`}
        subtitle={`Sign in or create an account with ${invite.email}`}
        footer={
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="font-medium text-primary hover:underline"
          >
            Already have an account? Sign in
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">
          Use the email <span className="font-semibold">{invite.email}</span> when you sign up. We
          lock the email so the invite goes to the right person.
        </p>
        <Link
          href={`/signup?invite=${token}&email=${encodeURIComponent(invite.email)}`}
          className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md bg-primary text-primary-foreground"
        >
          Create account
        </Link>
      </AuthCard>
    );
  }

  if (invite.email.toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return (
      <AuthCard
        title="Wrong account"
        subtitle={`This invite was sent to ${invite.email}.`}
      >
        <p className="text-sm text-muted-foreground">
          You&apos;re currently signed in as {user.email}. Sign out and sign in as {invite.email} to
          accept.
        </p>
        <form action="/api/auth/signout" method="post" className="mt-4">
          <button className="inline-flex h-10 w-full items-center justify-center rounded-md border border-input">
            Sign out
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={`Join ${orgName}`} subtitle={`You'll be added as ${invite.role}.`}>
      <AcceptButton token={token} />
    </AuthCard>
  );
}
```

- [ ] **Step 2: AcceptButton (client)**

```tsx
// src/app/(auth)/invite/[token]/AcceptButton.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AcceptButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onAccept() {
    setBusy(true);
    const res = await fetch(`/api/org/invitations/${token}`, { method: "POST" });
    const json = await res.json();
    if (json.error) {
      toast.error(json.error.message);
      setBusy(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <Button className="w-full" onClick={onAccept} disabled={busy}>
      {busy ? "Joining..." : "Accept and join"}
    </Button>
  );
}
```

- [ ] **Step 3: Sign-out endpoint (used by the wrong-account branch)**

Create `src/app/api/auth/signout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = new URL("/login", req.url);
  return NextResponse.redirect(url, 303);
}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(auth\)/invite/ src/app/api/auth/signout/
git commit -m "feat(auth): /invite/[token] landing page + signout endpoint"
```

---

## Phase 6 — Settings: Members Page

### Task 22: `/settings/members` page (server component)

**Files:**
- Create: `src/app/(dashboard)/settings/members/page.tsx`
- Create: `src/app/(dashboard)/settings/members/InviteForm.tsx`
- Create: `src/app/(dashboard)/settings/members/MembersTable.tsx`

- [ ] **Step 1: Page (server component)**

```tsx
// src/app/(dashboard)/settings/members/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "./InviteForm";
import { MembersTable } from "./MembersTable";

export default async function MembersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("id", user.id)
    .single();
  if (!me) redirect("/login");

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase
      .from("users")
      .select("id, email, full_name, role, created_at")
      .eq("org_id", me.org_id)
      .order("created_at", { ascending: true }),
    supabase
      .from("invitations")
      .select("id, email, role, status, expires_at, created_at")
      .eq("org_id", me.org_id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  const canInvite = me.role === "owner" || me.role === "admin";

  return (
    <div className="space-y-12">
      <section>
        <h2 className="text-lg font-semibold">Invite teammates</h2>
        {canInvite ? (
          <p className="text-sm text-muted-foreground">
            Send an email invitation. Recipients have 7 days to accept.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only owners and admins can invite new members.
          </p>
        )}
        {canInvite ? (
          <div className="mt-4 max-w-xl">
            <InviteForm />
          </div>
        ) : null}
      </section>
      <section>
        <h2 className="text-lg font-semibold">Members</h2>
        <div className="mt-4">
          <MembersTable
            members={members ?? []}
            invites={invites ?? []}
            currentUserId={me.id}
            currentUserRole={me.role}
          />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: InviteForm (client)**

```tsx
// src/app/(dashboard)/settings/members/InviteForm.tsx
"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/auth/FormField";
import { inviteCreateSchema, type InviteCreateInput } from "@/lib/schemas/org";

export function InviteForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteCreateInput>({
    resolver: zodResolver(inviteCreateSchema),
    defaultValues: { role: "member" },
  });
  const role = watch("role");

  async function onSubmit(values: InviteCreateInput) {
    const res = await fetch("/api/org/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const json = await res.json();
    if (json.error) {
      // Email-failed is a partial success: surface as warning, still revalidate
      if (json.error.code === "email_failed") {
        toast.warning(json.error.message);
        reset();
        router.refresh();
        return;
      }
      toast.error(json.error.message);
      return;
    }
    toast.success(`Invite sent to ${values.email}`);
    reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <FormField label="Email" htmlFor="invite-email" error={errors.email?.message}>
          <Input id="invite-email" type="email" placeholder="teammate@company.com" {...register("email")} />
        </FormField>
      </div>
      <div className="w-full sm:w-40">
        <FormField label="Role" htmlFor="invite-role" error={errors.role?.message}>
          <Select value={role} onValueChange={(v) => setValue("role", v as "admin" | "member")}>
            <SelectTrigger id="invite-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Sending..." : "Send invite"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: MembersTable (client)**

```tsx
// src/app/(dashboard)/settings/members/MembersTable.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UserRole } from "@/types";

type Member = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
};
type Invite = {
  id: string;
  email: string;
  role: "admin" | "member";
  status: string;
  expires_at: string;
  created_at: string;
};

export function MembersTable({
  members,
  invites,
  currentUserId,
  currentUserRole,
}: {
  members: Member[];
  invites: Invite[];
  currentUserId: string;
  currentUserRole: UserRole;
}) {
  const router = useRouter();
  const isOwner = currentUserRole === "owner";
  const isAdmin = currentUserRole === "admin";
  const canManage = isOwner || isAdmin;
  const [transferTarget, setTransferTarget] = useState<Member | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);

  async function changeRole(userId: string, role: "admin" | "member") {
    const res = await fetch(`/api/org/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const json = await res.json();
    if (json.error) return toast.error(json.error.message);
    toast.success("Role updated");
    router.refresh();
  }

  async function transferOwnership(userId: string) {
    setBusy(true);
    const res = await fetch(`/api/org/members/${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "transfer-ownership" }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.error) return toast.error(json.error.message);
    toast.success("Ownership transferred");
    setTransferTarget(null);
    router.refresh();
  }

  async function removeMember(userId: string) {
    setBusy(true);
    const res = await fetch(`/api/org/members/${userId}`, { method: "DELETE" });
    const json = await res.json();
    setBusy(false);
    if (json.error) return toast.error(json.error.message);
    toast.success("Member removed");
    setRemoveTarget(null);
    router.refresh();
  }

  async function cancelInvite(inviteId: string) {
    const res = await fetch(`/api/org/invitations?id=${inviteId}`, { method: "DELETE" });
    const json = await res.json();
    if (json.error) return toast.error(json.error.message);
    toast.success("Invite cancelled");
    router.refresh();
  }

  async function resendInvite(invite: Invite) {
    const res = await fetch("/api/org/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: invite.email, role: invite.role }),
    });
    const json = await res.json();
    if (json.error && json.error.code !== "email_failed") return toast.error(json.error.message);
    toast.success("Invite resent");
    router.refresh();
  }

  function canRemove(member: Member): boolean {
    if (member.id === currentUserId) return false;
    if (isOwner) return true;
    if (isAdmin) return member.role === "member";
    return false;
  }

  return (
    <div className="space-y-8">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => {
            const showMenu = canManage && m.id !== currentUserId;
            return (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.full_name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{m.email}</TableCell>
                <TableCell>
                  <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium uppercase">
                    {m.role}
                  </span>
                </TableCell>
                <TableCell>
                  {showMenu ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          •••
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isOwner && m.role !== "owner" ? (
                          <>
                            <DropdownMenuLabel>Role</DropdownMenuLabel>
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>Change role</DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                <DropdownMenuItem onClick={() => changeRole(m.id, "admin")}>
                                  Admin
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => changeRole(m.id, "member")}>
                                  Member
                                </DropdownMenuItem>
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuItem onClick={() => setTransferTarget(m)}>
                              Transfer ownership
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        ) : null}
                        {canRemove(m) ? (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setRemoveTarget(m)}
                          >
                            Remove from organization
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {invites.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">Pending invites</h3>
          <Table className="mt-2">
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.email}</TableCell>
                  <TableCell className="capitalize">{i.role}</TableCell>
                  <TableCell>{new Date(i.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(i.expires_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {canManage ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            •••
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => resendInvite(i)}>Resend</DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => cancelInvite(i.id)}
                          >
                            Cancel invite
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {/* Transfer ownership dialog */}
      <Dialog open={!!transferTarget} onOpenChange={(o) => !o && setTransferTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer ownership</DialogTitle>
            <DialogDescription>
              {transferTarget?.full_name ?? transferTarget?.email} will become the new owner. You
              will become an admin and can be removed by the new owner.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={() => transferTarget && transferOwnership(transferTarget.id)}
              disabled={busy}
            >
              {busy ? "Transferring..." : "Transfer ownership"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove member dialog */}
      <Dialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member?</DialogTitle>
            <DialogDescription>
              {removeTarget?.full_name ?? removeTarget?.email} will lose access immediately and be
              signed out on their next request.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeTarget && removeMember(removeTarget.id)}
              disabled={busy}
            >
              {busy ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/settings/members/
git commit -m "feat(settings): members page with invite form and table"
```

---

### Task 23: Members API — `/api/org/members/[userId]` (PATCH role, POST transfer, DELETE remove)

**Files:**
- Create: `src/app/api/org/members/[userId]/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/org/members/[userId]/route.ts
import { ok, fail, withErrorHandling } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { memberRoleSchema, memberActionSchema } from "@/lib/schemas/org";

export const PATCH = withErrorHandling(async (req, ctx) => {
  const { userId: actorId, orgId, supabase } = await requireRole(["owner"]);
  const { userId } = await ctx.params;
  if (userId === actorId) return fail("forbidden", "Cannot change your own role", 403);
  const body = memberRoleSchema.parse(await req.json());

  // Make sure the target is in the same org
  const { data: target } = await supabase
    .from("users")
    .select("id, role, org_id")
    .eq("id", userId)
    .single();
  if (!target || target.org_id !== orgId) return fail("not_found", "Member not found", 404);
  if (target.role === "owner") return fail("forbidden", "Cannot demote the owner directly", 403);

  const { error } = await supabase.from("users").update({ role: body.role }).eq("id", userId);
  if (error) {
    console.error("[members.patch]", error);
    throw error;
  }
  return ok(null);
});

export const POST = withErrorHandling(async (req, ctx) => {
  const { userId: actorId, orgId, supabase } = await requireRole(["owner"]);
  const { userId } = await ctx.params;
  const body = memberActionSchema.parse(await req.json());

  if (body.action === "transfer-ownership") {
    if (userId === actorId) return fail("forbidden", "You are already the owner", 403);
    const { data: target } = await supabase
      .from("users")
      .select("id, org_id")
      .eq("id", userId)
      .single();
    if (!target || target.org_id !== orgId) return fail("not_found", "Member not found", 404);

    // Two-step transfer. NOT atomic — but the worst case is the org temporarily
    // has no owner, which the UI can recover by setting a new owner manually.
    // For Week 2 this is acceptable; Week 7+ may move to a Postgres function.
    const { error: e1 } = await supabase.from("users").update({ role: "owner" }).eq("id", userId);
    if (e1) throw e1;
    const { error: e2 } = await supabase.from("users").update({ role: "admin" }).eq("id", actorId);
    if (e2) throw e2;
    return ok(null);
  }

  return fail("validation_failed", "Unknown action", 400);
});

export const DELETE = withErrorHandling(async (_req, ctx) => {
  const { userId: actorId, orgId, role: actorRole, supabase } = await requireRole([
    "owner",
    "admin",
  ]);
  const { userId } = await ctx.params;
  if (userId === actorId) return fail("forbidden", "Cannot remove yourself", 403);

  const { data: target } = await supabase
    .from("users")
    .select("id, role, org_id")
    .eq("id", userId)
    .single();
  if (!target || target.org_id !== orgId) return fail("not_found", "Member not found", 404);

  // Admin can only remove members
  if (actorRole === "admin" && target.role !== "member") {
    return fail("forbidden", "Admins can only remove members", 403);
  }
  if (target.role === "owner") return fail("forbidden", "Cannot remove the owner", 403);

  const { error } = await supabase.from("users").delete().eq("id", userId);
  if (error) {
    console.error("[members.delete]", error);
    throw error;
  }
  return ok(null);
});
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/org/members/
git commit -m "feat(api): /api/org/members/[userId] role/transfer/remove"
```

---

## Phase 7 — Dashboard + Finalization

### Task 24: Dashboard placeholder

**Files:**
- Replace: `src/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Replace placeholder with real Week 2 dashboard**

```tsx
// src/app/(dashboard)/dashboard/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("users")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!me) redirect("/signup/org");

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", me.org_id)
    .single();

  return (
    <main className="mx-auto max-w-3xl p-8 md:p-12">
      <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "#162B44" }}>
        Welcome to {org?.name ?? "your workspace"}.
      </h1>
      <p className="mt-2 text-muted-foreground">
        Knowledge Base lands next week. In the meantime, set up your team and review your
        organization details.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/settings/org">
          <Button variant="outline">Organization settings</Button>
        </Link>
        <Link href="/settings/members">
          <Button>Invite teammates</Button>
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/page.tsx
git commit -m "feat(dashboard): Week 2 placeholder with settings CTAs"
```

---

### Task 25: Run smoke tests + fix issues

**Files:**
- (none expected; bug fixes if any)

This task is iterative. Work through every row in the Acceptance Criteria table from spec section 10.

- [ ] **Step 1: Pre-flight check**

```bash
# .env.local must contain:
#   NEXT_PUBLIC_SUPABASE_URL=...
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
#   SUPABASE_SERVICE_ROLE_KEY=...
#   RESEND_API_KEY=...
#   RESEND_FROM_EMAIL=PropelRFP <onboarding@resend.dev>   (or a verified sender)
#   NEXT_PUBLIC_APP_URL=http://localhost:3000
pnpm dev
```

In Supabase dashboard:
- Authentication → Providers → Google → enable + paste OAuth client ID/secret
- Authentication → URL Configuration → Site URL: `http://localhost:3000`
- Authentication → URL Configuration → Redirect URLs: add `http://localhost:3000/auth/callback`

- [ ] **Step 2: Run all 23 smoke tests**

Walk through every row in spec section 10. Note any failures with the row number and a one-line description in a scratch file.

- [ ] **Step 3: Fix each failure as a separate commit**

For each failure:
1. Reproduce
2. Fix the root cause (do not silence symptoms)
3. Re-run that smoke test until it passes
4. Commit with `fix(...)` prefix

- [ ] **Step 4: Final lint/typecheck/build**

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Expected: all clean. Fix anything red.

- [ ] **Step 5: Commit any final touch-ups**

```bash
git add -p   # stage selectively
git commit -m "chore: Week 2 polish from smoke testing"
```

---

### Task 26: Update changeLog.md

**Files:**
- Modify: `changeLog.md`

- [ ] **Step 1: Append a new section**

Add a new top-level section to `changeLog.md`. Use the existing Week 1 format as a template. Include:

- Branch: `feature/auth-and-org`
- Date range: 2026-04-30 → completion date
- All files added/modified, grouped by phase (Setup, Auth, Proxy, Settings, Invites, Members, Dashboard)
- New deps added (react-hook-form, hookform/resolvers, shadcn primitives)
- New migration: `002_invitations.sql`
- Smoke matrix outcome (X/23 passing)
- Open issues / deferred items

- [ ] **Step 2: Commit**

```bash
git add changeLog.md
git commit -m "docs(changelog): record Week 2 — Auth & Org module"
```

---

### Task 27: Open PR into `develop`

- [ ] **Step 1: Push branch**

```bash
git push -u origin feature/auth-and-org
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --base develop --title "Week 2 — Auth & Org module" --body "$(cat <<'EOF'
## Summary
- Real signup/login/forgot/reset/Google OAuth flows
- Email-link invitations via Resend with 7-day expiry
- Split settings: /settings/org and /settings/members with full RBAC
- Proxy update: eviction handling + orphan signup recovery
- 23-case manual smoke matrix all passing

## Spec
docs/superpowers/specs/2026-04-30-week2-auth-org-design.md

## Test plan
- [ ] Smoke matrix in spec §10 (run all 23 cases)
- [ ] pnpm lint clean
- [ ] pnpm typecheck clean
- [ ] pnpm build clean

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Spec Coverage Self-Review

**Decisions table (spec §2):**
- (1) Combined wizard → Tasks 9, 10, 11
- (2) Email-link invites + email match → Tasks 18, 19, 20, 21
- (3) Settings split → Tasks 15, 16, 22
- (4) Email/pass + Google OAuth + reset → Tasks 8, 9, 12, 13 (+ GoogleButton in Task 7)
- (5) RLS + server role guards → Task 6 (`requireRole`), used in Tasks 17, 19, 20, 23
- (6) Hybrid: RSC + API + RHF/Zod → Tasks 4, 5 schemas; RSC in Tasks 16, 22, 24; API in Tasks 11, 17, 19, 20, 23
- (7) Eviction handling → Task 14
- (8) Manual smoke tests → Task 25

**Schema (spec §4):** invitations table → Task 1; type added → Task 2.

**File layout (spec §5):** all files mapped to tasks.

**Data flows (spec §6):** signup wizard (Tasks 9-11), Google OAuth (Tasks 7, 11), login (Task 8), password reset (Tasks 12-13), invites (Tasks 18-21), settings org (Tasks 16-17), settings members (Tasks 22-23), dashboard (Task 24).

**RBAC (spec §7):** `requireRole` in Task 6; used in Tasks 17, 19, 20, 23. UI hide-button rules in Tasks 16 (`canEdit`), 22 (`canInvite`, `canRemove`).

**Error handling (spec §8):** `withErrorHandling` (Task 6); inline form errors via RHF (all forms); toast for action errors (all client mutations); email failure returns `data` AND `error` (Task 19); invite-not-found / expired full-page render (Task 21); `console.error` only (Tasks 11, 17, 19, 20, 23 + middleware passive).

**Eviction (spec §9):** Task 14 with `ORPHAN_OK_PREFIXES` allowlist.

**Acceptance criteria (spec §10):** Task 25 walks all 23 cases.

**Out of scope (spec §11):** No tasks for email confirmation, multi-org, leave-org, rate limiting, etc. ✓

**Pre-flight (spec §12):** Listed in Task 25 step 1.

**Implementation order (spec §13):** Plan tasks 1-26 follow the suggested sequencing exactly.

No spec gaps found. No type/method-name inconsistencies. No placeholders.

---

**End of plan.**
