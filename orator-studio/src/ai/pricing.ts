/**
 * What a Claude request costs, from the token counts Anthropic returns.
 *
 * Prices are Anthropic's first-party list prices in US dollars per million
 * tokens (checked 2026-11). They are an estimate: the bill is the Claude
 * Console's Usage and Cost pages. When Anthropic changes a price, change it
 * here; past rows keep the cost worked out when they were recorded.
 *
 * Cache writes cost 1.25x the input price for the 5-minute cache and 2x for
 * the 1-hour cache. Thinking tokens are already inside output_tokens.
 */

export type Price = { input: number; output: number; cacheRead: number };

export const PRICES_CHECKED = "2026-11";

export const PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  // Models a refused request can fall back to.
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-fable-5-2": { input: 8, output: 40, cacheRead: 0.2 },
};

/** One model attempt's tokens. A request with a fallback has more than one. */
export type Attempt = {
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
};

/** Dollars for one attempt, or null when the model has no price here. */
export function attemptCost(a: Attempt): number | null {
  const p = PRICES[a.model];
  if (!p) return null;
  const perToken =
    a.input * p.input +
    a.output * p.output +
    a.cacheRead * p.cacheRead +
    a.cacheWrite5m * p.input * 1.25 +
    a.cacheWrite1h * p.input * 2;
  return perToken / 1_000_000;
}

type CacheCreation = { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null | undefined;
type UsageLike = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_creation?: CacheCreation;
  output_tokens_details?: { thinking_tokens?: number | null } | null;
  iterations?: Array<{
    type: string;
    model?: string | null;
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    cache_creation?: CacheCreation;
  }> | null;
};

function writes(total: number, split: CacheCreation): { cacheWrite5m: number; cacheWrite1h: number } {
  const h1 = split?.ephemeral_1h_input_tokens ?? 0;
  return { cacheWrite1h: h1, cacheWrite5m: Math.max(0, total - h1) };
}

/**
 * The attempts behind one response. With a server-side fallback, the top-level
 * usage covers only the attempt that answered; `usage.iterations` lists every
 * attempt with its own model, so it is used whenever it is there. Compaction
 * entries are counted too: they are billed like any other request.
 */
export function attemptsOf(requestedModel: string, servedModel: string, usage: UsageLike): Attempt[] {
  const its = usage.iterations ?? [];
  if (its.length) {
    return its.map((it) => ({
      model: it.model ?? (it.type === "fallback_message" ? servedModel : requestedModel),
      input: it.input_tokens ?? 0,
      output: it.output_tokens ?? 0,
      cacheRead: it.cache_read_input_tokens ?? 0,
      ...writes(it.cache_creation_input_tokens ?? 0, it.cache_creation),
    }));
  }
  return [
    {
      model: servedModel,
      input: usage.input_tokens,
      output: usage.output_tokens,
      cacheRead: usage.cache_read_input_tokens ?? 0,
      ...writes(usage.cache_creation_input_tokens ?? 0, usage.cache_creation),
    },
  ];
}

export type UsageSummary = {
  requestedModel: string;
  servedModel: string;
  fellBack: boolean;
  input: number;
  output: number;
  thinking: number | null;
  cacheRead: number;
  cacheWrite: number;
  /** Null when some attempt ran on a model with no price here. */
  costUsd: number | null;
  attempts: Attempt[];
};

export function summarize(requestedModel: string, servedModel: string, usage: UsageLike): UsageSummary {
  const attempts = attemptsOf(requestedModel, servedModel, usage);
  const sum = (f: (a: Attempt) => number) => attempts.reduce((n, a) => n + f(a), 0);
  const costs = attempts.map(attemptCost);
  return {
    requestedModel,
    servedModel,
    fellBack: (usage.iterations ?? []).some((i) => i.type === "fallback_message"),
    input: sum((a) => a.input),
    output: sum((a) => a.output),
    thinking: usage.output_tokens_details?.thinking_tokens ?? null,
    cacheRead: sum((a) => a.cacheRead),
    cacheWrite: sum((a) => a.cacheWrite5m + a.cacheWrite1h),
    costUsd: costs.some((c) => c === null) ? null : costs.reduce<number>((n, c) => n + (c ?? 0), 0),
    attempts,
  };
}

/** "$0.0123", "$1.24": enough digits to see a single request. */
export function dollars(n: number | null | undefined): string {
  if (n === null || n === undefined) return "unknown";
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}
