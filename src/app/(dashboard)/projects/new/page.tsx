import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectForm } from "@/app/(dashboard)/projects/new/ProjectForm";

export default async function NewProjectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">New proposal</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fill in the details and optionally paste the RFP text for AI section detection.
        </p>
      </div>
      <ProjectForm />
    </main>
  );
}
