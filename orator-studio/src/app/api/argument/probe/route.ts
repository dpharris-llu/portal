import { NextResponse } from "next/server";
import { ProbeAnswer, ProbeRequestSchema, probePrompt } from "@/ai/probe";
import { claudeJson, guard } from "@/ai/server-claude";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** One probe of the Research workspace (F-118). The browser sends only active sources and facts. */
export async function POST(request: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = ProbeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request.", code: "invalid_request" }, { status: 400 });
  return claudeJson(probePrompt(parsed.data), ProbeAnswer, "value");
}
