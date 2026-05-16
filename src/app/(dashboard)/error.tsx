"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-lg p-10 text-center">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        An unexpected error occurred. Please try again or contact support if
        the problem persists.
        {error.digest && (
          <span className="block mt-1 font-mono text-xs">
            Error ID: {error.digest}
          </span>
        )}
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
