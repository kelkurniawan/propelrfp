// src/lib/kb/parse.ts
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export async function parsePdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  await parser.destroy();
  // Strip form-feed characters inserted between pages
  return result.text.replace(/\f/g, " ").trim();
}

export async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

export async function parseFile(
  buffer: Buffer,
  type: "pdf" | "docx",
): Promise<string> {
  if (type === "pdf") return parsePdf(buffer);
  return parseDocx(buffer);
}
