"use client";
/**
 * Turn a source's text into workspace facts (F-118, F-119). With Claude: it
 * reads the text for findings and limitations, every quote is checked against
 * the text, and the author keeps what they want. Without Claude: the author
 * ticks the sentences to keep, word for word.
 */
import { useEffect, useState } from "react";
import type { PaperPage } from "@/evidence/text";
import { paperForClaude } from "@/evidence/text";
import { formatCitation, PaperReading, readPaperPrompt, shortCitation, verifyReading, type CheckedReading } from "@/ai/evidence";
import { askClaudeFor, claudeAvailable, ClaudeError, type Transport } from "@/ai/analysis-client";
import { nextId, type ArgOpBody, type Argument, type Fact, type WorkspaceSource } from "@/model/argument";

export interface SourceDoc {
  name: string;
  pages: PaperPage[];
  labels?: Record<number, string>;
  /** Known details (from a database record); when absent, Claude's reading of the citation is used. */
  meta?: Omit<WorkspaceSource, "id" | "status" | "addedAt">;
  /** Told to Claude: "This is only the abstract", and so on. */
  context?: string;
}

const sentences = (t: string) => t.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9(“"])/).map((x) => x.trim()).filter((x) => x.length > 25);

export function ReadAndPick({ arg, apply, doc, onDone }: { arg: Argument; apply: (b: ArgOpBody[], reason: string) => void; doc: SourceDoc; onDone: () => void }) {
  const [transport, setTransport] = useState<Transport | null | undefined>(undefined);
  const [mode, setMode] = useState<"claude" | "pick" | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState<CheckedReading | null>(null);
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const where = (page: number) => doc.labels?.[page] ?? `p. ${page}`;
  // Section pages start with their heading line; it isn't part of any sentence.
  const body = (p: { page: number; text: string }) => {
    const label = doc.labels?.[p.page];
    return label && p.text.startsWith(label + "\n") ? p.text.slice(label.length + 1) : p.text;
  };

  useEffect(() => {
    claudeAvailable().then((t) => {
      setTransport(t);
      setMode(t ? "claude" : "pick");
    });
  }, []);

  useEffect(() => {
    if (mode !== "claude" || reading) return;
    let live = true;
    (async () => {
      setStatus("Claude is reading it…");
      setError("");
      try {
        const { text } = paperForClaude(doc.pages);
        const { value } = await askClaudeFor({
          prompt: readPaperPrompt(doc.name, text, doc.context),
          parse: (raw) => {
            const r = PaperReading.safeParse(raw);
            return r.success ? r.data : null;
          },
          route: "/api/evidence/read",
          payload: { fileName: doc.name, text },
          key: "value",
        });
        if (!live) return;
        const r = verifyReading(value, doc.pages);
        setReading(r);
        setKeep(new Set(r.claims.map((c, i) => (c.verified ? `c${i}` : "")).filter(Boolean)));
      } catch (e) {
        if (live) setError(e instanceof ClaudeError ? `${e.message} You can pick sentences yourself instead.` : "Claude couldn't read it. You can pick sentences yourself instead.");
      } finally {
        if (live) setStatus("");
      }
    })();
    return () => {
      live = false;
    };
  }, [mode, reading, doc]);

  const toggle = (k: string, on: boolean) =>
    setKeep((s) => {
      const n = new Set(s);
      if (on) n.add(k);
      else n.delete(k);
      return n;
    });

  function add() {
    const sid = nextId("S", arg.sources);
    const fromReading = reading && mode === "claude";
    const meta: Omit<WorkspaceSource, "id" | "status" | "addedAt"> = doc.meta
      ? { origin: "yours", ...doc.meta, design: doc.meta.design ?? reading?.design, sample: doc.meta.sample ?? reading?.sample }
      : reading
        ? { kind: "paper", origin: "yours", title: reading.citation.title, citation: formatCitation(reading.citation), short: shortCitation(reading.citation), design: reading.design, sample: reading.sample }
        : { kind: "document", origin: "yours", title: doc.name, citation: doc.name, short: doc.name };
    const bodies: ArgOpBody[] = [{ kind: "source.put", source: { ...meta, ...(doc.labels && Object.keys(doc.labels).length ? { pageLabels: doc.labels } : {}), id: sid, status: "active", addedAt: new Date().toISOString() } }];
    let facts: Fact[] = [...(arg.facts ?? [])];
    const push = (f: Omit<Fact, "id" | "sourceId" | "status">) => {
      const fact: Fact = { ...f, id: nextId("F", facts), sourceId: sid, status: "active" };
      facts = [...facts, fact];
      bodies.push({ kind: "fact.put", fact });
    };
    if (fromReading) reading!.claims.forEach((c, i) => keep.has(`c${i}`) && push({ kind: c.kind, text: c.text, quote: c.quote, page: c.page, checked: true }));
    else doc.pages.forEach((p) => sentences(body(p)).forEach((t, j) => keep.has(`p${p.page}-${j}`) && push({ kind: "finding", text: t, quote: t, page: p.page, checked: true })));
    apply(bodies, `Added a source: ${meta.short}`);
    onDone();
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row small">
        <span className="muted">How to take facts from it:</span>
        {transport && <button className={mode === "claude" ? "small primary" : "small"} onClick={() => setMode("claude")} aria-pressed={mode === "claude"}>Claude reads it</button>}
        <button className={mode === "pick" ? "small primary" : "small"} onClick={() => setMode("pick")} aria-pressed={mode === "pick"}>I'll pick sentences</button>
      </div>
      {status && <p className="small" role="status">{status}</p>}
      {error && <p className="small error" role="alert">{error}</p>}

      {mode === "claude" && reading && (
        <ul className="findings">
          {reading.claims.map((c, i) => (
            <li key={i} className={c.verified ? undefined : "unverified"}>
              <label className="inline">
                <input type="checkbox" disabled={!c.verified} checked={keep.has(`c${i}`)} onChange={(e) => toggle(`c${i}`, e.target.checked)} />
                <span className="point">
                  <span><span className={`finding-kind ${c.kind === "limitation" ? "limit" : ""}`}>{c.kind}</span> {c.text}</span>
                  <span className="quote-line">“{c.quote}” <span className="muted">{where(c.page)}</span></span>
                  <span className={c.verified ? "verify ok" : "verify bad"}>{c.verified ? "Quote found in the source" : `Can't use: ${c.problems.join("; ")}`}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {mode === "pick" && (
        <div className="pick-sentences">
          {doc.pages.map((p) => {
            const ss = sentences(body(p));
            if (!ss.length) return null;
            return (
              <details key={p.page} open={doc.pages.length <= 2}>
                <summary className="small"><strong>{where(p.page)}</strong> · {ss.length} sentences</summary>
                <ul className="findings">
                  {ss.map((t, j) => (
                    <li key={j}>
                      <label className="inline">
                        <input type="checkbox" checked={keep.has(`p${p.page}-${j}`)} onChange={(e) => toggle(`p${p.page}-${j}`, e.target.checked)} />
                        <span>{t}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
          <p className="small muted" style={{ margin: 0 }}>Each sentence you tick becomes a fact, word for word from the source.</p>
        </div>
      )}

      <div className="row">
        <button className="primary small" disabled={!keep.size} onClick={add}>Add {keep.size} fact{keep.size === 1 ? "" : "s"} to the workspace</button>
        <button className="small ghost" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
