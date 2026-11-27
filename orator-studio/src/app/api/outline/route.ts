import { NextResponse } from "next/server";
import { OutlineRequest, templateOutline } from "@/ai/outline";
import { aiConfigured, draftOutline } from "@/ai/claude";
import { serverSupabase } from "@/lib/supabase/server";
import { serverAccess } from "@/lib/serverAccess";

/** POST goal, audience, time and takeaway; returns a proposed outline (F-002). */
export async function POST(request: Request) {
  const access = await serverAccess();
  if (!access.ok && (await serverSupabase())) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = OutlineRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });

  if (access.ok && aiConfigured()) {
    try {
      const outline = await draftOutline(parsed.data);
      if (outline && outline.nodes.length) return NextResponse.json({ outline, source: "claude" });
    } catch (e) {
      console.error("Outline drafting failed; using template", e);
    }
  }
  return NextResponse.json({ outline: templateOutline(parsed.data), source: "template" });
}
