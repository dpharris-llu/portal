import { NextResponse } from "next/server";
import { Annotation, annotatePrompt, AnnotateRequest } from "@/ai/annotate";
import { claudeJson, guard } from "@/ai/server-claude";

export const dynamic = "force-dynamic";

/** Claude drafts a source's annotation from its kept facts (F-135). */
export async function POST(request: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = AnnotateRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Nothing to annotate yet.", code: "invalid_request" }, { status: 400 });
  return claudeJson(annotatePrompt(parsed.data), Annotation, "value", "annotate");
}
