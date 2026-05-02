import { withErrorHandling, ok, fail } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";

export const GET = withErrorHandling(async (_req, ctx) => {
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const { id } = await ctx.params;

  // Verify the doc belongs to this org (defense in depth on top of requireRole)
  const { data: doc } = await supabase
    .from("knowledge_docs")
    .select("file_url, name")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();
  if (!doc) return fail("not_found", "Document not found", 404);

  // Issue a 60-second signed download URL
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(doc.file_url, 60);
  if (error || !data) throw error ?? new Error("Failed to create download URL");

  return ok({ url: data.signedUrl });
});
