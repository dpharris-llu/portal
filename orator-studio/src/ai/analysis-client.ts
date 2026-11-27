"use client";
/**
 * Asks Claude for an analysis. Inside claude.ai (the demo and any page served
 * there) it uses the viewer's own Claude account through the page's `sample`
 * capability, which asks the viewer's permission first. Elsewhere it uses the
 * app's server route, which needs an ANTHROPIC_API_KEY.
 */
import { Analysis, analysisPrompt, type AnalysisRequest } from "./analysis";

export type Transport = "claude.ai" | "api";

type SampleJson = (input: string, options?: { signal?: AbortSignal; modelTier?: string; onText?: (u: { text: string }) => void }) => Promise<unknown>;
type SampleFn = { json: SampleJson };

let samplePromise: Promise<SampleFn | null> | null = null;
function claudeSample(): Promise<SampleFn | null> {
  const w = window as unknown as { claude?: { use?: (name: string) => Promise<unknown> } };
  if (!w.claude?.use) return Promise.resolve(null);
  samplePromise ??= w.claude.use("sample").then((s) => (s as SampleFn | null) ?? null, () => null);
  return samplePromise;
}

/** Which way Claude can be reached here, if any. */
export async function claudeAvailable(): Promise<Transport | null> {
  if (await claudeSample()) return "claude.ai";
  try {
    const res = await fetch("/api/analyze", { cache: "no-store" });
    if (res.ok && (await res.json()).available) return "api";
  } catch {}
  return null;
}

export class ClaudeError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  not_granted: "Claude wasn't allowed for this page. You can allow it from the page's Permissions menu.",
  sampling_disabled: "Claude isn't available on this account.",
  rate_limited: "You've reached a Claude usage limit for now. Try again later.",
  session_expired: "Sign in to claude.ai again, then try again.",
  refused: "Claude declined to analyze these figures.",
  invalid_json: "Claude's answer couldn't be read. Try again.",
  upstream_error: "Claude couldn't be reached. Try again.",
};

export async function askClaude(req: AnalysisRequest, opts: { signal?: AbortSignal; onProgress?: (chars: number) => void } = {}): Promise<{ analysis: Analysis; via: Transport }> {
  const sample = await claudeSample();
  if (sample) {
    try {
      const raw = await sample.json(analysisPrompt(req), {
        modelTier: "complex",
        signal: opts.signal,
        onText: ({ text }) => opts.onProgress?.(text.length),
      });
      const parsed = Analysis.safeParse(raw);
      if (!parsed.success) throw new ClaudeError(MESSAGES.invalid_json, "invalid_json");
      return { analysis: parsed.data, via: "claude.ai" };
    } catch (e) {
      if (e instanceof ClaudeError) throw e;
      const code = (e as { code?: string }).code ?? "upstream_error";
      throw new ClaudeError(code === "cancelled" ? "Stopped." : MESSAGES[code] ?? MESSAGES.upstream_error, code);
    }
  }
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
    signal: opts.signal,
  }).catch((e) => {
    throw new ClaudeError(opts.signal?.aborted ? "Stopped." : MESSAGES.upstream_error, opts.signal?.aborted ? "cancelled" : "upstream_error");
    void e;
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ClaudeError(json.error ?? MESSAGES.upstream_error, json.code ?? "upstream_error");
  const parsed = Analysis.safeParse(json.analysis);
  if (!parsed.success) throw new ClaudeError(MESSAGES.invalid_json, "invalid_json");
  return { analysis: parsed.data, via: "api" };
}
