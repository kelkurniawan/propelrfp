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
