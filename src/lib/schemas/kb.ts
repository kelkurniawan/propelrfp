// src/lib/schemas/kb.ts
import { z } from "zod";

export const KB_MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

export const kbUploadSchema = z.object({
  name: z.string().trim().min(1).max(255),
  size: z.number().int().min(1).max(KB_MAX_FILE_BYTES),
  type: z.enum(["pdf", "docx"]),
});
export type KbUploadInput = z.infer<typeof kbUploadSchema>;

export const kbDocsPostSchema = z.object({
  docId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(255),
  size: z.number().int().min(1).max(KB_MAX_FILE_BYTES),
  type: z.enum(["pdf", "docx"]),
  path: z.string().trim().min(1),
});
export type KbDocsPostInput = z.infer<typeof kbDocsPostSchema>;

export const kbSearchSchema = z.object({
  query: z.string().trim().min(1).max(1000),
});
export type KbSearchInput = z.infer<typeof kbSearchSchema>;
