// src/lib/kb/process.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { downloadFile } from "./storage";
import { parseFile } from "./parse";
import { chunkText } from "./chunk";
import { embedBatch } from "@/lib/ai/embeddings";

function serviceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function processDoc(
  docId: string,
  fileType: "pdf" | "docx",
  orgId: string,
): Promise<void> {
  const supabase = serviceClient();

  // Fetch the file path stored in file_url
  const { data: doc, error: fetchError } = await supabase
    .from("knowledge_docs")
    .select("file_url")
    .eq("id", docId)
    .single();
  if (fetchError || !doc) throw fetchError ?? new Error("Document not found");

  // Download the raw file bytes from Storage
  const buffer = await downloadFile(doc.file_url);

  // Extract text
  const text = await parseFile(buffer, fileType);
  if (!text.trim()) throw new Error("No text could be extracted from this document");

  // Split into token windows
  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error("Document too short to chunk (< 50 tokens)");

  // Embed all chunks (batched in 100s internally)
  const embeddings = await embedBatch(chunks.map((c) => c.content));

  // Idempotency guard: delete any chunks left from a previous attempt
  await supabase.from("doc_chunks").delete().eq("doc_id", docId);

  // Insert the new chunks
  const rows = chunks.map((chunk, i) => ({
    doc_id: docId,
    org_id: orgId,
    content: chunk.content,
    token_count: chunk.token_count,
    chunk_index: chunk.chunk_index,
    embedding: embeddings[i],
  }));

  const { error: insertError } = await supabase.from("doc_chunks").insert(rows);
  if (insertError) throw insertError;

  // Mark document as ready
  await supabase
    .from("knowledge_docs")
    .update({ status: "ready" })
    .eq("id", docId);
}
