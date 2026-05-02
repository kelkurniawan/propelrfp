import { withErrorHandling, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { kbSearchSchema } from "@/lib/schemas/kb";
import { embedText } from "@/lib/ai/embeddings";

export const POST = withErrorHandling(async (req) => {
  const { orgId, supabase } = await requireRole(["owner", "admin"]);

  // orgId is available if needed for logging, but RLS on match_doc_chunks
  // already scopes to current_org_id() via security invoker
  void orgId;

  const { query } = kbSearchSchema.parse(await req.json());

  const embedding = await embedText(query);

  const { data: chunks, error } = await supabase.rpc("match_doc_chunks", {
    query_embedding: embedding,
    match_count: 5,
  });
  if (error) throw error;

  // Enrich each chunk with its source document name
  const docIds = [...new Set((chunks ?? []).map((c) => c.doc_id))];
  const { data: docs } = await supabase
    .from("knowledge_docs")
    .select("id, name")
    .in("id", docIds);

  const docMap = Object.fromEntries((docs ?? []).map((d) => [d.id, d.name]));

  const results = (chunks ?? []).map((c) => ({
    id: c.id,
    doc_id: c.doc_id,
    doc_name: docMap[c.doc_id] ?? "Unknown",
    content: c.content,
    chunk_index: c.chunk_index,
    similarity: c.similarity,
  }));

  return ok(results);
});
