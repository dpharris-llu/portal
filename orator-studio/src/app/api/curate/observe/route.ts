import { NextResponse } from "next/server";
import { ObservationAnswer, observePrompt, ObserveRequest } from "@/ai/observe";
import { claudeJson, guard } from "@/ai/server-claude";

export const dynamic = "force-dynamic";

/** Claude observes what a topic's facts show, citing them (F-132); the client checks the answer. */
export async function POST(request: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = ObserveRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request.", code: "invalid_request" }, { status: 400 });
  return claudeJson(observePrompt(parsed.data), ObservationAnswer, "value", "observe");
}
