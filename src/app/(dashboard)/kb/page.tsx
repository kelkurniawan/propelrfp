import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PLAN_LIMITS } from "@/types";
import type { Plan } from "@/types";
import { UsageMeter } from "./UsageMeter";
import { KbClient } from "./KbClient";

export const metadata: Metadata = { title: "Knowledge Base" };

export default async function KbPage() {
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

  const [{ data: docs }, { data: sub }] = await Promise.all([
    supabase
      .from("knowledge_docs")
      .select("id, name, file_type, file_size_bytes, file_url, status, error_message, created_at")
      .eq("org_id", me.org_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("subscriptions")
      .select("plan")
      .eq("org_id", me.org_id)
      .single(),
  ]);

  const plan = (sub?.plan ?? "starter") as Plan;
  const limitMb = PLAN_LIMITS[plan].storageMb;
  const usedBytes = (docs ?? []).reduce((acc, d) => acc + (d.file_size_bytes ?? 0), 0);
  const canManage = me.role === "owner" || me.role === "admin";

  return (
    <main className="mx-auto max-w-4xl p-8 md:p-12">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "#162B44" }}>
          Knowledge Base
        </h1>
        {canManage && (
          <Link href="/kb/search" className="text-sm text-muted-foreground underline">
            Debug retrieval
          </Link>
        )}
      </div>
      <UsageMeter usedBytes={usedBytes} limitMb={limitMb} />
      <div className="mt-6">
        <KbClient initialDocs={docs ?? []} canManage={canManage} />
      </div>
    </main>
  );
}
