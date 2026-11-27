import { NextResponse } from "next/server";
import { z } from "zod";
import { SearchPlan, searchPlanPrompt } from "@/ai/search";
import { claudeJson, guard } from "@/ai/server-claude";

export const dynamic = "force-dynamic";

const Body = z.object({ provider: z.enum(["europepmc", "clinicaltrials"]), want: z.string().min(2).max(1000), purpose: z.string().max(2000), thesis: z.string().max(1000) });

/** Claude writes a database search from the author's words (F-119). */
export async function POST(request: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request.", code: "invalid_request" }, { status: 400 });
  return claudeJson(searchPlanPrompt(parsed.data), SearchPlan, "value");
}
