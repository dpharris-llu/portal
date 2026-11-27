"use client";
/**
 * The analysis step shared by every source page: the deck's purpose, Claude's
 * analysis with every number checked (F-013), checks that need no AI, and
 * computed patterns when Claude isn't connected. It hands the kept findings
 * and next steps to the deck draft.
 */
import { useEffect, useRef, useState } from "react";
import { analyze, type Finding } from "./analyze";
import { requestFromSource, verifyAnalysis, type CheckedAnalysis } from "@/ai/analysis";
import { askClaude, claudeAvailable, ClaudeError, type Transport } from "@/ai/analysis-client";
import type { DataSource } from "@/model/types";

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

/**
 * `preview` is the data source as it would be created now (null until something is confirmed).
 * Series ids in it must be stable across renders so ticked findings keep their ids.
 */
export function useAnalysis(preview: DataSource | null, sentWhat: string) {
  const [goal, setGoal] = useState("");
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [transport, setTransport] = useState<Transport | null | undefined>(undefined);
  const [claude, setClaude] = useState<ClaudeState>({ status: "idle" });
  const stop = useRef<AbortController | null>(null);

  useEffect(() => {
    claudeAvailable().then(setTransport);
  }, []);

  const analysis = preview ? analyze(preview) : null;
  const checks = analysis ? analysis.findings.filter((f) => f.kind === "reconciles" || f.kind === "carries") : [];
  const patterns = analysis ? analysis.findings.filter((f) => f.kind !== "summary" && f.kind !== "reconciles" && f.kind !== "carries") : [];
  const request = preview ? requestFromSource(preview, goal, checks.map((f) => f.text)) : null;
  const key = request ? JSON.stringify({ ...request, goal: "" }) : "";
  // Claude's answer only counts for the rows it was asked about.
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

  /** What goes into the draft: Claude's checked insights (or the computed patterns), the checks, and next steps. */
  function draftInputs(src: DataSource): { findings: Finding[]; steps: { text: string; ai: boolean }[] } {
    const rules = analyze(src).findings.filter((f) => !dropped.has(f.id));
    if (!(fresh && claude.status === "done")) return { findings: rules, steps: [] };
    const idOf = (label: string) => src.series.find((x) => x.label.toLowerCase() === label.toLowerCase())?.id;
    const fromClaude: Finding[] = claude.result.insights
      .map((ins, i) => ({ ins, id: `ai-${i}` }))
      .filter(({ ins, id }) => ins.verified && !dropped.has(id))
      .map(({ ins, id }, k) => ({
        id,
        kind: "insight" as const,
        seriesIds: ins.rows.map(idOf).filter((x): x is string => Boolean(x)),
        text: /[.!?]$/.test(ins.headline) ? `${ins.headline} ${ins.detail}` : `${ins.headline}. ${ins.detail}`,
        claim: ins.headline.replace(/[.]$/, ""),
        suggestion: ins.suggestion,
        score: 2 - k * 0.01,
        ai: { via: claude.via },
      }));
    const steps = claude.result.nextSteps
      .map((st, i) => ({ st, id: `ai-step-${i}` }))
      .filter(({ st, id }) => st.verified && !dropped.has(id))
      .map(({ st }) => ({ text: st.text, ai: true }));
    // With Claude's analysis, the computed patterns step back; the add-up checks always stay.
    const findings = fromClaude.length ? [...fromClaude, ...rules.filter((f) => f.kind === "summary" || f.kind === "reconciles" || f.kind === "carries")] : rules;
    return { findings, steps };
  }

  const count = preview?.series.length ?? 0;
  const panel = count > 0 && (
    <section className="stack" aria-labelledby="analysis-h">
      <h2 id="analysis-h" style={{ margin: 0, fontSize: 18 }}>Analysis</h2>
      <label>
        What is this deck for?
        <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="For example: decide on a monthly spending target" />
      </label>
      {transport === undefined && <p className="small muted">Checking for Claude…</p>}
      {transport && (
        <div className="row">
          <button className="primary" onClick={run} disabled={claude.status === "thinking"}>
            {claude.status === "done" ? "Ask Claude again" : "Ask Claude to analyze"}
          </button>
          {claude.status === "thinking" && <button onClick={() => stop.current?.abort()}>Stop</button>}
          <span className="small muted" style={{ flex: 1, minWidth: 220 }}>
            Sends the labels and figures of the {count} confirmed {count === 1 ? "row" : "rows"} to Claude
            {transport === "claude.ai" ? " on your Claude account" : " through this server's Claude API key"}. {sentWhat}
          </span>
        </div>
      )}
      {transport === null && (
        <p className="small notice">
          Claude isn&apos;t connected here. Open this page in claude.ai to use your Claude account, or set ANTHROPIC_API_KEY on the server. Until then, the computed patterns below stand in.
        </p>
      )}
      {claude.status === "thinking" && (
        <p className="small" role="status">{claude.chars ? `Claude is writing (${claude.chars} characters)…` : "Claude is thinking. This can take a minute."}</p>
      )}
      {claude.status === "error" && <p className="small error" role="alert">{claude.message}</p>}
      {claude.status === "done" && !fresh && <p className="small notice">The confirmed rows changed since Claude&apos;s analysis. Ask again to use it.</p>}

      {claude.status === "done" && fresh && (
        <>
          <h3 className="sub-h">Claude&apos;s analysis</h3>
          <ul className="findings">
            {claude.result.insights.map((ins, i) => {
              const id = `ai-${i}`;
              return (
                <li key={id} className={ins.verified ? undefined : "unverified"}>
                  <label className="inline">
                    <input type="checkbox" disabled={!ins.verified} checked={ins.verified && !dropped.has(id)} onChange={(e) => toggle(id, e.target.checked)} />
                    <span>
                      <span className="finding-kind ai">Claude</span> <strong>{ins.headline}</strong> {ins.detail}
                      {ins.suggestion && <span className="suggestion">Suggestion: {ins.suggestion}</span>}
                      <span className={ins.verified ? "verify ok" : "verify bad"}>
                        {ins.verified
                          ? ins.checkedCount === 0
                            ? "No numbers to check"
                            : ins.checkedCount === 1
                              ? "Its number was checked against your figures"
                              : `All ${ins.checkedCount} numbers checked against your figures`
                          : `Left out: ${ins.problems.join("; ")}`}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {claude.result.nextSteps.length > 0 && (
            <>
              <h3 className="sub-h">Suggested next steps</h3>
              <ul className="findings">
                {claude.result.nextSteps.map((st, i) => {
                  const id = `ai-step-${i}`;
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
          <h3 className="sub-h">Computed patterns{transport ? " (until you ask Claude)" : ""}</h3>
          <ul className="findings">
            {patterns.map((f) => (
              <li key={f.id}>
                <label className="inline">
                  <input type="checkbox" checked={!dropped.has(f.id)} onChange={(e) => toggle(f.id, e.target.checked)} />
                  <span>
                    <span className="finding-kind">{KIND_LABEL[f.kind]}</span> {f.text}
                    {f.suggestion && <span className="suggestion">Suggestion: {f.suggestion}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );

  return { goal, panel, draftInputs };
}
