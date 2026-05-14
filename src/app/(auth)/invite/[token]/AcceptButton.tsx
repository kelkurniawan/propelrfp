"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AcceptButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onAccept() {
    setBusy(true);
    const res = await fetch(`/api/org/invitations/${token}`, { method: "POST" });
    const json = await res.json();
    if (json.error) {
      toast.error(json.error.message);
      setBusy(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <Button className="w-full" onClick={onAccept} disabled={busy}>
      {busy ? "Joining..." : "Accept and join"}
    </Button>
  );
}
