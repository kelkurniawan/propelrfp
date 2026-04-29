import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = "text-embedding-3-small";
const DIMENSIONS = 1536;

export async function embedText(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: MODEL,
    input: text.replace(/\n/g, " "),
    dimensions: DIMENSIONS,
  });
  return response.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    batches.push(texts.slice(i, i + 100));
  }

  const results: number[][] = [];
  for (const batch of batches) {
    const response = await openai.embeddings.create({
      model: MODEL,
      input: batch.map((t) => t.replace(/\n/g, " ")),
      dimensions: DIMENSIONS,
    });
    results.push(...response.data.map((d) => d.embedding));
  }
  return results;
}
