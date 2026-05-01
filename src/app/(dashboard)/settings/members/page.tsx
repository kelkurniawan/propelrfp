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
