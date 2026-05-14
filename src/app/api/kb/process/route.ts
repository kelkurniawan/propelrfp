import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { ok, fail } from "@/lib/api";
import { processDoc } from "@/lib/kb/process";

function serviceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return fail("unauthorized", "Unauthorized", 401);
  }

  const supabase = serviceClient();

  // Atomically claim the next queued document
  const { data: docs, error: rpcError } = await supabase.rpc("claim_next_queued_doc");
  if (rpcError) {
    console.error("[process] claim RPC error", rpcError);
    return fail("internal_error", "RPC error", 500);
  }

  const doc = docs?.[0];
  if (!doc) {
    // Queue is empty — normal exit
    return ok({ processed: null });
  }

  try {
    await processDoc(doc.id, doc.file_type as "pdf" | "docx", doc.org_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    console.error(`[process] doc ${doc.id} failed:`, err);
    await supabase
      .from("knowledge_docs")
      .update({ status: "failed", error_message: message })
      .eq("id", doc.id);
  }

  return ok({ processed: doc.id });
}
