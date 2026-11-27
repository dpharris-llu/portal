"use client";
/**
 * F-006: import a PPTX into the deck model, then show the import report:
 * what converted, what did not, and which slides need review.
 * The file is read in the browser; it is not uploaded anywhere.
 */
import { useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { importPptx, type ImportReport } from "@/import/pptx";
import { applyOp, makeOp, type OpBody, type Operation } from "@/model/ops";
import { emptyDeck } from "@/model/factory";
import type { Author } from "@/model/types";
import { currentAuthorId, getRepo } from "@/lib/repo";
import { putAsset } from "@/lib/assets";

const MAX_BYTES = 200 * 1024 * 1024;

export default function ImportPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ deckId: string; report: ImportReport } | null>(null);

  async function onFile(file: File) {
    setError("");
    setResult(null);
    if (file.size > MAX_BYTES) return setError("That file is over 200 MB.");
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // Let the "Importing…" state paint before the synchronous parse.
      await new Promise((r) => setTimeout(r, 0));
      const res = importPptx(bytes, file.name);
      for (const a of res.assets) await putAsset(a.id, new Blob([a.bytes as BlobPart], { type: a.mime }));

      const repo = getRepo();
      const me: Author = { kind: "human", id: await currentAuthorId() };
      const reason = `Imported from ${file.name}`;
      let deck = emptyDeck({}, await repo.tenantId());
      const bodies: OpBody[] = [
        { kind: "deck.setMeta", patch: { title: res.title, timeLimitMin: Math.max(5, res.narrative.length * 2) } },
        ...res.narrative.map((slide, index) => ({ kind: "slide.insert" as const, slide, section: "narrative" as const, index })),
        ...res.backup.map((slide, index) => ({ kind: "slide.insert" as const, slide, section: "backup" as const, index })),
      ];
      const log: Operation[] = bodies.map((b) => makeOp(b, me, reason));
      for (const op of log) deck = applyOp(deck, op);
      await repo.save(deck, log, true);
      setResult({ deckId: deck.id, report: res.report });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const r = result?.report;
  return (
    <>
      <TopBar />
      <main className="narrow stack">
        <h1>Import a PowerPoint file</h1>
        <p className="muted">
          Text, bullets, tables, images, bar and line charts, and speaker notes are converted. Everything else is listed below and
          flagged on its slide. Hidden slides become backup slides. The file stays in your browser.
        </p>
        <label>
          PPTX file
          <input
            type="file"
            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </label>
        {busy && <p role="status">Importing…</p>}
        {error && <p role="alert" className="error">{error}</p>}

        {r && result && (
          <section className="stack" aria-labelledby="report-h">
            <div className="row">
              <h2 id="report-h" style={{ margin: 0 }}>Import report</h2>
              <span className="spacer" />
              <Link href={`/decks/${result.deckId}`}><button className="primary">Open deck</button></Link>
            </div>
            <div className="report-stats">
              <div><strong>{r.score}</strong><span>quality score</span></div>
              <div><strong>{r.slideCount}</strong><span>slides{r.hiddenCount ? ` (${r.hiddenCount} hidden → backup)` : ""}</span></div>
              <div><strong>{r.cleanSlides}</strong><span>need no review</span></div>
              <div><strong>{r.unconverted.length}</strong><span>items not converted</span></div>
            </div>
            <p className="small">
              Converted: {Object.entries(r.converted).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing"}.
              {r.imagesMissingAlt > 0 && ` ${r.imagesMissingAlt} images have no alt text.`}
              {r.animationsDropped > 0 && ` Animations on ${r.animationsDropped} slides were dropped.`}
              {r.decorativeDropped > 0 && ` ${r.decorativeDropped} empty shapes and lines were dropped.`} The original theme was replaced by the LLU theme.
            </p>
            <table className="b-table report-table">
              <thead>
                <tr><th scope="col">#</th><th scope="col">Claim</th><th scope="col">Review</th></tr>
              </thead>
              <tbody>
                {r.slides.map((s) => (
                  <tr key={s.number}>
                    <td>{s.number}{s.hidden ? " (backup)" : ""}</td>
                    <td>{s.claim || <em className="muted">none</em>}</td>
                    <td className="small">
                      {[
                        s.claimSource === "inferred" ? "Claim inferred from text" : s.claimSource === "none" ? "No claim" : "",
                        ...s.unconverted.map((u) => `Not converted: ${u}`),
                      ].filter(Boolean).join("; ") || "OK"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </>
  );
}
