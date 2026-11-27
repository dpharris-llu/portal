"use client";
/** Add a research paper to the workspace: read in the browser, read by Claude, every quote checked, the author picks what to keep. */
import { useState } from "react";
import { paperForClaude, paperPages, type PaperPage } from "@/evidence/text";
import { formatCitation, PaperReading, readPaperPrompt, shortCitation, verifyReading, type CheckedReading } from "@/ai/evidence";
import { askClaudeFor, ClaudeError } from "@/ai/analysis-client";
import { nextId, type ArgOpBody, type Argument, type Fact } from "@/model/argument";

export function AddPaper({ arg, apply, onDone }: { arg: Argument; apply: (b: ArgOpBody[], reason: string) => void; onDone: () => void }) {
  const [status, setStatus] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PaperPage[] | null>(null);
  const [reading, setReading] = useState<CheckedReading | null>(null);
  const [keep, setKeep] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");

  async function pick(f: File) {
    setError("");
    setReading(null);
    setFile(f);
    setStatus("Reading the PDF…");
    try {
      const { readPdf } = await import("@/documents/pdf");
      const ps = paperPages(await readPdf(new Uint8Array(await f.arrayBuffer())));
      setPages(ps);
      setStatus("Claude is reading the paper…");
      const { text } = paperForClaude(ps);
      const { value } = await askClaudeFor({
        prompt: readPaperPrompt(f.name, text),
        parse: (raw) => {
          const r = PaperReading.safeParse(raw);
          return r.success ? r.data : null;
        },
        route: "/api/evidence/read",
        payload: { fileName: f.name, text },
        key: "value",
      });
      const r = verifyReading(value, ps);
      setReading(r);
      setKeep(new Set(r.claims.map((c, i) => (c.verified ? i : -1)).filter((i) => i >= 0)));
      setStatus("");
    } catch (e) {
      setStatus("");
      setError(e instanceof ClaudeError ? e.message : "This file couldn't be read. It needs to be a PDF with selectable text.");
    }
  }

  function add() {
    if (!reading || !file) return;
    const sid = nextId("S", arg.sources);
    const bodies: ArgOpBody[] = [
      {
        kind: "source.put",
        source: { id: sid, kind: "paper", title: reading.citation.title, citation: formatCitation(reading.citation), short: shortCitation(reading.citation), design: reading.design, sample: reading.sample, status: "active", addedAt: new Date().toISOString() },
      },
    ];
    let facts: Fact[] = [...(arg.facts ?? [])];
    reading.claims.forEach((c, i) => {
      if (!keep.has(i)) return;
      const fact: Fact = { id: nextId("F", facts), sourceId: sid, kind: c.kind, text: c.text, quote: c.quote, page: c.page, checked: true, status: "active" };
      facts = [...facts, fact];
      bodies.push({ kind: "fact.put", fact });
    });
    apply(bodies, `Added a paper: ${shortCitation(reading.citation)}`);
    onDone();
  }

  return (
    <div className="add-box stack" style={{ gap: 10 }}>
      <label>
        Research paper (PDF)
        <input type="file" accept="application/pdf,.pdf" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
      </label>
      {status && <p className="small" role="status">{status}</p>}
      {error && <p className="small error" role="alert">{error}</p>}
      {reading && pages && (
        <>
          <p className="small" style={{ margin: 0 }}><strong>{shortCitation(reading.citation)}</strong>: {reading.citation.title}. {reading.design}; {reading.sample}.</p>
          {reading.citationNotes.length > 0 && <p className="small warn-text" style={{ margin: 0 }}>Check the citation: {reading.citationNotes.join("; ")}.</p>}
          <ul className="findings">
            {reading.claims.map((c, i) => (
              <li key={i} className={c.verified ? undefined : "unverified"}>
                <label className="inline">
                  <input
                    type="checkbox"
                    disabled={!c.verified}
                    checked={keep.has(i)}
                    onChange={(e) =>
                      setKeep((k) => {
                        const n = new Set(k);
                        if (e.target.checked) n.add(i);
                        else n.delete(i);
                        return n;
                      })
                    }
                  />
                  <span className="point">
                    <span><span className={`finding-kind ${c.kind === "limitation" ? "limit" : ""}`}>{c.kind}</span> {c.text}</span>
                    <span className="quote-line">“{c.quote}” <span className="muted">p. {c.page}</span></span>
                    <span className={c.verified ? "verify ok" : "verify bad"}>{c.verified ? "Quote found on the page" : `Can't use: ${c.problems.join("; ")}`}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="row">
            <button className="primary small" disabled={!keep.size} onClick={add}>Add {keep.size} fact{keep.size === 1 ? "" : "s"} to the workspace</button>
            <button className="small ghost" onClick={onDone}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
