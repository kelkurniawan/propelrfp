// src/lib/kb/chunk.ts
import { get_encoding } from "tiktoken";

export interface TextChunk {
  content: string;
  token_count: number;
  chunk_index: number;
}

export function chunkText(
  text: string,
  opts: { tokensPerChunk?: number; overlap?: number } = {},
): TextChunk[] {
  const { tokensPerChunk = 1000, overlap = 200 } = opts;
  const enc = get_encoding("cl100k_base");

  try {
    const allTokens = enc.encode(text);
    const chunks: TextChunk[] = [];
    let chunkIndex = 0;
    let start = 0;

    while (start < allTokens.length) {
      const end = Math.min(start + tokensPerChunk, allTokens.length);
      const slice = allTokens.slice(start, end);

      // Skip stub fragments shorter than 50 tokens (trailing document noise)
      if (slice.length >= 50) {
        const bytes = enc.decode(slice);
        const content = new TextDecoder().decode(bytes);
        chunks.push({ content, token_count: slice.length, chunk_index: chunkIndex++ });
      }

      if (end >= allTokens.length) break;
      start += tokensPerChunk - overlap;
    }

    return chunks;
  } finally {
    enc.free();
  }
}
