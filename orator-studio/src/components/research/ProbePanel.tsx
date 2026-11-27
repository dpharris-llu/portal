"use client";
/**
 * Build the case by asking (F-118): each probe goes to Claude with the active
 * facts and the earlier probes; the checked answer comes back with proposals
 * the author accepts or dismisses, one by one.
 */
import { useEffect, useState } from "react";
import type { Author } from "@/model/types";
import { activeFacts, discardBodies, evidenceFromFact, newPoint, type ArgOpBody, type Argument, type Probe, type ProbeAction } from "@/model/argument";
import { describeAction, ProbeAnswer, probePrompt, probeRequest, verifyProbe } from "@/ai/probe";
import { askClaudeFor, claudeAvailable, ClaudeError, type Transport } from "@/ai/analysis-client";
import { newId } from "@/model/ids";

type Apply = (bodies: ArgOpBody[], reason: string, author?: Author) => void;

const STARTERS = [
  "What does the evidence say about each point?",
  "What is the strongest objection to the thesis, and do the facts answer it?",
  "Which points rest on weak or unchecked evidence?",
  "What would this audience still need to be convinced?",
];

/** Answer text with [F3] tags shown as fact chips. */
export function WithFactChips({ text, onFact }: { text: string; onFact?: (id: string) => void }) {
  const parts = text.split(/\[(F\d+(?:\s*,\s*F\d+)*)\]/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          part.split(/\s*,\s*/).map((id) => (
            <button key={`${i}-${id}`} type="button" className="fact-chip" onClick={() => onFact?.(id)} aria-label={`Show fact ${id}`}>
              {id}
            </button>
          ))
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function bodiesFor(a: Argument, x: ProbeAction): ArgOpBody[] {
  const facts = new Map(activeFacts(a).map((f) => [f.id, f]));
  const ev = (ids: string[]) => ids.flatMap((id) => (facts.get(id) ? [evidenceFromFact(a, facts.get(id)!)] : []));
  switch (x.kind) {
    case "add_point":
      return [{ kind: "point.put", point: newPoint(x.text, { intent: x.intent, detail: x.detail, evidence: ev(x.factIds), byAi: true }) }];
    case "link_evidence": {
      const p = a.points.find((y) => y.id === x.pointId);
      if (!p) return [];
      const have = new Set(p.evidence.map((e) => e.factId));
      return [{ kind: "point.put", point: { ...p, evidence: [...p.evidence, ...ev(x.factIds.filter((id) => !have.has(id)))] } }];
    }
    case "set_thesis":
      return [{ kind: "arg.set", patch: { thesis: x.text } }];
    case "add_open_question":
      return a.openQuestions.includes(x.text) ? [] : [{ kind: "arg.set", patch: { openQuestions: [...a.openQuestions, x.text] } }];
    case "discard_source":
      return discardBodies(a, { sourceId: x.sourceId }, x.reason);
    case "discard_fact":
      return discardBodies(a, { factId: x.factId }, x.reason);
  }
}

export function ProbePanel({ arg, apply, onFact }: { arg: Argument; apply: Apply; onFact?: (id: string) => void }) {
  const [transport, setTransport] = useState<Transport | null | undefined>(undefined);
  const [question, setQuestion] = useState("");
  const [thinking, setThinking] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    claudeAvailable().then(setTransport);
  }, []);

  async function ask(q: string) {
    const text = q.trim();
    if (!text) return;
    setError("");
    setThinking(0);
    const req = probeRequest(arg, text);
    try {
      const { value, via } = await askClaudeFor({
        prompt: probePrompt(req),
        parse: (raw) => {
          const r = ProbeAnswer.safeParse(raw);
          return r.success ? r.data : null;
        },
        route: "/api/argument/probe",
        payload: req,
        key: "value",
        onProgress: (chars) => setThinking(chars),
      });
      const v = verifyProbe(arg, value);
      const probe: Probe = {
        id: newId("probe"),
        question: text,
        at: new Date().toISOString(),
        answer: v.answer,
        cites: v.cites,
        problems: v.problems,
        proposals: v.proposals,
        outcomes: v.proposals.map((p) => (p.problems.length ? "left out" : "open")),
        via,
      };
      apply([{ kind: "probe.put", probe }], "Asked Claude", { kind: "ai", id: "claude", via });
      setQuestion("");
    } catch (e) {
      setError(e instanceof ClaudeError ? e.message : "Claude couldn't be reached. Try again.");
    } finally {
      setThinking(null);
    }
  }

  function decide(probe: Probe, i: number, accept: boolean) {
    const outcomes = probe.outcomes.map((o, j) => (j === i ? (accept ? "accepted" : "dismissed") : o));
    const record: ArgOpBody = { kind: "probe.put", probe: { ...probe, outcomes } };
    const bodies = accept ? bodiesFor(arg, probe.proposals[i].action) : [];
    apply([...bodies, record], accept ? `Accepted: ${describeAction(arg, probe.proposals[i].action)}` : "Dismissed a proposal");
  }

  const probes = [...(arg.probes ?? [])].reverse();
  const factCount = activeFacts(arg).length;

  return (
    <section className="probe-panel" aria-labelledby="probe-h">
      <div className="panel-head">
        <h2 id="probe-h">Ask about your evidence</h2>
        <span className="small muted">{factCount} active {factCount === 1 ? "fact" : "facts"}</span>
      </div>
      {transport === null ? (
        <p className="small muted">Probing needs Claude. Open this page in claude.ai, or sign in on a server with Claude connected. You can still add, link and discard sources and facts below.</p>
      ) : (
        <form
          className="stack"
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <label className="sr-only" htmlFor="probe-q">Your question</label>
          <textarea
            id="probe-q"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(question);
            }}
            placeholder="Ask anything about your sources, or tell Claude what to drop: “Discard the pilot study, it's underpowered.”"
          />
          <div className="row">
            <button className="primary" disabled={thinking !== null || !question.trim() || !transport}>Ask</button>
            {thinking !== null && <span className="small" role="status">{thinking ? `Claude is writing (${thinking} characters)…` : "Claude is thinking…"}</span>}
          </div>
          {!probes.length && (
            <div className="starters">
              {STARTERS.map((s) => (
                <button key={s} type="button" className="small" onClick={() => setQuestion(s)}>{s}</button>
              ))}
            </div>
          )}
          {error && <p className="small error" role="alert">{error}</p>}
          <p className="small muted" style={{ margin: 0 }}>Only active facts are sent, with your earlier questions. Discarded sources and facts never are.</p>
        </form>
      )}

      <ol className="probe-thread">
        {probes.map((p) => (
          <li key={p.id} className="probe">
            <p className="probe-q">{p.question}</p>
            <div className="probe-a"><WithFactChips text={p.answer} onFact={onFact} /></div>
            {p.problems.length > 0 && <p className="verify bad">Check this answer: {p.problems.join("; ")}.</p>}
            {p.proposals.length > 0 && (
              <ul className="proposals">
                {p.proposals.map((x, i) => {
                  const outcome = p.outcomes[i];
                  const discard = x.action.kind === "discard_source" || x.action.kind === "discard_fact";
                  return (
                    <li key={i} className={`proposal ${outcome}${discard ? " discard" : ""}`}>
                      <span className="proposal-what">{describeAction(arg, x.action)}</span>
                      {"reason" in x.action && <span className="small">Reason: {x.action.reason}</span>}
                      {x.why && <span className="small muted">{x.why}</span>}
                      {outcome === "left out" && <span className="verify bad">Left out by the checks: {x.problems.join("; ")}</span>}
                      {outcome === "open" ? (
                        <span className="row">
                          <button className={discard ? "small danger" : "small primary"} onClick={() => decide(p, i, true)}>{discard ? "Discard" : "Accept"}</button>
                          <button className="small ghost" onClick={() => decide(p, i, false)}>Dismiss</button>
                        </span>
                      ) : outcome !== "left out" ? (
                        <span className={`pill ${outcome === "accepted" ? "ok" : ""}`}>{outcome === "accepted" ? (discard ? "Discarded" : "Accepted") : "Dismissed"}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
