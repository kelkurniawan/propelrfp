import type { SectionStatus } from "@/types";

export type SectionDraft = {
  id: string;
  title: string;
  position: number;
  rfp_content: string | null;
  ai_draft: string | null;
  final_content: string | null;
  status: SectionStatus;
};
