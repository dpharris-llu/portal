import { NextResponse } from "next/server";
import { Proposal, ProposeRequest, proposePrompt } from "@/ai/argument";
import { claudeJson, guard } from "@/ai/server-claude";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Claude proposes an argument outline from the author's purpose and points (F-002). */
export async function POST(request: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = ProposeRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request.", code: "invalid_request" }, { status: 400 });
  return claudeJson(proposePrompt(parsed.data), Proposal, "value");
}
