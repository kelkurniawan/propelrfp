"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Plan } from "@/types";

interface Props {
  plan: Plan;
  starterPriceId: string;
  growthPriceId: string;
}

function SubscribeButton({ priceId, label }: { priceId: string; label: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubscribe() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price_id: priceId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message ?? "Could not start checkout");
        return;
      }
      router.push(json.data.url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleSubscribe} disabled={loading || !priceId} className="w-full mt-4">
      {loading ? "Redirecting…" : label}
    </Button>
  );
}

function ManageButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleManage() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message ?? "Could not open billing portal");
        return;
      }
      router.push(json.data.url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleManage}
      disabled={loading}
      className="text-sm text-primary hover:underline disabled:opacity-50"
    >
      {loading ? "Loading…" : "Manage subscription →"}
    </button>
  );
}

export function PlanTiles({ plan, starterPriceId, growthPriceId }: Props) {
  if (plan === "enterprise") {
    return (
      <div className="text-sm text-muted-foreground">
        Contact your account manager to make changes to your Enterprise plan.
      </div>
    );
  }

  if (plan === "growth") {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Manage billing</h2>
        <ManageButton />
        <p className="text-sm text-muted-foreground">
          Need more?{" "}
          <a href="mailto:hello@propelrfp.com" className="text-primary hover:underline">
            Contact us for Enterprise →
          </a>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">
        {plan === "free" ? "Upgrade your plan" : "Manage billing"}
      </h2>

      {plan === "starter" && (
        <div className="mb-4">
          <ManageButton />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
        {(plan === "free" || plan === "starter") && (
          <div
            className={`rounded-lg border p-5 ${
              plan === "free" ? "border-primary border-2" : "border-border"
            }`}
          >
            <div className="font-semibold text-base">Starter</div>
            <div className="text-2xl font-bold mt-1">
              $299
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            </div>
            <ul className="mt-3 text-sm text-muted-foreground space-y-1">
              <li>10 proposals</li>
              <li>500 MB storage</li>
              <li>1 team member</li>
            </ul>
            {plan === "free" && (
              <SubscribeButton priceId={starterPriceId} label="Subscribe" />
            )}
          </div>
        )}

        <div
          className={`rounded-lg border p-5 ${
            plan === "starter" ? "border-primary border-2" : "border-border"
          }`}
        >
          <div className="font-semibold text-base">Growth</div>
          <div className="text-2xl font-bold mt-1">
            $599
            <span className="text-sm font-normal text-muted-foreground">/mo</span>
          </div>
          <ul className="mt-3 text-sm text-muted-foreground space-y-1">
            <li>Unlimited proposals</li>
            <li>5 GB storage</li>
            <li>5 team members</li>
          </ul>
          <SubscribeButton
            priceId={growthPriceId}
            label={plan === "free" ? "Subscribe" : "Upgrade"}
          />
        </div>
      </div>
    </div>
  );
}
