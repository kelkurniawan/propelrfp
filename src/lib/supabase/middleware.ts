import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

const PUBLIC_PATHS = ["/", "/login", "/signup", "/forgot", "/reset"];
const ORPHAN_OK_PREFIXES = ["/signup/org", "/auth/", "/api/auth/signup"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return supabaseResponse;

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/invite/");
  const isOrphanOk = ORPHAN_OK_PREFIXES.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  if (user) {
    const { data: dbUser } = await supabase
      .from("users")
      .select("id, org_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!dbUser && !isOrphanOk) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "removed");
      return NextResponse.redirect(url);
    }

    if (dbUser && (pathname === "/login" || pathname === "/signup")) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      return NextResponse.redirect(redirectUrl);
    }

    if (dbUser && !dbUser.org_id && !isOrphanOk && !isPublic) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/signup/org";
      return NextResponse.redirect(redirectUrl);
    }
  }

  return supabaseResponse;
}
