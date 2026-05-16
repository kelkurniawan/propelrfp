"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUpgradeModal } from "@/lib/billing/upgrade-modal-context";

const LIMIT_LABELS: Record<string, string> = {
  proposals: "proposal",
  storage: "storage",
  members: "team member",
};

function formatValue(limitType: string, value: number): string {
  if (!isFinite(value)) return "unlimited";
  if (limitType === "storage") return `${Math.round(value / 1024 / 1024)} MB`;
  return String(value);
}

export function UpgradeModal() {
  const { open, info, closeModal } = useUpgradeModal();
  const router = useRouter();

  function handleUpgrade() {
    closeModal();
    router.push("/settings/billing");
  }

  if (!info) return null;

  const label = LIMIT_LABELS[info.limitType] ?? info.limitType;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) closeModal(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>You&apos;ve reached your {label} limit</DialogTitle>
          <DialogDescription>
            Your <span className="font-medium capitalize">{info.plan}</span> plan includes{" "}
            {formatValue(info.limitType, info.limit)} {label}s. You&apos;re currently using{" "}
            {formatValue(info.limitType, info.current)}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={closeModal}>
            Dismiss
          </Button>
          <Button onClick={handleUpgrade}>Upgrade plan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
