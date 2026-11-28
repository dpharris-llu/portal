import { NextResponse } from "next/server";
import { Exploration, explorePrompt, ExploreRequest } from "@/ai/explore";
import { claudeJson, guard } from "@/ai/server-claude";

export const dynamic = "force-dynamic";

/** Explore an idea: Claude's labeled general knowledge, questions, debates, suggested topics and searches. */
export async function POST(request: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = ExploreRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Describe the idea in a few words.", code: "invalid_request" }, { status: 400 });
  return claudeJson(explorePrompt(parsed.data), Exploration, "value", "explore");
}
