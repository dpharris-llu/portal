import { NextResponse } from "next/server";
import { MessageCandidates, messagesPrompt } from "@/ai/messages";
import { ProbeRequestSchema } from "@/ai/probe";
import { claudeJson, guard } from "@/ai/server-claude";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Candidate messages and their points from the workspace's active facts (F-024). */
export async function POST(request: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = ProbeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request.", code: "invalid_request" }, { status: 400 });
  return claudeJson(messagesPrompt(parsed.data), MessageCandidates, "value", "messages");
}
