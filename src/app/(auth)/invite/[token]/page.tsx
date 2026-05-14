import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { AuthCard } from "@/components/auth/AuthCard";
import { AcceptButton } from "./AcceptButton";

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Use service client to bypass RLS for token lookup
  const serviceClient = await createServiceClient();
  const { data: invite } = await serviceClient
    .from("invitations")
    .select("id, org_id, email, role, status, expires_at, organizations(name)")
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

  const supabase = await createClient();
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
          Use the email <span className="font-semibold">{invite.email}</span> when you sign up.
        </p>
        <Link
          href={`/signup?invite=${token}&email=${encodeURIComponent(invite.email)}`}
          className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
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
          You&apos;re currently signed in as {user.email}. Sign out and sign in as {invite.email}{" "}
          to accept.
        </p>
        <form action="/api/auth/signout" method="post" className="mt-4">
          <button className="inline-flex h-10 w-full items-center justify-center rounded-md border border-input text-sm font-medium">
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
