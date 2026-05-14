"use client";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function GoogleButton({ next = "/signup/org" }: { next?: string }) {
  const supabase = createClient();

  async function onClick() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  return (
    <Button type="button" variant="outline" className="w-full" onClick={onClick}>
      Continue with Google
    </Button>
  );
}
