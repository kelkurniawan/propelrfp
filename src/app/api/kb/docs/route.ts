import { withErrorHandling, ok, fail } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { kbDocsPostSchema } from "@/lib/schemas/kb";
import { assertWithinLimit } from "@/lib/kb/limits";
import { deleteFile } from "@/lib/kb/storage";

export const GET = withErrorHandling(async () => {
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const { data: docs } = await supabase
    .from("knowledge_docs")
    .select("id, name, file_type, file_size_bytes, file_url, status, error_message, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  return ok(docs ?? []);
});

export const POST = withErrorHandling(async (req) => {
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const body = kbDocsPostSchema.parse(await req.json());

  // Re-check limit (race protection: two parallel uploads may both pass the first check)
  await assertWithinLimit(supabase, orgId, body.size);

  const { data: doc, error } = await supabase
    .from("knowledge_docs")
    .insert({
      id: body.docId,
      org_id: orgId,
      name: body.name,
      file_url: body.path,
      file_type: body.type,
      file_size_bytes: body.size,
      status: "queued",
    })
    .select()
    .single();
  if (error || !doc) throw error ?? new Error("insert_failed");

  // Fire-and-forget: trigger the processor immediately without awaiting
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  fetch(`${appUrl}/api/kb/process`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch(() => {
    // Ignore — Vercel Cron is the safety net if this call fails
  });

  return ok({ doc });
});

export const DELETE = withErrorHandling(async (req) => {
  const { orgId, supabase } = await requireRole(["owner", "admin"]);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("validation_failed", "Missing id", 400);

  const { data: doc } = await supabase
    .from("knowledge_docs")
    .select("file_url")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();
  if (!doc) return fail("not_found", "Document not found", 404);

  // Delete DB row (cascades to doc_chunks via FK)
  await supabase.from("knowledge_docs").delete().eq("id", id);

  // Best-effort Storage cleanup — log but don't fail the request
  try {
    await deleteFile(doc.file_url);
  } catch (err) {
    console.error("[docs.delete] storage cleanup failed", err);
  }

  return ok(null);
});
