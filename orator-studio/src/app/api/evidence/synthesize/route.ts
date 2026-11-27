import { NextResponse } from "next/server";
import { Synthesis, SynthesisRequest, synthesisPrompt } from "@/ai/evidence";
import { claudeJson, guard } from "@/ai/server-claude";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Claude's analysis across confirmed findings from several papers. */
export async function POST(request: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = SynthesisRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request.", code: "invalid_request" }, { status: 400 });
  return claudeJson(synthesisPrompt(parsed.data), Synthesis, "value");
}
