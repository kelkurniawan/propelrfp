import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole, ApiError } from "@/lib/auth/requireRole";
import { embedText } from "@/lib/ai/embeddings";
import { generateSectionStream } from "@/lib/ai/generate";

const bodySchema = z.object({
  custom_instruction: z.string().max(1000).nullish(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; sid: string }> }
) {
  try {
    const { id, sid } = await ctx.params;
    const { orgId, supabase } = await requireRole(["owner", "admin", "member"]);

    const rawBody = await req.json().catch(() => ({}));
    const { custom_instruction } = bodySchema.parse(rawBody);

    const { data: project } = await supabase
      .from("rfp_projects")
      .select("id")
      .eq("id", id)
      .eq("org_id", orgId)
      .single();

    if (!project) {
      return NextResponse.json(
        { data: null, error: { code: "not_found", message: "Project not found" } },
        { status: 404 }
      );
    }

    const { data: section } = await supabase
      .from("rfp_sections")
      .select("id, title, rfp_content")
      .eq("id", sid)
      .eq("project_id", id)
      .single();

    if (!section) {
      return NextResponse.json(
        { data: null, error: { code: "not_found", message: "Section not found" } },
        { status: 404 }
      );
    }

    const embedding = await embedText(section.rfp_content ?? "");

    const { data: chunks } = await supabase.rpc("match_doc_chunks", {
      query_embedding: embedding,
      match_count: 5,
    });
    const kbChunks = (chunks ?? []).map((c) => c.content);

    const { data: org } = await supabase
      .from("organizations")
      .select("name, industry")
      .eq("id", orgId)
      .single();

    await supabase
      .from("rfp_sections")
      .update({ status: "generating", updated_at: new Date().toISOString() })
      .eq("id", sid);

    const stream = await generateSectionStream({
      orgName: org?.name ?? "",
      industry: org?.industry ?? "General",
      kbChunks,
      sectionTitle: section.title,
      rfpContent: section.rfp_content ?? "",
      customInstruction: custom_instruction ?? undefined,
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { data: null, error: { code: "validation_failed", message: err.issues.map((i) => i.message).join(", ") } },
        { status: 400 }
      );
    }
    if (err instanceof ApiError) {
      return NextResponse.json(
        { data: null, error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }
    console.error("[generate] unhandled error", err);
    return NextResponse.json(
      { data: null, error: { code: "internal_error", message: "Something went wrong" } },
      { status: 500 }
    );
  }
}
