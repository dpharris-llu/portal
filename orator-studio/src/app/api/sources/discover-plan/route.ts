import { NextResponse } from "next/server";
import { z } from "zod";
import { DiscoverPlan, discoverPlanPrompt } from "@/ai/search";
import { claudeJson, guard } from "@/ai/server-claude";

export const dynamic = "force-dynamic";

const Body = z.object({ topic: z.string().min(2).max(500), purpose: z.string().max(2000), thesis: z.string().max(1000) });

/** Claude plans Discover for a topic: the searches, and which sources fit, with reasons (F-122). */
export async function POST(request: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request.", code: "invalid_request" }, { status: 400 });
  return claudeJson(discoverPlanPrompt(parsed.data), DiscoverPlan, "value", "search_plan");
}
