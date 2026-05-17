import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DashboardNotFound() {
  return (
    <main className="mx-auto max-w-lg p-10 text-center">
      <p className="text-5xl font-bold text-muted-foreground">404</p>
      <h2 className="mt-4 text-xl font-semibold">Not found</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This resource doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Link href="/dashboard">
        <Button className="mt-6">Back to Dashboard</Button>
      </Link>
    </main>
  );
}
