import type { QuotaExceededInfo, QuotaType } from "./upgrade-modal-context";

export async function handleApiError(
  res: Response,
  openModal: (info: QuotaExceededInfo) => void
): Promise<never> {
  const json = await res.json().catch(() => null);

  if (res.status === 402 && json?.error?.code === "QUOTA_EXCEEDED") {
    openModal({
      limitType: (json.error.limit_type ?? "proposals") as QuotaType,
      current: json.error.current ?? 0,
      limit: json.error.limit ?? 0,
      plan: json.error.plan ?? "free",
    });
    throw new Error("quota_exceeded");
  }

  const message = json?.error?.message ?? "An unexpected error occurred.";
  throw new Error(message);
}
