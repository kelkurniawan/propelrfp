import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { authLimiter, genLimiter, apiLimiter } from "@/lib/rate-limit";

function getIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "anonymous"
  );
}

export async function proxy(request: NextRequest) {
  // Answer CORS preflight instantly — no auth needed
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204 });
  }

  const { pathname } = request.nextUrl;
  const ip = getIp(request);

  if (pathname.startsWith("/api/")) {
    let limiter = apiLimiter;

    if (pathname.startsWith("/api/auth/")) {
      limiter = authLimiter;
    } else if (pathname.includes("/generate")) {
      limiter = genLimiter;
    }

    const { success, limit, remaining, reset } = await limiter.limit(ip);

    if (!success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: "rate_limited",
            message: "Too many requests. Please wait before trying again.",
          },
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": String(remaining),
            "X-RateLimit-Reset": String(reset),
            "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)),
          },
        }
      );
    }
  }

  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
