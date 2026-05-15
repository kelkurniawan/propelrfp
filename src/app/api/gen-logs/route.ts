import { withErrorHandling, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { genLogSchema } from "@/lib/schemas/genLog";

export const POST = withErrorHandling(async (req) => {
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const body = genLogSchema.parse(await req.json());

  const { data, error } = await supabase
    .from("gen_logs")
    .insert({
      section_id: body.section_id,
      org_id: orgId,
      model: body.model,
      tokens_input: body.tokens_input,
      tokens_output: body.tokens_output,
      tokens_used: body.tokens_input + body.tokens_output,
      custom_instruction: body.custom_instruction ?? null,
    })
    .select()
    .single();

  if (error || !data) throw error ?? new Error("Insert failed");

  return ok(data, 201);
});
