import { z } from "zod";
import { INDUSTRIES } from "@/types";

export const orgUpdateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  industry: z.enum(INDUSTRIES as readonly [string, ...string[]]),
  website: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  size: z.enum(["1-10", "11-50", "51-200", "201-1000", "1000+"]).optional(),
});
export type OrgUpdateInput = z.infer<typeof orgUpdateSchema>;

export const inviteCreateSchema = z.object({
  email: z.string().email("Invalid email"),
  role: z.enum(["admin", "member"]),
});
export type InviteCreateInput = z.infer<typeof inviteCreateSchema>;

export const memberRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});
export type MemberRoleInput = z.infer<typeof memberRoleSchema>;

export const memberActionSchema = z.object({
  action: z.literal("transfer-ownership"),
});
export type MemberActionInput = z.infer<typeof memberActionSchema>;
