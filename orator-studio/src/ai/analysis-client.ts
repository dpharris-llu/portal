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

/**
 * Ask Claude for JSON: on claude.ai through the viewer's account, else through
 * one of this app's server routes. `route`'s response carries the value under
 * `key`. Errors arrive as ClaudeError with a code.
 */
export async function askClaudeFor<T>(opts: {
  prompt: string;
  parse: (raw: unknown) => T | null;
  route: string;
  payload: unknown;
  key: string;
  signal?: AbortSignal;
  onProgress?: (chars: number) => void;
}): Promise<{ value: T; via: Transport }> {
  const sample = await claudeSample();
  if (sample) {
    try {
      const raw = await sample.json(opts.prompt, { modelTier: "complex", signal: opts.signal, onText: ({ text }) => opts.onProgress?.(text.length) });
      const value = opts.parse(raw);
      if (value === null) throw new ClaudeError(MESSAGES.invalid_json, "invalid_json");
      return { value, via: "claude.ai" };
    } catch (e) {
      if (e instanceof ClaudeError) throw e;
      const code = (e as { code?: string }).code ?? "upstream_error";
      throw new ClaudeError(code === "cancelled" ? "Stopped." : MESSAGES[code] ?? MESSAGES.upstream_error, code);
    }
  }
  let res: Response;
  try {
    res = await fetch(opts.route, { method: "POST", headers: { "content-type": "application/json", ...presentationHeader() }, body: JSON.stringify(opts.payload), signal: opts.signal });
  } catch {
    throw new ClaudeError(opts.signal?.aborted ? "Stopped." : MESSAGES.upstream_error, opts.signal?.aborted ? "cancelled" : "upstream_error");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A host timeout or crash returns a page, not JSON: say which, by status.
    const byStatus: Record<number, string> = {
      504: "The server stopped waiting for Claude (it hit its time limit). Try a shorter source, or try again.",
      413: "That was too much text to send at once. Try a shorter source.",
      500: "The server had an error before Claude answered. Try again.",
    };
    throw new ClaudeError(json.error ?? byStatus[res.status] ?? `${MESSAGES.upstream_error} (server answered ${res.status})`, json.code ?? "upstream_error");
  }
  const value = opts.parse(json[opts.key]);
  if (value === null) throw new ClaudeError(MESSAGES.invalid_json, "invalid_json");
  return { value, via: "api" };
}

/**
 * Which presentation a request is for, so its Claude use is counted against it
 * (the usage record). Read from the page address: /curate/<id> or /research/<id>.
 */
function presentationHeader(): Record<string, string> {
  const m = /^\/(?:curate|research)\/([\w-]{1,80})/.exec(window.location.pathname);
  return m ? { "x-presentation-id": m[1] } : {};
}

export async function askClaude(req: AnalysisRequest, opts: { signal?: AbortSignal; onProgress?: (chars: number) => void } = {}): Promise<{ analysis: Analysis; via: Transport }> {
  const { value, via } = await askClaudeFor({
    prompt: analysisPrompt(req),
    parse: (raw) => {
      const r = Analysis.safeParse(raw);
      return r.success ? r.data : null;
    },
    route: "/api/analyze",
    payload: req,
    key: "analysis",
    ...opts,
  });
  return { analysis: value, via };
}
