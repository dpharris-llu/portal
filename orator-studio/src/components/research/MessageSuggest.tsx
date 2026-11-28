"use client";
/** Suggest messages (F-024): pick one, and its checked points join the outline. */
import { useEffect, useState } from "react";
import type { Author } from "@/model/types";
import { activeFacts, evidenceFromFact, newPoint, type ArgOpBody, type Argument } from "@/model/argument";
import { MessageCandidates, MESSAGES_QUESTION, messagesPrompt, verifyMessages, type CheckedCandidate } from "@/ai/messages";
import { probeRequest } from "@/ai/probe";
import { askClaudeFor, claudeAvailable, ClaudeError, type Transport } from "@/ai/analysis-client";
import { WithFactChips } from "./ProbePanel";

export function MessageSuggest({ arg, apply, onFact }: { arg: Argument; apply: (b: ArgOpBody[], reason: string, author?: Author) => void; onFact?: (id: string) => void }) {
  const [transport, setTransport] = useState<Transport | null | undefined>(undefined);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [cands, setCands] = useState<{ list: CheckedCandidate[]; via: Transport } | null>(null);
  useEffect(() => {
    claudeAvailable().then(setTransport);
  }, []);
  const facts = activeFacts(arg).length;

  async function suggest() {
    setError("");
    setBusy(0);
    const req = probeRequest(arg, MESSAGES_QUESTION);
    try {
      const { value, via } = await askClaudeFor({
        prompt: messagesPrompt(req),
        parse: (raw) => {
          const r = MessageCandidates.safeParse(raw);
          return r.success ? r.data : null;
        },
        route: "/api/argument/messages",
        payload: req,
        key: "value",
        onProgress: (n) => setBusy(n),
      });
      setCands({ list: verifyMessages(arg, value), via });
    } catch (e) {
      setError(e instanceof ClaudeError ? e.message : "Claude couldn't be reached. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function use(c: CheckedCandidate) {
    const byId = new Map(activeFacts(arg).map((f) => [f.id, f]));
    const bodies: ArgOpBody[] = [{ kind: "arg.set", patch: { thesis: c.message } }];
    for (const p of c.points) {
      if (p.problems.length) continue;
      bodies.push({ kind: "point.put", point: newPoint(p.text, { intent: p.intent, detail: p.detail, byAi: true, evidence: p.factIds.flatMap((id) => (byId.get(id) ? [evidenceFromFact(arg, byId.get(id)!)] : [])) }) });
    }
    apply(bodies, "Chose a suggested message", { kind: "ai", id: "claude", via: cands?.via ?? "claude" });
    setCands(null);
  }

  if (transport === null) return null;
  return (
    <section className="proposal-card" aria-labelledby="msg-h">
      <div className="row">
        <h3 id="msg-h" className="sub-h" style={{ margin: 0, flex: 1 }}>Suggested messages</h3>
        <button className={cands ? "small" : "small primary"} disabled={busy !== null || facts === 0 || !transport} onClick={suggest}>{cands ? "Suggest again" : "Suggest messages"}</button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {facts ? `Two or three messages your ${facts} active facts can support, each with the points that carry it. Pick one, then edit freely.` : "Add sources in Evidence first; messages are suggested from your facts."}
      </p>
      {busy !== null && <p className="small" role="status">{busy ? `Claude is writing (${busy} characters)…` : "Claude is thinking…"}</p>}
      {error && <p className="small error" role="alert">{error}</p>}
      {cands?.list.map((c, i) => {
        const usable = c.points.filter((p) => !p.problems.length).length;
        return (
          <div key={i} className="candidate-message">
            <strong className="serif" style={{ fontSize: 18, color: "var(--navy)" }}>{c.message}</strong>
            <span className="small muted">{c.why}</span>
            {c.problems.length > 0 && <span className="verify bad">Check: {c.problems.join("; ")}</span>}
            <ol className="small" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
              {c.points.map((p, j) => (
                <li key={j} style={p.problems.length ? { opacity: 0.6 } : undefined}>
                  {p.text} {p.factIds.length ? <WithFactChips text={`[${p.factIds.join(", ")}]`} onFact={onFact} /> : <span className="chip warn">No evidence yet</span>}
                  {p.problems.length > 0 && <span className="verify bad">Left out: {p.problems.join("; ")}</span>}
                </li>
              ))}
            </ol>
            <div className="row">
              <button className="small primary" disabled={c.problems.length > 0} onClick={() => use(c)}>Use this message{usable ? ` and its ${usable} ${usable === 1 ? "point" : "points"}` : ""}</button>
            </div>
          </div>
        );
      })}
      {cands && arg.points.length > 0 && <p className="small muted" style={{ margin: 0 }}>Your current points stay; the chosen points are added after them. Remove any you don't want.</p>}
    </section>
  );
}
