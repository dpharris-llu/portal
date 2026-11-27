import { NextResponse } from "next/server";
import { PaperReading, ReadRequest, readPaperPrompt } from "@/ai/evidence";
import { claudeJson, guard } from "@/ai/server-claude";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Claude reads one paper's text (extracted in the browser) and returns quoted findings. */
export async function POST(request: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = ReadRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request.", code: "invalid_request" }, { status: 400 });
  return claudeJson(readPaperPrompt(parsed.data.fileName, parsed.data.text), PaperReading, "value");
}
