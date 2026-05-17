"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <p className="text-6xl font-bold text-muted-foreground">500</p>
      <h1 className="mt-4 text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        An unexpected error occurred. Our team has been notified.
        {error.digest && (
          <span className="block mt-1 font-mono text-xs">Reference: {error.digest}</span>
        )}
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/">
          <Button variant="outline">Go home</Button>
        </Link>
      </div>
    </main>
  );
}
