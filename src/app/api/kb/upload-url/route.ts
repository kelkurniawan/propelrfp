import { randomUUID } from "crypto";
import { withErrorHandling, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/requireRole";
import { kbUploadSchema } from "@/lib/schemas/kb";
import { assertWithinLimit } from "@/lib/kb/limits";
import { signedUploadUrl } from "@/lib/kb/storage";

export const POST = withErrorHandling(async (req) => {
  const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);
  const body = kbUploadSchema.parse(await req.json());

  // Pre-flight plan limit check before issuing the signed URL
  await assertWithinLimit(supabase, orgId, body.size);

  const docId = randomUUID();
  const { uploadUrl, path } = await signedUploadUrl(orgId, docId, body.type);

  return ok({ docId, uploadUrl, path });
});
