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
        Upload past proposals to your Knowledge Base to power AI-generated RFP responses.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/kb">
          <Button>Knowledge Base</Button>
        </Link>
        <Link href="/settings/org">
          <Button variant="outline">Organization settings</Button>
        </Link>
        <Link href="/settings/members">
          <Button variant="outline">Invite teammates</Button>
        </Link>
      </div>
    </main>
  );
}
