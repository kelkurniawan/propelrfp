import type { Database } from "./database";

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Organization = Tables<"organizations">;
export type User = Tables<"users">;
export type Subscription = Tables<"subscriptions">;
export type KnowledgeDoc = Tables<"knowledge_docs">;
export type DocChunk = Tables<"doc_chunks">;
export type RfpProject = Tables<"rfp_projects">;
export type RfpSection = Tables<"rfp_sections">;
export type GenLog = Tables<"gen_logs">;
export type Invitation = Tables<"invitations">;

export type UserRole = "owner" | "admin" | "member";
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type InviteRole = "admin" | "member";
export type DocStatus = "queued" | "processing" | "ready" | "failed";
export type ProjectStatus = "draft" | "in_review" | "submitted" | "won" | "lost";
export type SectionStatus = "pending" | "generating" | "generated" | "approved";
export type SubscriptionStatus = "active" | "past_due" | "canceled" | "trialing";
export type Plan = "starter" | "growth" | "enterprise";

export interface ApiResponse<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}

export const PLAN_LIMITS = {
  starter: { proposals: 10, storageMb: 500, users: 1 },
  growth: { proposals: Infinity, storageMb: 5120, users: 5 },
  enterprise: { proposals: Infinity, storageMb: Infinity, users: Infinity },
} as const;

export const INDUSTRIES = [
  "IT Consulting",
  "Software Development",
  "Managed Services",
  "Systems Integration",
  "Cybersecurity",
  "Cloud Infrastructure",
  "Other",
] as const;
