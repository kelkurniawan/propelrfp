import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UpgradeModalProvider } from "@/lib/billing/upgrade-modal-context";
import { UpgradeModal } from "@/components/UpgradeModal";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <UpgradeModalProvider>
      {children}
      <UpgradeModal />
    </UpgradeModalProvider>
  );
}
