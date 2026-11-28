import { NextResponse } from "next/server";
import { PassageIdeas, passagePrompt, PassageRequest } from "@/ai/passages";
import { claudeJson, guard } from "@/ai/server-claude";

export const dynamic = "force-dynamic";

/** Claude proposes Bible references on a theme, with reasons; the client fetches each one's text (F-123). */
export async function POST(request: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = PassageRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Describe what you're looking for.", code: "invalid_request" }, { status: 400 });
  return claudeJson(passagePrompt(parsed.data), PassageIdeas, "value", "bible_passages");
}
