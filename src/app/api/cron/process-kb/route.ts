import { ok, fail } from "@/lib/api";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return fail("unauthorized", "Unauthorized", 401);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let count = 0;

  // Loop up to 5 times — each iteration processes one document.
  // Breaking early when the queue is empty keeps us well under the 60s limit.
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(`${appUrl}/api/kb/process`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      if (!res.ok) {
        console.error(`[cron] process call returned ${res.status}`);
        break;
      }
      const body = (await res.json()) as { data: { processed: string | null } };
      if (!body.data?.processed) break;
      count += 1;
    } catch (err) {
      console.error("[cron] process call failed", err);
      break;
    }
  }

  return ok({ processed: count });
}
