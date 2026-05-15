import { z } from "zod";

export const genLogSchema = z.object({
  section_id: z.string().uuid(),
  model: z.string().min(1).max(100),
  tokens_input: z.number().int().min(0),
  tokens_output: z.number().int().min(0),
  custom_instruction: z.string().max(1000).nullish(),
});

export type GenLogInput = z.infer<typeof genLogSchema>;
