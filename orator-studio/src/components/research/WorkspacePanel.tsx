"use client";
/**
 * Sources and facts (F-118). Facts can be put to work on a point, and any source
 * or fact can be discarded with a reason: it leaves every point and is never
 * sent to Claude again. Discarded items stay listed, and can be restored.
 */
import { useEffect, useState } from "react";
import type { Author } from "@/model/types";
import { activeFacts, discardBodies, evidenceFromFact, locate, nextId, restoreBodies, type ArgOpBody, type Argument, type Fact, type WorkspaceSource } from "@/model/argument";
import { AddPaper } from "./AddPaper";
import { FindSources } from "./FindSources";
import { BiblePanel, useScriptureRefresh, workspaceHost } from "./BiblePanel";

type Apply = (bodies: ArgOpBody[], reason: string, author?: Author) => void;

/** Ops that put an author's note into the workspace as a fact (unchecked), creating its source if needed. */
export function noteBodies(a: Argument, text: string, from: string): { bodies: ArgOpBody[]; fact: Fact } {
  const citation = from.trim() || "Author's notes";
  const existing = (a.sources ?? []).find((s) => s.status === "active" && s.citation === citation);
  const bodies: ArgOpBody[] = [];
  let source = existing;
  if (!source) {
    source = { id: nextId("S", a.sources), kind: "note", origin: "yours", title: citation, citation, short: citation, status: "active", addedAt: new Date().toISOString() };
    bodies.push({ kind: "source.put", source });
  }
  const fact: Fact = { id: nextId("F", a.facts), sourceId: source.id, kind: "note", text, checked: false, status: "active" };
  bodies.push({ kind: "fact.put", fact });
  return { bodies, fact };
}

function DiscardButton({ label, onDiscard }: { label: string; onDiscard: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) return <button className="small ghost danger" onClick={() => setOpen(true)} aria-label={label}>Discard</button>;
  return (
    <span className="discard-ask">
      <input aria-label="Why discard it? (optional)" placeholder="Why? (optional)" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      <button className="small danger" onClick={() => { onDiscard(reason.trim() || "Discarded by the author"); setOpen(false); }}>Discard</button>
      <button className="small ghost" onClick={() => setOpen(false)}>Cancel</button>
    </span>
  );
}

const KIND: Record<WorkspaceSource["kind"], string> = { paper: "Paper", report: "Report", trial: "Trial registry", document: "Document", data: "Data", note: "Notes", web: "Web page", scripture: "Scripture" };

export function WorkspacePanel({ arg, apply, highlight, find }: { arg: Argument; apply: Apply; highlight?: string | null; find?: { want: string; n: number } | null }) {
  const [adding, setAdding] = useState<"find" | "paper" | "note" | "bible" | null>(null);
  useScriptureRefresh(arg, apply);
  const [findWant, setFindWant] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!find) return;
    setFindWant(find.want);
    setAdding("find");
    setTimeout(() => document.getElementById("ws-h")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [find]);
  const [note, setNote] = useState({ text: "", from: "" });
  const live = activeFacts(arg);
  const sources = (arg.sources ?? []).filter((s) => s.status === "active");
  const discardedSources = (arg.sources ?? []).filter((s) => s.status === "discarded");
  const discardedFacts = (arg.facts ?? []).filter((f) => f.status === "discarded" && !discardedSources.some((s) => s.id === f.sourceId));
  const usedIn = (id: string) => arg.points.map((p, i) => (p.evidence.some((e) => e.factId === id) ? i + 1 : 0)).filter(Boolean);

  function link(f: Fact, pointId: string) {
    const p = arg.points.find((x) => x.id === pointId);
    if (!p || p.evidence.some((e) => e.factId === f.id)) return;
    apply([{ kind: "point.put", point: { ...p, evidence: [...p.evidence, evidenceFromFact(arg, f)] } }], `Used ${f.id} as evidence`);
  }

  return (
    <section className="workspace-panel" aria-labelledby="ws-h">
      <div className="panel-head">
        <h2 id="ws-h">Sources and facts</h2>
        <span className="small muted">{sources.length} {sources.length === 1 ? "source" : "sources"} · {live.length} {live.length === 1 ? "fact" : "facts"}</span>
      </div>
      <div className="row">
        <button className="small primary" onClick={() => setAdding(adding === "find" ? null : "find")} aria-expanded={adding === "find"}>Find sources</button>
        <button className="small" onClick={() => setAdding(adding === "paper" ? null : "paper")} aria-expanded={adding === "paper"}>Upload a PDF</button>
        <button className="small" onClick={() => setAdding(adding === "note" ? null : "note")} aria-expanded={adding === "note"}>Add a fact</button>
        <button className="small" onClick={() => setAdding(adding === "bible" ? null : "bible")} aria-expanded={adding === "bible"}>Add a Bible passage</button>
      </div>
      {adding === "find" && <FindSources key={findWant} arg={arg} apply={apply} initial={findWant} onDone={() => { setAdding(null); setFindWant(undefined); }} />}
      {adding === "bible" && <BiblePanel host={workspaceHost(arg, apply)} onDone={() => setAdding(null)} />}
      {adding === "paper" && <AddPaper arg={arg} apply={apply} onDone={() => setAdding(null)} />}
      {adding === "note" && (
        <div className="add-box stack" style={{ gap: 8 }}>
          <label>Fact<textarea rows={2} value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} placeholder="Something you know, with its numbers" /></label>
          <label>Where it comes from<input value={note.from} onChange={(e) => setNote({ ...note, from: e.target.value })} placeholder="A report, a meeting, a person (optional)" /></label>
          <p className="small muted" style={{ margin: 0 }}>Facts you type are marked unchecked: the app can't verify them against a source.</p>
          <div className="row">
            <button className="small primary" disabled={!note.text.trim()} onClick={() => { apply(noteBodies(arg, note.text.trim(), note.from).bodies, "Added a fact"); setNote({ text: "", from: "" }); setAdding(null); }}>Add fact</button>
            <button className="small ghost" onClick={() => setAdding(null)}>Cancel</button>
          </div>
        </div>
      )}
      {sources.length === 0 && !adding && <p className="small muted">No sources yet. Find sources in scientific and government databases, upload a PDF, or add a fact you know.</p>}
      {sources.map((s) => {
        const facts = live.filter((f) => f.sourceId === s.id);
        return (
          <details key={s.id} className="ws-source" open={sources.length <= 3 || facts.some((f) => f.id === highlight)}>
            <summary>
              <span className="id-chip">{s.id}</span>
              <span className="ws-title">{s.short}</span>
              <span className="pill">{KIND[s.kind]}</span>
              {s.origin && <span className={s.origin === "discovered" ? "pill navy" : "pill"}>{s.origin === "discovered" ? "Discovered" : "Yours"}</span>}
              <span className="small muted">{facts.length} {facts.length === 1 ? "fact" : "facts"}</span>
            </summary>
            <div className="ws-body">
              <p className="small muted" style={{ margin: 0 }}>{s.citation}{s.design ? ` · ${s.design}` : ""}{s.sample ? ` · ${s.sample}` : ""}{s.access ? ` · read: ${s.access}` : ""}{s.url ? <> · <a href={s.url} target="_blank" rel="noopener noreferrer">record</a></> : null}</p>
              <ul className="ws-facts">
                {facts.map((f) => (
                  <li key={f.id} id={`fact-${f.id}`} className={f.id === highlight ? "hl" : undefined}>
                    <div className="row" style={{ alignItems: "baseline" }}>
                      <span className="id-chip">{f.id}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>{f.text}</span>
                    </div>
                    {f.quote && <span className="quote-line">“{f.quote}”{f.page ? <span className="muted"> {locate(s, f.page)}</span> : null}</span>}
                    <div className="row small">
                      <span className={f.checked ? "pill ok" : "pill"}>{f.checked ? "Checked against the source" : "Unchecked"}</span>
                      {f.kind === "limitation" && <span className="pill warn">Limitation</span>}
                      {usedIn(f.id).length > 0 && <span className="muted">Used in point {usedIn(f.id).join(", ")}</span>}
                      <span className="spacer" />
                      {arg.points.length > 0 && (
                        <select aria-label={`Use ${f.id} in a point`} value="" onChange={(e) => e.target.value && link(f, e.target.value)} className="use-in">
                          <option value="">Use in…</option>
                          {arg.points.map((p, i) => <option key={p.id} value={p.id}>Point {i + 1}</option>)}
                        </select>
                      )}
                      <DiscardButton label={`Discard fact ${f.id}`} onDiscard={(reason) => apply(discardBodies(arg, { factId: f.id }, reason), `Discarded ${f.id}`)} />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="row">
                <span className="spacer" />
                <DiscardButton label={`Discard source ${s.id} and its facts`} onDiscard={(reason) => apply(discardBodies(arg, { sourceId: s.id }, reason), `Discarded ${s.id}`)} />
                <span className="small muted">the whole source</span>
              </div>
            </div>
          </details>
        );
      })}
      {(discardedSources.length > 0 || discardedFacts.length > 0) && (
        <details className="ws-discarded">
          <summary className="small">Discarded ({discardedSources.length + discardedFacts.length}): not used, not sent to Claude</summary>
          <ul className="ws-facts">
            {discardedSources.map((s) => (
              <li key={s.id}>
                <div className="row"><span className="id-chip">{s.id}</span><s style={{ flex: 1 }}>{s.short}</s><button className="small ghost" onClick={() => apply(restoreBodies(arg, { sourceId: s.id }), `Restored ${s.id}`)}>Restore</button></div>
                <span className="small muted">Reason: {s.discardReason}</span>
              </li>
            ))}
            {discardedFacts.map((f) => (
              <li key={f.id}>
                <div className="row"><span className="id-chip">{f.id}</span><s style={{ flex: 1 }}>{f.text}</s><button className="small ghost" onClick={() => apply(restoreBodies(arg, { factId: f.id }), `Restored ${f.id}`)}>Restore</button></div>
                <span className="small muted">Reason: {f.discardReason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
