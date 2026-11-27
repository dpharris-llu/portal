import { NextResponse } from "next/server";
import { OutlineRequest, templateOutline } from "@/ai/outline";
import { aiConfigured, draftOutline } from "@/ai/claude";
import { serverSupabase } from "@/lib/supabase/server";

/** POST goal, audience, time and takeaway; returns a proposed outline (F-002). */
export async function POST(request: Request) {
  const supabase = await serverSupabase();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const parsed = OutlineRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });

  if (aiConfigured()) {
    try {
      const outline = await draftOutline(parsed.data);
      if (outline && outline.nodes.length) return NextResponse.json({ outline, source: "claude" });
    } catch (e) {
      console.error("Outline drafting failed; using template", e);
    }
  }
  return NextResponse.json({ outline: templateOutline(parsed.data), source: "template" });
}
