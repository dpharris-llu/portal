import { NextResponse } from "next/server";
import { serverAccess } from "@/lib/serverAccess";
import { Analysis, AnalysisRequest, analysisPrompt } from "@/ai/analysis";
import { aiConfigured } from "@/ai/claude";
import { claudeJson, guard } from "@/ai/server-claude";

export const dynamic = "force-dynamic";

/** Whether this server can ask Claude (it needs ANTHROPIC_API_KEY). */
export async function GET() {
  return NextResponse.json({ available: aiConfigured() && (await serverAccess()).ok });
}

/** Claude's analysis of confirmed figures. Only the purpose, comparisons, labels and numbers are sent. */
export async function POST(request: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = AnalysisRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request.", code: "invalid_request" }, { status: 400 });
  return claudeJson(analysisPrompt(parsed.data), Analysis, "analysis");
}
