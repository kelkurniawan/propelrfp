import Anthropic from "@anthropic-ai/sdk";
import { buildGenerationPrompt } from "./prompts";

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cachedClient;
}

const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 2000;
const MAX_RETRIES = 3;

export async function generateSectionStream({
  orgName,
  industry,
  kbChunks,
  sectionTitle,
  rfpContent,
  customInstruction,
}: {
  orgName: string;
  industry: string;
  kbChunks: string[];
  sectionTitle: string;
  rfpContent: string;
  customInstruction?: string;
}): Promise<ReadableStream<Uint8Array>> {
  const { system, user } = buildGenerationPrompt({
    orgName,
    industry,
    kbChunks,
    sectionTitle,
    rfpContent,
    customInstruction,
  });

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const stream = await getClient().messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: "user", content: user }],
      });

      const encoder = new TextEncoder();
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          controller.close();
        },
      });
    } catch (error) {
      attempt++;
      if (attempt >= MAX_RETRIES) throw error;
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }

  throw new Error("Generation failed after max retries");
}

export async function detectSections(
  rfpText: string
): Promise<Array<{ title: string; rfp_content: string }>> {
  const { buildSectionDetectionPrompt } = await import("./prompts");

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: buildSectionDetectionPrompt(rfpText) }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const parsed = JSON.parse(text);
  return parsed as Array<{ title: string; rfp_content: string }>;
}
