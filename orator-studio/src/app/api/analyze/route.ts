import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { Analysis, AnalysisRequest, analysisPrompt } from "@/ai/analysis";
import { aiConfigured } from "@/ai/claude";
import { serverSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Whether this server can ask Claude (it needs ANTHROPIC_API_KEY). */
export async function GET() {
  return NextResponse.json({ available: aiConfigured() });
}

/** Claude's analysis of confirmed figures. Only labels and numbers are sent; never the documents. */
export async function POST(request: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "Claude isn't connected to this server. Set ANTHROPIC_API_KEY.", code: "not_configured" }, { status: 501 });
  }
  const supabase = await serverSupabase();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Sign in first.", code: "not_granted" }, { status: 401 });
  }
  const parsed = AnalysisRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request.", code: "invalid_request" }, { status: 400 });

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: z.toJSONSchema(Analysis) as Record<string, unknown> },
      },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: analysisPrompt(parsed.data) }],
    });
    if (response.stop_reason === "refusal") return NextResponse.json({ error: "Claude declined to analyze these figures.", code: "refused" }, { status: 422 });
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const analysis = Analysis.safeParse(JSON.parse(text));
    if (!analysis.success) return NextResponse.json({ error: "Claude's answer couldn't be read. Try again.", code: "invalid_json" }, { status: 502 });
    return NextResponse.json({ analysis: analysis.data });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Claude is busy. Try again shortly.", code: "rate_limited" }, { status: 429 });
    console.error("Analysis failed", e);
    return NextResponse.json({ error: "Claude couldn't be reached. Try again.", code: "upstream_error" }, { status: 502 });
  }
}
