"use client";
/** Add a research paper from a PDF: text read in the browser, then read and checked (or sentences picked). */
import { useState } from "react";
import { paperPages } from "@/evidence/text";
import type { ArgOpBody, Argument } from "@/model/argument";
import { ReadAndPick, type SourceDoc } from "./ReadAndPick";

export function AddPaper({ arg, apply, onDone }: { arg: Argument; apply: (b: ArgOpBody[], reason: string) => void; onDone: () => void }) {
  const [doc, setDoc] = useState<SourceDoc | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

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

  return (
    <div className="add-box stack" style={{ gap: 10 }}>
      <label>
        Research paper or report (PDF)
        <input type="file" accept="application/pdf,.pdf" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
      </label>
      {status && <p className="small" role="status">{status}</p>}
      {error && <p className="small error" role="alert">{error}</p>}
      {doc ? <ReadAndPick arg={arg} apply={apply} doc={doc} onDone={onDone} /> : <button className="small ghost" onClick={onDone} style={{ alignSelf: "flex-start" }}>Cancel</button>}
    </div>
  );
}
