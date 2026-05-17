import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const createProjectSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  client_name: z.string().trim().min(1).max(200).nullish(),
  deadline: z.string().regex(ISO_DATE, "Use YYYY-MM-DD format").nullish(),
  notes: z.string().trim().max(5000).nullish(),
  rfp_text: z.string().trim().max(200_000).nullish(),
});

export const updateProjectSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  client_name: z.string().trim().min(1).max(200).nullish(),
  deadline: z.string().regex(ISO_DATE).nullish(),
  notes: z.string().trim().max(5000).nullish(),
  status: z.enum(["draft", "in_review", "submitted", "won", "lost"]).optional(),
});

export const createSectionSchema = z.object({
  title: z.string().trim().min(1).max(500),
  rfp_content: z.string().trim().max(50_000).nullish(),
  position: z.number().int().min(0),
});

export const updateSectionSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  rfp_content: z.string().trim().max(50_000).nullish(),
  position: z.number().int().min(0).optional(),
  ai_draft: z.string().max(200_000).nullish(),
  final_content: z.string().max(200_000).nullish(),
  status: z.enum(["pending", "generating", "generated", "approved"]).optional(),
});

export const bulkSectionsSchema = z.object({
  sections: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(500),
        rfp_content: z.string().trim().max(50_000).nullish(),
        position: z.number().int().min(0),
      })
    )
    .min(1, "At least one section is required"),
});

export const detectSectionsBodySchema = z.object({
  rfp_text: z.string().trim().min(1).max(200_000),
});
