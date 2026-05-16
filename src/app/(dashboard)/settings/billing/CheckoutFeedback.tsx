"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";

export function CheckoutFeedback() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    const canceled = searchParams.get("canceled");

    if (sessionId) {
      toast.success("Subscription activated!");
      router.replace(pathname);
    } else if (canceled) {
      toast("Checkout canceled.", { duration: 3000 });
      router.replace(pathname);
    }
  }, [searchParams, router, pathname]);

  return null;
}
