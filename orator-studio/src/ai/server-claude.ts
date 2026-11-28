import "server-only";
/** One way for server routes to ask Claude for JSON matching a schema, with the same errors everywhere. */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { outputSchema } from "./schema";
import { aiConfigured } from "./claude";
import { serverAccess } from "@/lib/serverAccess";

export async function guard(): Promise<NextResponse | null> {
  if (!aiConfigured()) return NextResponse.json({ error: "Claude isn't connected to this server. Set ANTHROPIC_API_KEY.", code: "not_configured" }, { status: 501 });
  const access = await serverAccess();
  if (!access.ok) return NextResponse.json({ error: access.error, code: "not_granted" }, { status: access.status });
  return null;
}

export async function claudeJson<T extends z.ZodType>(prompt: string, schema: T, key: string): Promise<NextResponse> {
  try {
    const client = new Anthropic();
    const stream = client.beta.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 32000,
      output_config: { effort: "high", format: { type: "json_schema", schema: outputSchema(schema) } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: prompt }],
    });
    const response = await stream.finalMessage();
    if (response.stop_reason === "refusal") return NextResponse.json({ error: "Claude declined this request.", code: "refused" }, { status: 422 });
    if (response.stop_reason === "max_tokens") return NextResponse.json({ error: "Claude's answer was too long. Try fewer papers or rows.", code: "invalid_json" }, { status: 502 });
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = schema.safeParse(JSON.parse(text));
    if (!parsed.success) return NextResponse.json({ error: "Claude's answer couldn't be read. Try again.", code: "invalid_json" }, { status: 502 });
    return NextResponse.json({ [key]: parsed.data });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Claude is busy. Try again shortly.", code: "rate_limited" }, { status: 429 });
    console.error("Claude request failed", e);
    return NextResponse.json({ error: explain(e), code: "upstream_error" }, { status: 502 });
  }
}

/**
 * A plain reason for the author, from Anthropic's answer. Never includes the
 * key: Anthropic's error messages don't echo it, and only the type, status and
 * message are used.
 */
export function explain(e: unknown): string {
  if (e instanceof Anthropic.APIError) {
    const body = (e as { error?: { error?: { type?: string; message?: string } } }).error?.error;
    const detail = body?.message ? ` (${body.message.slice(0, 200)})` : "";
    switch (e.status) {
      case 401:
        return "Anthropic didn't accept the API key. Check ANTHROPIC_API_KEY in Vercel (the whole key, no spaces), then redeploy.";
      case 403:
        return `This API key isn't allowed to make this request${detail}. Check the key's workspace and permissions in the Claude Console.`;
      case 404:
        return `Anthropic couldn't find what was asked for${detail}. The model may not be available to this key's account.`;
      case 400:
        return `Anthropic didn't accept the request${detail}.`;
      case 402:
        return "The Anthropic account has no credit or has reached its spending limit. Check Billing and Limits in the Claude Console.";
      case 529:
      case 503:
        return "Claude is overloaded right now. Try again in a minute.";
      default:
        if (e.status) return `Anthropic answered ${e.status}${detail}. Try again.`;
    }
  }
  const name = (e as { name?: string })?.name ?? "";
  if (/Timeout|Abort/i.test(name)) return "Claude took too long to answer. Try again.";
  return `Claude couldn't be reached (${name || "unknown error"}). Try again.`;
}
