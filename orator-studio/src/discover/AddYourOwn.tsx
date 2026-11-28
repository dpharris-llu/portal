"use client";
/**
 * Add your own evidence to the Body of Knowledge (F-130): a PDF (read and
 * checked, or sentences picked), something you know firsthand (a fact whose
 * source is you, unchecked), or Scripture (looked up, found by theme or words,
 * or The Passion Translation typed by you).
 */
import { useMemo, useState } from "react";
import { paperPages } from "@/evidence/text";
import { knowledge } from "@/knowledge/client";
import type { Source } from "@/knowledge/types";
import { BiblePanel, type KeptPassage, type ScriptureHost } from "@/components/research/BiblePanel";
import { ReadSource, type SourceDoc } from "./ReadSource";
import { LinkToTopics } from "./LinkToTopics";

/** A Bible passage as a Scripture source with the passage as its one fact. */
export async function keepPassage(p: KeptPassage) {
  const short = `${p.reference} (${p.version})`;
  return knowledge().keepSource(
    {
      kind: "scripture",
      title: short,
      short,
      citation: `${short}. ${p.copyright}`.trim(),
      origin: "yours",
      access: p.enteredByAuthor ? "typed" : "record",
      ids: { reference: p.reference, version: p.version },
      ...(p.enteredByAuthor ? {} : { fetched_at: new Date().toISOString(), url: "https://api.bible" }),
    },
    [{ kind: "scripture", text: `${short}${p.enteredByAuthor ? ", a paraphrase entered by the author" : ""}: “${p.text}”`, quote: p.text, checked: !p.enteredByAuthor }],
  );
}

export function AddYourOwn({ sources, onKept }: { sources: Source[]; onKept: (s: Source) => void }) {
  const k = knowledge();
  const [mode, setMode] = useState<"pdf" | "know" | "bible" | null>(null);
  const [doc, setDoc] = useState<SourceDoc | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [fact, setFact] = useState({ text: "", from: "" });
  const [justKept, setJustKept] = useState<Source | null>(null);

  const host: ScriptureHost = useMemo(() => {
    const scripture = sources.filter((s) => s.kind === "scripture" && s.status === "active");
    return {
      kept: new Set(scripture.map((s) => s.short)),
      onKeep: async (p) => {
        try {
          const { source } = await keepPassage(p);
          onKept(source);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
      context: { topic: "", message: "", already: scripture.map((s) => s.ids.reference ?? s.short) },
    };
  }, [sources, onKept]);

  async function pick(f: File) {
    setError("");
    setDoc(null);
    setStatus("Reading the PDF…");
    try {
      const { readPdf } = await import("@/documents/pdf");
      setDoc({ name: f.name, pages: paperPages(await readPdf(new Uint8Array(await f.arrayBuffer()))) });
    } catch {
      setError("This file couldn't be read. It needs to be a PDF with selectable text.");
    } finally {
      setStatus("");
    }
  }

  async function keepKnowledge() {
    setError("");
    try {
      const from = fact.from.trim() || "My own knowledge";
      const existing = sources.find((s) => s.kind === "own_knowledge" && s.status === "active" && s.title === from);
      let source: Source;
      if (existing) {
        await k.addFacts(existing.id, [{ kind: "note", text: fact.text.trim(), checked: false }]);
        source = existing;
      } else {
        source = (await k.keepSource({ kind: "own_knowledge", title: from, short: from, citation: from, origin: "yours", access: "typed" }, [{ kind: "note", text: fact.text.trim(), checked: false }])).source;
      }
      onKept(source);
      setFact({ text: "", from: "" });
      setMode(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (justKept) return <LinkToTopics source={justKept} onDone={() => setJustKept(null)} />;

  return (
    <section className="stack" style={{ gap: 12 }} aria-label="Add your own">
      <div className="row">
        <button className={mode === "pdf" ? "small primary" : "small"} onClick={() => setMode(mode === "pdf" ? null : "pdf")}>Upload a PDF</button>
        <button className={mode === "know" ? "small primary" : "small"} onClick={() => setMode(mode === "know" ? null : "know")}>Something you know</button>
        <button className={mode === "bible" ? "small primary" : "small"} onClick={() => setMode(mode === "bible" ? null : "bible")}>Scripture</button>
      </div>
      {mode === "pdf" && (
        <div className="add-box stack" style={{ gap: 10 }}>
          <label>
            A paper, report or your own writing (PDF)
            <input type="file" accept="application/pdf,.pdf" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
          </label>
          {status && <p className="small" role="status">{status}</p>}
          {doc && (
            <ReadSource
              doc={doc}
              onCancel={() => setDoc(null)}
              onKeep={async (source, facts) => {
                try {
                  const { source: s } = await k.keepSource(source, facts);
                  onKept(s);
                  setDoc(null);
                  setMode(null);
                  setJustKept(s);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              }}
            />
          )}
        </div>
      )}
      {mode === "know" && (
        <div className="add-box stack" style={{ gap: 8 }}>
          <label>
            What you know
            <textarea rows={2} value={fact.text} onChange={(e) => setFact({ ...fact, text: e.target.value })} placeholder="Our clinic saw 40% fewer missed visits after reminder calls began" />
          </label>
          <label>
            Where it comes from
            <input value={fact.from} onChange={(e) => setFact({ ...fact, from: e.target.value })} placeholder="A report, a meeting, your own practice (optional)" />
          </label>
          <p className="small muted" style={{ margin: 0 }}>Kept as a fact whose source is you, marked unchecked: the app can&apos;t verify it against a document.</p>
          <div className="row">
            <button className="small primary" disabled={fact.text.trim().length < 3} onClick={keepKnowledge}>Keep</button>
            <button className="small ghost" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </div>
      )}
      {mode === "bible" && <BiblePanel host={host} onDone={() => setMode(null)} />}
      {error && <p className="small error" role="alert">{error}</p>}
    </section>
  );
}

