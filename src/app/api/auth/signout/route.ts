import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = new URL("/login", req.url);
  return NextResponse.redirect(url, 303);
}
