import { describe, expect, it } from "vitest";
import { attemptCost, dollars, summarize } from "./pricing";
import { report, type UsageRow } from "./usage-report";

describe("pricing", () => {
  it("prices a plain Opus 5.5 request", () => {
    // 10,000 in at $4/M = $0.04; 2,000 out at $20/M = $0.04.
    const s = summarize("claude-opus-5-5", "claude-opus-5-5", { input_tokens: 10_000, output_tokens: 2_000, output_tokens_details: { thinking_tokens: 1_500 } });
    expect(s.costUsd).toBeCloseTo(0.08, 10);
    expect(s.thinking).toBe(1_500);
    expect(s.fellBack).toBe(false);
  });

  it("prices cache reads and both cache write lengths", () => {
    const c = attemptCost({ model: "claude-opus-5-5", input: 0, output: 0, cacheRead: 1_000_000, cacheWrite5m: 1_000_000, cacheWrite1h: 1_000_000 });
    expect(c).toBeCloseTo(0.2 + 5 + 8, 10);
  });

  it("counts every attempt of a fallback at its own model's price", () => {
    const s = summarize("claude-opus-5-5", "claude-opus-5", {
      input_tokens: 1_000,
      output_tokens: 500,
      iterations: [
        { type: "message", model: null, input_tokens: 1_000, output_tokens: 100 },
        { type: "fallback_message", model: "claude-opus-5", input_tokens: 1_000, output_tokens: 500 },
      ],
    });
    expect(s.fellBack).toBe(true);
    expect(s.attempts.map((a) => a.model)).toEqual(["claude-opus-5-5", "claude-opus-5"]);
    expect(s.input).toBe(2_000);
    // Opus 5.5: 1000*4 + 100*20 = 6000; Opus 5: 1000*5 + 500*25 = 17500; per million.
    expect(s.costUsd).toBeCloseTo(0.0235, 10);
  });

  it("says unknown rather than guessing for a model with no price", () => {
    expect(summarize("x", "claude-unknown", { input_tokens: 1, output_tokens: 1 }).costUsd).toBeNull();
    expect(dollars(null)).toBe("unknown");
    expect(dollars(0.0042)).toBe("$0.0042");
    expect(dollars(1.234)).toBe("$1.23");
  });
});

describe("usage report", () => {
  const row = (over: Partial<UsageRow>): UsageRow => ({
    created_at: "2026-11-20T10:00:00Z", presentation_id: "p1", task: "probe", status: "ok", served_model: "claude-opus-5-5", fell_back: false,
    input_tokens: 100, output_tokens: 50, thinking_tokens: 10, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: "0.010000", latency_ms: 2000, ...over,
  });
  it("totals this month, by presentation and by task", () => {
    const r = report([row({}), row({ task: "search_plan", cost_usd: 0.02 }), row({ created_at: "2026-10-31T23:00:00Z", presentation_id: "p2" }), row({ cost_usd: null, status: "error" })], new Date("2026-11-28T00:00:00Z"));
    expect(r.thisMonth.requests).toBe(3);
    expect(r.thisMonth.cost).toBeCloseTo(0.03, 10);
    expect(r.thisMonth.unpriced).toBe(1);
    expect(r.thisMonth.failed).toBe(1);
    expect(r.all.cost).toBeCloseTo(0.04, 10);
    expect(r.byPresentation.map(([k]) => k)).toEqual(["p1"]);
    expect(r.byTask[0][0]).toBe("search_plan");
    expect(r.byMonth.map(([k]) => k)).toEqual(["2026-11", "2026-10"]);
  });
});

describe("standard models", () => {
  it("prices Sonnet and Haiku, with Haiku's long-prompt rate", () => {
    expect(summarize("claude-sonnet-5-5", "claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 }).costUsd).toBeCloseTo(12, 10);
    expect(summarize("claude-haiku-5-5", "claude-haiku-5-5", { input_tokens: 100_000, output_tokens: 1_000_000 }).costUsd).toBeCloseTo(0.01 + 0.5, 10);
    expect(summarize("claude-haiku-5-5", "claude-haiku-5-5", { input_tokens: 200_000, output_tokens: 1_000_000 }).costUsd).toBeCloseTo(0.1 + 2.5, 10);
  });
});
