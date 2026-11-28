import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { fitToLimits, outputSchema } from "./schema";
import { Outline, outlinePrompt, type OutlineRequest } from "./outline";
import { summarize } from "./pricing";
import { recordUsage } from "./usage";

const MODEL = "claude-opus-5-5";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Ask Claude for an outline. Returns null on refusal or an unusable answer,
 * so the caller can fall back to the template.
 */
export async function draftOutline(req: OutlineRequest): Promise<Outline | null> {
  const client = new Anthropic();
  const started = Date.now();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: outputSchema(Outline) },
    },
    // On a policy decline, the API retries on a fallback model inside the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: outlinePrompt(req) }],
  });
  const done = (status: "ok" | "refused" | "too_long" | "unreadable") =>
    recordUsage({ task: "outline", status, latencyMs: Date.now() - started, requestId: response._request_id ?? null, summary: summarize(MODEL, response.model, response.usage) });
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    await done(response.stop_reason === "refusal" ? "refused" : "too_long");
    return null;
  }
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const json = safeJson(text);
  const parsed = Outline.safeParse(json === null ? null : fitToLimits(Outline, json));
  await done(parsed.success ? "ok" : "unreadable");
  return parsed.success ? parsed.data : null;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
