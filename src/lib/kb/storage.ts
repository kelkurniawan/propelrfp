// src/lib/kb/storage.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

function serviceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function signedUploadUrl(
  orgId: string,
  docId: string,
  ext: "pdf" | "docx",
): Promise<{ uploadUrl: string; path: string }> {
  const path = `${orgId}/${docId}.${ext}`;
  const { data, error } = await serviceClient()
    .storage.from("documents")
    .createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("Failed to create signed upload URL");
  return { uploadUrl: data.signedUrl, path };
}

export async function downloadFile(path: string): Promise<Buffer> {
  const { data, error } = await serviceClient()
    .storage.from("documents")
    .download(path);
  if (error || !data) throw error ?? new Error(`Failed to download ${path}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteFile(path: string): Promise<void> {
  const { error } = await serviceClient()
    .storage.from("documents")
    .remove([path]);
  if (error) throw error;
}
