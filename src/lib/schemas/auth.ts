import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("Invalid email").max(254),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupAccountSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Invalid email").max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});
export type SignupAccountInput = z.infer<typeof signupAccountSchema>;

export const forgotSchema = z.object({
  email: z.string().trim().email("Invalid email").max(254),
});
export type ForgotInput = z.infer<typeof forgotSchema>;

export const resetSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters").max(72),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });
export type ResetInput = z.infer<typeof resetSchema>;

export const signupBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create-account"), ...signupAccountSchema.shape }),
  z.object({
    action: z.literal("create-org"),
    name: z.string().trim().min(1, "Org name is required").max(100),
    industry: z.string().trim().min(1, "Industry is required"),
  }),
]);
export type SignupBody = z.infer<typeof signupBodySchema>;
