"use client";
import { newId } from "@/model/ids";
/**
 * The analysis step shared by every source page: what the deck is for, what to
 * compare against, Claude's analysis as an argument (every number checked),
 * checks that need no AI, and computed patterns when Claude isn't connected.
 * `finalize` turns the confirmed source into the deck draft.
 */
import { useEffect, useRef, useState } from "react";
import { analyze } from "./analyze";
import { dataSeries, draftArgument, draftFromSource, type Argument, type DraftDeck } from "./build";
import { parseValue } from "./extract";
import { requestFromSource, verifyAnalysis, type CheckedAnalysis } from "@/ai/analysis";
import { askClaude, claudeAvailable, ClaudeError, type Transport } from "@/ai/analysis-client";
import type { DataSource, SourceSeries } from "@/model/types";

const KIND_LABEL: Record<string, string> = {
  volatile: "Swings",
  trend: "Trend",
  cumulative: "Rising",
  concentration: "Concentrated",
  summary: "Summary",
  reconciles: "Check",
  carries: "Check",
  matches: "Match",
  share: "Share",
  together: "Together",
};

type ClaudeState =
  | { status: "idle" }
  | { status: "thinking"; chars: number }
  | { status: "error"; message: string }
  | { status: "done"; via: Transport; result: CheckedAnalysis; request: string };

interface Comparison {
  id: string;
  label: string;
  /** Label of the row it applies to. */
  compareTo: string;
  /** One value for every period, or one per period, separated by commas. */
  values: string;
}

function parseComparison(c: Comparison, periods: number): (number | null)[] | string {
  const parts = c.values.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return "Enter a value";
  const nums = parts.map((x) => parseValue(x.replace(/\s/g, ""))?.value ?? null);
  if (nums.some((n) => n === null)) return "Use numbers, like 12000 or $12,000";
  if (nums.length === 1) return Array(periods).fill(nums[0]);
  if (nums.length !== periods) return `Give one value, or ${periods} (one per period)`;
  return nums;
}

/** `base` is the confirmed source as it would be created now, or null. Its series ids must stay stable across renders. */
export function useAnalysis(base: DataSource | null, sentWhat: string) {
  const [goal, setGoal] = useState("");
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [transport, setTransport] = useState<Transport | null | undefined>(undefined);
  const [claude, setClaude] = useState<ClaudeState>({ status: "idle" });
  const stop = useRef<AbortController | null>(null);

  useEffect(() => {
    claudeAvailable().then(setTransport);
  }, []);

  /** The source with the author's comparison rows attached. */
  function withComparisons(src: DataSource): DataSource {
    const n = src.documents.length;
    const extra: SourceSeries[] = comparisons.flatMap((c, k) => {
      const target = dataSeries(src).find((s) => s.label === c.compareTo);
      const vals = parseComparison(c, n);
      if (!target || typeof vals === "string" || !c.label.trim()) return [];
      return [
        {
          id: `cmp-${k}-${c.id}`,
          label: c.label.trim(),
          unit: target.unit,
          role: "comparison" as const,
          compareTo: target.id,
          figures: vals.map((v) => ({ value: v, raw: String(v), entered: true })),
          confirmedAt: src.createdAt,
          confirmedBy: target.confirmedBy,
        },
      ];
    });
    return { ...src, series: [...src.series, ...extra] };
  }

  const preview = base ? withComparisons(base) : null;
  const rules = preview ? analyze(preview) : null;
  const checks = rules ? rules.findings.filter((f) => f.kind === "reconciles" || f.kind === "carries") : [];
  const patterns = rules ? rules.findings.filter((f) => f.kind !== "summary" && f.kind !== "reconciles" && f.kind !== "carries") : [];
  const request = preview ? requestFromSource(preview, goal, checks.map((f) => f.text)) : null;
  const key = request ? JSON.stringify(request) : "";
  // Claude's answer only counts for the rows, comparisons and purpose it was asked about.
  const fresh = claude.status === "done" && claude.request === key;

  const toggle = (id: string, keep: boolean) =>
    setDropped((d) => {
      const next = new Set(d);
      if (keep) next.delete(id);
      else next.add(id);
      return next;
    });

  async function run() {
    if (!request) return;
    stop.current?.abort();
    const ctl = new AbortController();
    stop.current = ctl;
    setClaude({ status: "thinking", chars: 0 });
    try {
      const { analysis: a, via } = await askClaude(request, { signal: ctl.signal, onProgress: (chars) => setClaude({ status: "thinking", chars }) });
      setClaude({ status: "done", via, result: verifyAnalysis(request, a), request: key });
      setDropped(new Set());
    } catch (e) {
      const err = e instanceof ClaudeError ? e : new ClaudeError("Claude couldn't be reached. Try again.", "upstream_error");
      setClaude(err.code === "cancelled" ? { status: "idle" } : { status: "error", message: err.message });
    }
  }

  /** The final source (with comparisons) and the deck draft: Claude's argument when there is one, else the computed draft. */
  function finalize(src: DataSource): { source: DataSource; draft: DraftDeck; argument?: Argument } {
    const source = withComparisons(src);
    const ruleFindings = analyze(source).findings;
    if (fresh && claude.status === "done") {
      const r = claude.result;
      const points = r.points
        .map((pt, i) => ({ pt, id: `pt-${i}` }))
        .filter(({ pt, id }) => pt.verified && !dropped.has(id))
        .map(({ pt }) => ({ ...pt, context: pt.contextProblems.length ? undefined : pt.context }));
      if (points.length) {
        const arg: Argument = {
          thesis: r.thesis.verified ? r.thesis.text : undefined,
          points,
          recommendation: r.recommendation.verified && !dropped.has("rec") ? r.recommendation : undefined,
          nextSteps: r.nextSteps.filter((st, i) => st.verified && !dropped.has(`step-${i}`)).map((st) => st.text),
          via: claude.via,
          pointIds: points.map(() => newId("pt")),
        };
        return { source, argument: arg, draft: draftArgument(source, arg, ruleFindings.filter((f) => f.kind === "reconciles" || f.kind === "carries")) };
      }
    }
    return { source, draft: draftFromSource(source, ruleFindings.filter((f) => !dropped.has(f.id)), []) };
  }

  const rows = base ? dataSeries(base) : [];
  const n = base?.documents.length ?? 0;
  const verifyNote = (verified: boolean, count: number, problems: string[]) => (
    <span className={verified ? "verify ok" : "verify bad"}>
      {verified
        ? count === 0
          ? "No numbers to check"
          : count === 1
            ? "Its number was checked against your figures"
            : `All ${count} numbers checked against your figures`
        : `Left out: ${problems.join("; ")}`}
    </span>
  );

  const panel = rows.length > 0 && (
    <section className="stack" aria-labelledby="analysis-h">
      <h2 id="analysis-h" style={{ margin: 0, fontSize: 18 }}>Analysis</h2>
      <label>
        What is this deck for?
        <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="For example: decide on a monthly spending budget for next year" />
      </label>

      <div className="stack" style={{ gap: 6 }}>
        <span style={{ fontWeight: 500 }}>Compare against (optional)</span>
        <span className="small muted">A budget, target, last year&apos;s figures or a normal. Analysis comes mostly from comparisons.</span>
        {comparisons.map((c, k) => {
          const vals = parseComparison(c, n);
          return (
            <div key={c.id} className="row compare-row">
              <input aria-label="Comparison name" placeholder="Name, e.g. Monthly budget" value={c.label} onChange={(e) => setComparisons((cs) => cs.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)))} style={{ width: "14em" }} />
              <select aria-label={`Row that ${c.label || "this comparison"} applies to`} value={c.compareTo} onChange={(e) => setComparisons((cs) => cs.map((x, j) => (j === k ? { ...x, compareTo: e.target.value } : x)))} style={{ width: "auto" }}>
                {rows.map((r) => <option key={r.id} value={r.label}>for {r.label}</option>)}
              </select>
              <input
                aria-label={`Values for ${c.label || "this comparison"}`}
                placeholder={`One value, or ${n} separated by commas`}
                value={c.values}
                onChange={(e) => setComparisons((cs) => cs.map((x, j) => (j === k ? { ...x, values: e.target.value } : x)))}
                style={{ flex: 1, minWidth: 160 }}
                className={c.values && typeof vals === "string" ? "invalid" : undefined}
              />
              <button className="ghost danger" onClick={() => setComparisons((cs) => cs.filter((_, j) => j !== k))} aria-label={`Remove ${c.label || "comparison"}`}>Remove</button>
              {c.values && typeof vals === "string" && <span className="small error">{vals}</span>}
            </div>
          );
        })}
        <div>
          <button className="small" onClick={() => setComparisons((cs) => [...cs, { id: Math.random().toString(36).slice(2, 8), label: "", compareTo: rows[0]?.label ?? "", values: "" }])}>
            Add a comparison
          </button>
        </div>
      </div>

      {transport === undefined && <p className="small muted">Checking for Claude…</p>}
      {transport && (
        <div className="row">
          <button className="primary" onClick={run} disabled={claude.status === "thinking"}>
            {claude.status === "done" ? "Ask Claude again" : "Ask Claude to analyze"}
          </button>
          {claude.status === "thinking" && <button onClick={() => stop.current?.abort()}>Stop</button>}
          <span className="small muted" style={{ flex: 1, minWidth: 220 }}>
            Sends the purpose, comparisons, and the labels and figures of the {rows.length} confirmed {rows.length === 1 ? "row" : "rows"} to Claude
            {transport === "claude.ai" ? " on your Claude account" : " through this server's Claude API key"}. {sentWhat}
          </span>
        </div>
      )}
      {transport === null && (
        <p className="small notice">
          Claude isn&apos;t connected here. Open this page in claude.ai to use your Claude account, or set ANTHROPIC_API_KEY on the server. Until then, the computed patterns below describe the figures, but they are not an analysis.
        </p>
      )}
      {claude.status === "thinking" && (
        <p className="small" role="status">{claude.chars ? `Claude is writing (${claude.chars} characters)…` : "Claude is thinking. This can take a minute or two."}</p>
      )}
      {claude.status === "error" && <p className="small error" role="alert">{claude.message}</p>}
      {claude.status === "done" && !fresh && <p className="small notice">The rows, comparisons or purpose changed since Claude&apos;s analysis. Ask again to use it.</p>}

      {claude.status === "done" && fresh && (
        <>
          <div className="thesis">
            <span className="finding-kind ai">Claude</span> <strong>{claude.result.thesis.text}</strong>
            {!claude.result.thesis.verified && <span className="verify bad">Left out: {claude.result.thesis.problems.join("; ")}</span>}
          </div>
          <h3 className="sub-h">The argument</h3>
          <ul className="findings">
            {claude.result.points.map((pt, i) => {
              const id = `pt-${i}`;
              return (
                <li key={id} className={pt.verified ? undefined : "unverified"}>
                  <label className="inline">
                    <input type="checkbox" disabled={!pt.verified} checked={pt.verified && !dropped.has(id)} onChange={(e) => toggle(id, e.target.checked)} aria-label={`Use: ${pt.conclusion}`} />
                    <span className="point">
                      <span>
                        <span className={`confidence ${pt.confidence}`}>{pt.confidence} confidence</span> <strong>{pt.conclusion}</strong>
                      </span>
                      <span>{pt.evidence}</span>
                      <span><em>Why it matters:</em> {pt.soWhat}</span>
                      {pt.drivers.length > 0 && (
                        <span>
                          <em>Possible drivers:</em>
                          <ul className="drivers">{pt.drivers.map((d, k) => <li key={k}>{d.hypothesis} <span className="muted">Check: {d.check}</span></li>)}</ul>
                        </span>
                      )}
                      {pt.context && !pt.contextProblems.length && (
                        <span className="context-note"><strong>Claude&apos;s general knowledge, not your data (not checked):</strong> {pt.context}</span>
                      )}
                      {pt.contextProblems.length > 0 && <span className="verify bad">Context left out: {pt.contextProblems.join("; ")}</span>}
                      <span className="small muted">Why this confidence: {pt.confidenceReason}</span>
                      {verifyNote(pt.verified, pt.checkedCount, pt.problems)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <h3 className="sub-h">Recommendation</h3>
          <ul className="findings">
            <li className={claude.result.recommendation.verified ? undefined : "unverified"}>
              <label className="inline">
                <input type="checkbox" disabled={!claude.result.recommendation.verified} checked={claude.result.recommendation.verified && !dropped.has("rec")} onChange={(e) => toggle("rec", e.target.checked)} aria-label="Use the recommendation" />
                <span className="point">
                  <strong>{claude.result.recommendation.action}</strong>
                  <span><em>Why:</em> {claude.result.recommendation.rationale}</span>
                  <span><em>Tradeoffs:</em> {claude.result.recommendation.tradeoffs}</span>
                  {!claude.result.recommendation.verified && <span className="verify bad">Left out: {claude.result.recommendation.problems.join("; ")}</span>}
                </span>
              </label>
            </li>
          </ul>
          {claude.result.nextSteps.length > 0 && (
            <>
              <h3 className="sub-h">Next steps</h3>
              <ul className="findings">
                {claude.result.nextSteps.map((st, i) => {
                  const id = `step-${i}`;
                  return (
                    <li key={id} className={st.verified ? undefined : "unverified"}>
                      <label className="inline">
                        <input type="checkbox" disabled={!st.verified} checked={st.verified && !dropped.has(id)} onChange={(e) => toggle(id, e.target.checked)} />
                        <span>
                          {st.text}
                          {!st.verified && <span className="verify bad">Left out: {st.problems.join("; ")}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}

      {checks.length > 0 && (
        <>
          <h3 className="sub-h">Checks on the figures</h3>
          <ul className="findings">
            {checks.map((f) => (
              <li key={f.id}>
                <span className="finding-kind check">Check</span> {f.text}
              </li>
            ))}
          </ul>
        </>
      )}

      {!(claude.status === "done" && fresh) && patterns.length > 0 && (
        <>
          <h3 className="sub-h">Computed patterns (a summary, not an analysis)</h3>
          <ul className="findings">
            {patterns.map((f) => (
              <li key={f.id}>
                <label className="inline">
                  <input type="checkbox" checked={!dropped.has(f.id)} onChange={(e) => toggle(f.id, e.target.checked)} />
                  <span>
                    <span className="finding-kind">{KIND_LABEL[f.kind]}</span> {f.text}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );

  return { goal, panel, finalize };
}
