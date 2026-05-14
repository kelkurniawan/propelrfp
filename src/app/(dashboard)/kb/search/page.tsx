import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SearchForm } from "./SearchForm";

export default async function KbSearchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!me || (me.role !== "owner" && me.role !== "admin")) {
    redirect("/kb");
  }

  return (
    <main className="mx-auto max-w-3xl p-8 md:p-12">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "#162B44" }}>
          Debug Retrieval
        </h1>
        <Link href="/kb" className="text-sm text-muted-foreground underline">
          ← Back to KB
        </Link>
      </div>
      <p className="mt-2 text-muted-foreground">
        Test the search pipeline end-to-end. Top 5 chunks ranked by cosine similarity.
      </p>
      <div className="mt-8">
        <SearchForm />
      </div>
    </main>
  );
}
