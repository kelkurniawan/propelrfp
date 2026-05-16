import { ok, fail } from "@/lib/api";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return fail("unauthorized", "Unauthorized", 401);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let count = 0;

  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(`${appUrl}/api/kb/process`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      if (!res.ok) break;
      const body = (await res.json()) as { data: { processed: string | null } };
      if (!body.data?.processed) break;
      count += 1;
    } catch {
      break;
    }
  }

  return ok({ processed: count });
}
