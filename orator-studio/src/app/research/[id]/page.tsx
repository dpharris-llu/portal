"use client";
/**
 * The argument outline (F-002, F-016): organize your thoughts before any slides
 * exist. Purpose and audience, a thesis, points in order with the evidence
 * behind each (a point with none is marked unsupported, not blocked), open
 * questions, a recommendation and next steps. Claude can propose points; the
 * author keeps, edits or drops each one.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { useArgument } from "@/lib/useArgument";
import { argumentTitle, evidenceFromFact, isSupported, newPoint, type ArgFields, type ArgPoint, type Argument } from "@/model/argument";
import type { Intent } from "@/model/types";
import { Proposal, proposePrompt, templateProposal, type ProposeRequest } from "@/ai/argument";
import { askClaudeFor, claudeAvailable, ClaudeError, type Transport } from "@/ai/analysis-client";
import { briefMarkdown } from "@/research/brief";
import { saveFile } from "@/lib/saveFile";
import { ProbePanel } from "@/components/research/ProbePanel";
import { noteBodies, WorkspacePanel } from "@/components/research/WorkspacePanel";

/** A text field that keeps its own value while typing and commits when you leave it. */
function Field({ value, onCommit, multiline, label, placeholder, rows }: { value: string; onCommit: (v: string) => void; multiline?: boolean; label: string; placeholder?: string; rows?: number }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => v !== value && onCommit(v);
  return multiline ? (
    <textarea aria-label={label} value={v} rows={rows ?? 2} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} />
  ) : (
    <input aria-label={label} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
  );
}

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

function EvidenceAdder({ onAdd }: { onAdd: (text: string, source: string) => void }) {
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  return (
    <div className="row" style={{ alignItems: "flex-end" }}>
      <label style={{ flex: 3, minWidth: 180 }} className="small">
        Evidence
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="A fact, figure or finding that supports this point" />
      </label>
      <label style={{ flex: 2, minWidth: 140 }} className="small">
        Source
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Where it comes from" />
      </label>
      <button
        className="small"
        disabled={!text.trim()}
        onClick={() => {
          onAdd(text.trim(), source.trim());
          setText("");
          setSource("");
        }}
      >
        Add evidence
      </button>
    </div>
  );
}

export default function ArgumentPage() {
  const { id } = useParams<{ id: string }>();
  const { argument: arg, log, missing, status, apply, undo, canUndo } = useArgument(id);
  const [transport, setTransport] = useState<Transport | null | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [proposal, setProposal] = useState<{ value: Proposal; keep: Set<number>; useThesis: boolean; via: Transport | "template" } | null>(null);
  const [thinking, setThinking] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [find, setFind] = useState<{ want: string; n: number } | null>(null);
  const showFact = (id: string) => {
    setHighlight(id);
    setTimeout(() => document.getElementById(`fact-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  useEffect(() => {
    claudeAvailable().then(setTransport);
  }, []);

  if (missing) return <main className="narrow"><p>This argument was not found. <Link href="/research">Back to Research</Link></p></main>;
  if (!arg) return <main className="narrow muted">Loading…</main>;

  const set = (patch: Partial<ArgFields>) => apply([{ kind: "arg.set", patch }], "Edited argument");
  const putPoint = (point: ArgPoint, reason = "Edited point") => apply([{ kind: "point.put", point }], reason);

  async function propose(a: Argument) {
    setError("");
    const req: ProposeRequest = {
      purpose: a.purpose,
      audience: a.audience,
      takeaway: a.takeaway,
      thesis: a.thesis,
      points: a.points.map((p) => ({ text: p.text, detail: p.detail, evidence: p.evidence.map((e) => e.text) })),
      notes,
    };
    setThinking(0);
    try {
      const { value, via } = await askClaudeFor({
        prompt: proposePrompt(req),
        parse: (raw) => {
          const r = Proposal.safeParse(raw);
          return r.success ? r.data : null;
        },
        route: "/api/argument/propose",
        payload: req,
        key: "value",
        onProgress: (chars) => setThinking(chars),
      });
      setProposal({ value, keep: new Set(value.points.map((_, i) => i)), useThesis: Boolean(value.thesis), via });
    } catch (e) {
      setError(e instanceof ClaudeError ? e.message : "Claude couldn't be reached. Try again.");
    } finally {
      setThinking(null);
    }
  }

  function acceptProposal() {
    if (!proposal || !arg) return;
    const { value, keep, useThesis, via } = proposal;
    const ai = via !== "template";
    const bodies: Parameters<typeof apply>[0] = [];
    if (useThesis && value.thesis && value.thesis !== arg.thesis) bodies.push({ kind: "arg.set", patch: { thesis: value.thesis } });
    let index = 0;
    value.points.forEach((p, i) => {
      if (!keep.has(i)) return;
      const existing = p.keepsExisting ? arg.points[p.keepsExisting - 1] : undefined;
      const point = existing
        ? { ...existing, text: p.text, detail: p.detail || existing.detail, intent: p.intent as Intent, byAi: existing.byAi || (ai && p.text !== existing.text) }
        : newPoint(p.text, { intent: p.intent as Intent, detail: p.detail, byAi: ai });
      bodies.push({ kind: "point.put", point, index: index++ });
    });
    const questions = value.openQuestions.filter((q) => !arg.openQuestions.includes(q));
    if (questions.length) bodies.push({ kind: "arg.set", patch: { openQuestions: [...arg.openQuestions, ...questions] } });
    apply(bodies, ai ? "Kept points proposed by Claude" : "Started from a template", ai ? { kind: "ai", id: "claude", via: String(via) } : undefined);
    setProposal(null);
  }

  async function downloadBrief() {
    const name = `${argumentTitle(arg!).replace(/[^\w\- ]+/g, "").slice(0, 60).trim() || "brief"}.md`;
    const r = await saveFile(name, briefMarkdown(arg!), "text/markdown");
    setError(r === "saved" || r === "declined" ? "" : r);
  }

  const unsupported = arg.points.filter((p) => !isSupported(p)).length;

  return (
    <>
      <TopBar>
        <span className="status" role="status">{status === "saving" ? "Saving…" : status === "error" ? "Save failed: kept locally" : "Saved"}</span>
        <button onClick={undo} disabled={!canUndo}>Undo</button>
        <button onClick={downloadBrief}>Download brief</button>
        <Link href={`/build/${arg.id}`}><button className="primary">Build slides</button></Link>
      </TopBar>
      <main className="wide stack" style={{ maxWidth: 1360, gap: 24 }}>
        <div className="stack" style={{ gap: 4 }}>
          <p className="eyebrow">Argument</p>
          <div className="title-input"><Field label="Title" value={arg.title} placeholder={argumentTitle(arg)} onCommit={(title) => set({ title })} /></div>
        </div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <label style={{ flex: 2, minWidth: 260 }}>
            Purpose: what should happen because of this?
            <Field multiline label="Purpose" value={arg.purpose} placeholder="Get approval to pilot the new advising model in two schools" onCommit={(purpose) => set({ purpose })} />
          </label>
          <label style={{ flex: 1, minWidth: 200 }}>
            Audience
            <Field label="Audience" value={arg.audience} placeholder="Deans' council" onCommit={(audience) => set({ audience })} />
          </label>
        </div>
        <label>
          Key takeaway
          <Field label="Key takeaway" value={arg.takeaway} placeholder="The one thing they should remember" onCommit={(takeaway) => set({ takeaway })} />
        </label>
        <div className="stack arg-thesis" style={{ gap: 4 }}>
          <span className="eyebrow">Thesis</span>
          <span className="small muted">The one sentence everything supports.</span>
          <Field multiline label="Thesis" value={arg.thesis} placeholder="Write the one sentence your argument supports" onCommit={(thesis) => set({ thesis })} />
        </div>

        <div className="research-grid">
        <div className="stack research-main" style={{ gap: 24 }}>
        <section className="stack" aria-labelledby="points-h">
          <div className="row">
            <h2 id="points-h" className="section-h" style={{ margin: 0 }}>Points, in order</h2>
            <span className="small muted">{arg.points.length} points{unsupported ? `, ${unsupported} without evidence yet` : ""}</span>
          </div>
          <details>
            <summary className="small">Your notes for Claude (optional)</summary>
            <textarea aria-label="Notes for Claude" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paste or jot anything: what you know, what you suspect, what people have asked." />
          </details>
          <div className="row">
            {transport ? (
              <button onClick={() => propose(arg)} disabled={thinking !== null || (!arg.purpose.trim() && !arg.points.length && !notes.trim())}>
                {arg.points.length ? "Ask Claude to strengthen the outline" : "Ask Claude to propose points"}
              </button>
            ) : transport === null ? (
              <span className="small muted">Claude isn&apos;t connected here, so it can&apos;t propose points.</span>
            ) : null}
            {!arg.points.length && (
              <button onClick={() => setProposal({ value: templateProposal(arg), keep: new Set([0, 1, 2, 3]), useThesis: Boolean(arg.takeaway), via: "template" })}>Start from a template</button>
            )}
            {thinking !== null && <span className="small" role="status">{thinking ? `Claude is writing (${thinking} characters)…` : "Claude is thinking…"}</span>}
            {!arg.purpose.trim() && !arg.points.length && transport && <span className="small muted">Write a purpose first.</span>}
          </div>
          {error && <p className="small error" role="alert">{error}</p>}

          {proposal && (
            <div className="proposal-card" aria-label="Proposal">
              <strong>{proposal.via === "template" ? "Template outline" : "Claude's proposal"}: keep what helps</strong>
              {proposal.value.thesis && (
                <label className="inline">
                  <input type="checkbox" checked={proposal.useThesis} onChange={(e) => setProposal({ ...proposal, useThesis: e.target.checked })} />
                  <span>Thesis: {proposal.value.thesis}</span>
                </label>
              )}
              <ol className="stack" style={{ gap: 4, margin: 0 }}>
                {proposal.value.points.map((p, i) => (
                  <li key={i}>
                    <label className="inline">
                      <input
                        type="checkbox"
                        checked={proposal.keep.has(i)}
                        onChange={(e) => {
                          const keep = new Set(proposal.keep);
                          if (e.target.checked) keep.add(i);
                          else keep.delete(i);
                          setProposal({ ...proposal, keep });
                        }}
                        aria-label={`Keep: ${p.text}`}
                      />
                      <span>
                        <strong>{p.text}</strong> <span className="chip">{p.intent}</span>
                        {p.keepsExisting ? <span className="small muted"> (refines your point {p.keepsExisting})</span> : null}
                        <br />
                        <span className="small">{p.detail}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ol>
              {proposal.value.openQuestions.length > 0 && (
                <span className="small"><em>Open questions it suggests:</em> {proposal.value.openQuestions.join(" · ")}</span>
              )}
              <span className="small muted">Points you don&apos;t keep are dropped; your points it doesn&apos;t mention stay at the end.</span>
              <div className="row">
                <button className="primary" onClick={acceptProposal} disabled={!proposal.keep.size && !proposal.useThesis}>Add what I kept</button>
                <button onClick={() => setProposal(null)}>Discard</button>
              </div>
            </div>
          )}

          {arg.points.map((p, i) => (
            <div key={p.id} className={`arg-point${isSupported(p) ? "" : " unsupported"}`} aria-label={`Point ${i + 1}`}>
              <div className="point-head">
                <span className="num-badge">{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Field label={`Conclusion of point ${i + 1}`} value={p.text} placeholder="A conclusion, written as a headline" onCommit={(text) => putPoint({ ...p, text })} />
                </div>
                <select aria-label={`Intent of point ${i + 1}`} value={p.intent} onChange={(e) => putPoint({ ...p, intent: e.target.value as Intent })} style={{ width: "auto" }}>
                  <option value="inform">inform</option>
                  <option value="persuade">persuade</option>
                  <option value="decide">decide</option>
                </select>
              </div>
              <div className="row small">
                {isSupported(p) ? <span className="chip ok">{p.evidence.length} evidence</span> : <span className="chip warn">No evidence yet</span>}
                {p.byAi && <span className="chip">Written with Claude</span>}
              </div>
              <Field multiline label={`Detail for point ${i + 1}`} value={p.detail} placeholder="Why it matters, and what you want to say about it" onCommit={(detail) => putPoint({ ...p, detail })} />
              {p.evidence.length > 0 && (
                <ul className="evidence-list">
                  {p.evidence.map((e) => (
                    <li key={e.id}>
                      {e.factId ? <button type="button" className="fact-chip" onClick={() => showFact(e.factId!)} aria-label={`Show fact ${e.factId}`}>{e.factId}</button> : <span className="chip">{e.kind}</span>}
                      <span style={{ flex: 1 }}>
                        {e.text}
                        {e.quote && <span className="quote-line" style={{ display: "block" }}>“{e.quote}”</span>}
                        {e.source && <span className="muted"> ({e.source})</span>}
                      </span>
                      <button className="ghost danger small" onClick={() => putPoint({ ...p, evidence: p.evidence.filter((x) => x.id !== e.id) }, "Took evidence off a point")} aria-label={`Take off this point: ${e.text}`}>{e.factId ? "Unlink" : "Remove"}</button>
                    </li>
                  ))}
                </ul>
              )}
              <EvidenceAdder
                onAdd={(text, source) => {
                  const { bodies, fact } = noteBodies(arg, text, source);
                  const after = { ...arg, sources: [...(arg.sources ?? []), ...bodies.flatMap((b) => (b.kind === "source.put" ? [b.source] : []))], facts: [...(arg.facts ?? []), fact] };
                  apply([...bodies, { kind: "point.put", point: { ...p, evidence: [...p.evidence, evidenceFromFact(after, fact)] } }], "Added evidence");
                }}
              />
              <div className="row">
                <button className="small" onClick={() => apply([{ kind: "point.move", pointId: p.id, index: i - 1 }], "Moved point")} disabled={i === 0}>Move up</button>
                <button className="small" onClick={() => apply([{ kind: "point.move", pointId: p.id, index: i + 1 }], "Moved point")} disabled={i === arg.points.length - 1}>Move down</button>
                <button className="small ghost danger" onClick={() => apply([{ kind: "point.delete", pointId: p.id }], "Removed point")}>Remove point</button>
              </div>
            </div>
          ))}
          <div className="row">
            <button onClick={() => apply([{ kind: "point.put", point: newPoint() }], "Added point")}>Add a point</button>
          </div>
        </section>

        <label>
          What we don&apos;t know yet (one per line)
          <Field multiline rows={3} label="Open questions" value={arg.openQuestions.join("\n")} onCommit={(v) => set({ openQuestions: lines(v) })} />
        </label>
        <label>
          Recommendation
          <Field multiline label="Recommendation" value={arg.recommendation} placeholder="What you recommend, why, and the tradeoffs" onCommit={(recommendation) => set({ recommendation })} />
        </label>
        <label>
          Next steps (one per line)
          <Field multiline rows={3} label="Next steps" value={arg.nextSteps.join("\n")} onCommit={(v) => set({ nextSteps: lines(v) })} />
        </label>
        <p className="small muted">Version {arg.version} · {log.length} changes recorded</p>
        </div>
        <aside className="research-side" aria-label="Research workspace">
          <ProbePanel arg={arg} apply={apply} onFact={showFact} onFind={(want) => setFind((f) => ({ want, n: (f?.n ?? 0) + 1 }))} />
          <WorkspacePanel arg={arg} apply={apply} highlight={highlight} find={find} />
        </aside>
        </div>
      </main>
    </>
  );
}
