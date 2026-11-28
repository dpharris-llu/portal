/** Totals for the Claude usage page, from ai_usage rows. Pure, so it is tested. */

export type UsageRow = {
  created_at: string;
  presentation_id: string | null;
  task: string;
  status: string;
  served_model: string | null;
  fell_back: boolean;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number | null;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number | string | null;
  latency_ms: number | null;
};

export type Totals = { requests: number; input: number; output: number; thinking: number; cost: number; unpriced: number; failed: number; latencyMs: number };

export const TASK_LABEL: Record<string, string> = {
  search_plan: "Plan a database search",
  probe: "Ask about the evidence",
  propose: "Propose points",
  messages: "Suggest a message",
  read_paper: "Read a paper",
  synthesize: "Compare papers",
  analyze_figures: "Analyze figures",
  outline: "Draft an outline",
  bible_passages: "Find Bible passages",
  explore: "Explore an idea",
  annotate: "Draft an annotation",
};

function empty(): Totals {
  return { requests: 0, input: 0, output: 0, thinking: 0, cost: 0, unpriced: 0, failed: 0, latencyMs: 0 };
}

function add(t: Totals, r: UsageRow): void {
  t.requests += 1;
  t.input += r.input_tokens + r.cache_read_tokens + r.cache_write_tokens;
  t.output += r.output_tokens;
  t.thinking += r.thinking_tokens ?? 0;
  if (r.cost_usd === null) t.unpriced += 1;
  else t.cost += Number(r.cost_usd);
  if (r.status !== "ok") t.failed += 1;
  t.latencyMs += r.latency_ms ?? 0;
}

function group(rows: UsageRow[], keyOf: (r: UsageRow) => string): Array<[string, Totals]> {
  const m = new Map<string, Totals>();
  for (const r of rows) {
    const k = keyOf(r);
    if (!m.has(k)) m.set(k, empty());
    add(m.get(k)!, r);
  }
  return [...m.entries()].sort((a, b) => b[1].cost - a[1].cost);
}

export function report(rows: UsageRow[], now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime();
  const month = rows.filter((r) => new Date(r.created_at).getTime() >= monthStart);
  const all = empty();
  const thisMonth = empty();
  for (const r of rows) add(all, r);
  for (const r of month) add(thisMonth, r);
  return {
    all,
    thisMonth,
    byMonth: group(rows, (r) => r.created_at.slice(0, 7)).sort((a, b) => b[0].localeCompare(a[0])),
    byPresentation: group(month, (r) => r.presentation_id ?? ""),
    byTask: group(month, (r) => r.task),
    byModel: group(month, (r) => r.served_model ?? "none"),
    fallbacks: month.filter((r) => r.fell_back).length,
  };
}
