"use client";
/**
 * Start from documents: read figures from a set of PDFs (for example, monthly
 * reports), review and confirm them, then draft a deck whose every number is
 * sourced. Files are read in this browser and never uploaded.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { pointsFromFigures, saveNewArgument } from "@/research/link";
import { figuresInDocument, parseValue } from "@/documents/extract";
import { alignSeries, orderDocuments, periodFromName, type CandidateRow, type ScannedDocument } from "@/documents/series";
import { draftFromSource, formatFigure } from "@/documents/build";
import { useAnalysis } from "@/documents/useAnalysis";
import { applyOp, makeOp, type OpBody, type Operation } from "@/model/ops";
import { emptyDeck } from "@/model/factory";
import { newId } from "@/model/ids";
import type { Author, DataSource, SourceFigure, SourceSeries } from "@/model/types";
import { currentAuthorId, getRepo } from "@/lib/repo";

type Doc = ScannedDocument & { status: "reading" | "ready" | "error"; error?: string };

interface RowEdit {
  label?: string;
  /** Typed values by document id; "" means "no figure". */
  cells?: Record<string, string>;
  confirmed?: boolean;
}

const MAX_FILE_MB = 50;


export default function DocumentsPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready = docs.filter((d) => d.status === "ready");
  const rows = useMemo(() => alignSeries(ready), [ready]);
  const common = ready.length > 1 ? Math.ceil(ready.length / 2) : 1;
  const visible = rows.filter(
    (r) => (showAll || r.found >= common || edits[r.key]?.confirmed) && (!query.trim() || (edits[r.key]?.label ?? r.label).toLowerCase().includes(query.trim().toLowerCase())),
  );
  const confirmed = rows.filter((r) => edits[r.key]?.confirmed);

  async function addFiles(files: FileList) {
    setError("");
    const added: Doc[] = [...files].map((f) => ({
      id: newId("doc"),
      name: f.name,
      period: periodFromName(f.name)?.label ?? f.name.replace(/\.pdf$/i, ""),
      pages: 0,
      figures: [],
      status: f.size > MAX_FILE_MB * 1024 * 1024 ? "error" : "reading",
      error: f.size > MAX_FILE_MB * 1024 * 1024 ? `Over ${MAX_FILE_MB} MB.` : undefined,
    }));
    setDocs((d) => orderDocuments([...d, ...added]));
    const { readPdf, NoTextError } = await import("@/documents/pdf");
    for (const [i, f] of [...files].entries()) {
      const doc = added[i];
      if (doc.status === "error") continue;
      try {
        const pages = await readPdf(new Uint8Array(await f.arrayBuffer()));
        const figures = figuresInDocument(pages);
        setDocs((d) => d.map((x) => (x.id === doc.id ? { ...x, pages: pages.length, figures, status: "ready" } : x)));
      } catch (e) {
        const message = e instanceof NoTextError ? e.message : "This file could not be read as a PDF.";
        setDocs((d) => d.map((x) => (x.id === doc.id ? { ...x, status: "error", error: message } : x)));
      }
    }
  }

  const edit = (key: string, patch: RowEdit) => setEdits((e) => ({ ...e, [key]: { ...e[key], ...patch } }));

  /** The text in a cell: what the author typed, or the figure as printed. */
  const cellText = (r: CandidateRow, di: number) => {
    const typed = edits[r.key]?.cells?.[ready[di].id];
    return typed !== undefined ? typed : r.cells[di]?.raw ?? "";
  };
  const cellValid = (text: string) => text.trim() === "" || parseValue(text.replace(/\s/g, "")) !== null;
  const rowValid = (r: CandidateRow) => ready.every((_, di) => cellValid(cellText(r, di)));

  function figureFor(r: CandidateRow, di: number): SourceFigure {
    const typed = edits[r.key]?.cells?.[ready[di].id];
    const cell = r.cells[di];
    if (typed === undefined || (cell && typed.trim() === cell.raw)) {
      return cell ? { value: cell.value, raw: cell.raw, page: cell.page } : { value: null };
    }
    if (typed.trim() === "") return { value: null };
    return { value: parseValue(typed.replace(/\s/g, ""))!.value, raw: typed.trim(), entered: true };
  }

  /** The confirmed rows as a data source. Row ids come from their labels, so findings keep their ids while you edit. */
  function buildSource(now: string, by: string): DataSource {
    const span = ready.length > 1 ? `${ready[0].period} to ${ready[ready.length - 1].period}` : ready[0]?.period ?? "";
    return {
      id: newId("src"),
      name: name.trim() || `Figures, ${span}`,
      kind: "documents",
      createdAt: now,
      documents: ready.map((d) => ({ id: d.id, name: d.name, period: d.period, pages: d.pages })),
      series: confirmed.map(
        (r): SourceSeries => ({
          id: "ser-" + r.key.replace(/[^a-z0-9]+/g, "-"),
          label: (edits[r.key]?.label ?? r.label).trim() || r.label,
          unit: r.unit,
          figures: ready.map((_, di) => figureFor(r, di)),
          confirmedAt: now,
          confirmedBy: by,
        }),
      ),
    };
  }

  const preview = confirmed.length ? buildSource("", "") : null;
  const { goal, panel, finalize } = useAnalysis(preview, "The PDFs stay here.");


  async function createDeck() {
    setBusy(true);
    try {
      const repo = getRepo();
      const me: Author = { kind: "human", id: await currentAuthorId() };
      const now = new Date().toISOString();
      const { source, draft, argument: figArg } = finalize(buildSource(now, me.id));
      const tenantId = await repo.tenantId();
      const linked = figArg
        ? await saveNewArgument({ tenantId, me, ai: { kind: "ai", id: "claude", via: figArg.via }, origin: "documents", ...pointsFromFigures(source, figArg), fields: { ...pointsFromFigures(source, figArg).fields, title: source.name, purpose: goal }, reason: "Created from documents" })
        : null;
      const bodies: OpBody[] = [
        { kind: "deck.setMeta", patch: { title: source.name, goal, ...(linked ? { argumentId: linked.id, argumentVersion: linked.version } : {}), timeLimitMin: Math.max(5, draft.narrative.length * 2) } },
        { kind: "source.put", source },
        ...draft.narrative.map((slide, index) => ({ kind: "slide.insert" as const, slide, section: "narrative" as const, index })),
        ...draft.backup.map((slide, index) => ({ kind: "slide.insert" as const, slide, section: "backup" as const, index })),
      ];
      let deck = emptyDeck({}, tenantId);
      const log: Operation[] = bodies.map((b) => makeOp(b, me, "Created from documents"));
      for (const op of log) deck = applyOp(deck, op);
      await repo.save(deck, log, true);
      router.push(`/decks/${deck.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  function move(i: number, d: number) {
    setDocs((list) => {
      const next = [...list];
      const j = i + d;
      if (j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    <>
      <TopBar />
      <main className="wide stack">
        <h1 style={{ margin: 0 }}>Start from documents</h1>
        <p className="muted" style={{ margin: 0 }}>
          Add a set of PDFs, such as monthly reports or statements. OratorStudio finds labeled figures and lines them up across the documents.
          Check them, confirm the ones you want, and it drafts a deck in which every number shows where it came from. Files are read in this
          browser and never uploaded. Scanned PDFs without a text layer are not supported yet.
        </p>
        <label>
          PDF files
          <input type="file" accept="application/pdf,.pdf" multiple onChange={(e) => e.target.files?.length && addFiles(e.target.files)} />
        </label>

        {docs.length > 0 && (
          <section className="stack" aria-labelledby="docs-h">
            <h2 id="docs-h" style={{ margin: 0, fontSize: 18 }}>Documents, in column order</h2>
            <ol className="doc-list">
              {docs.map((d, i) => (
                <li key={d.id}>
                  <input
                    aria-label={`Column heading for ${d.name}`}
                    value={d.period}
                    onChange={(e) => setDocs((list) => list.map((x) => (x.id === d.id ? { ...x, period: e.target.value } : x)))}
                    style={{ width: "9em" }}
                  />
                  <span className="small" style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{d.name}</span>
                  <span className={`small ${d.status === "error" ? "error" : "muted"}`} role="status">
                    {d.status === "reading" ? "Reading…" : d.status === "error" ? d.error : `${d.pages} pages, ${d.figures.length} figures`}
                  </span>
                  <button className="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${d.name} earlier`}>↑</button>
                  <button className="ghost" onClick={() => move(i, 1)} disabled={i === docs.length - 1} aria-label={`Move ${d.name} later`}>↓</button>
                  <button className="ghost danger" onClick={() => setDocs((list) => list.filter((x) => x.id !== d.id))} aria-label={`Remove ${d.name}`}>Remove</button>
                </li>
              ))}
            </ol>
          </section>
        )}

        {ready.length > 0 && (
          <section className="stack" aria-labelledby="figs-h">
            <div className="row">
              <h2 id="figs-h" style={{ margin: 0, fontSize: 18 }}>Figures</h2>
              <span className="spacer" />
              <input aria-label="Filter figures by label" placeholder="Filter by label" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: "14em" }} />
              <label className="inline small">
                <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                Show all {rows.length} (not only those in {common}+ documents)
              </label>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              Check each row against the documents. Type over any value, or clear it if the document has no such figure. Confirm a row to use it.
            </p>
            <div className="grid-wrap">
              <table className="fig-grid">
                <thead>
                  <tr>
                    <th scope="col">Confirm · label</th>
                    {ready.map((d) => <th key={d.id} scope="col">{d.period}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const e = edits[r.key] ?? {};
                    const label = e.label ?? r.label;
                    const valid = rowValid(r);
                    return (
                      <tr key={r.key} className={e.confirmed ? "confirmed" : undefined}>
                        <th scope="row">
                          <div className="row-head">
                            <input
                              type="checkbox"
                              checked={Boolean(e.confirmed)}
                              disabled={!valid}
                              onChange={(ev) => edit(r.key, { confirmed: ev.target.checked })}
                              aria-label={`Confirm ${label}`}
                              title={valid ? (e.confirmed ? "Confirmed" : "Confirm this row") : "Fix the highlighted values first"}
                            />
                            <input aria-label={`Label for ${r.label}`} value={label} onChange={(ev) => edit(r.key, { label: ev.target.value, confirmed: false })} />
                          </div>
                        </th>
                        {ready.map((d, di) => {
                          const cell = r.cells[di];
                          const text = cellText(r, di);
                          const typed = e.cells?.[d.id] !== undefined && text.trim() !== (cell?.raw ?? "");
                          return (
                            <td key={d.id}>
                              <input
                                className={cellValid(text) ? undefined : "invalid"}
                                aria-label={`${label}, ${d.period}`}
                                aria-invalid={!cellValid(text)}
                                value={text}
                                placeholder="-"
                                onChange={(ev) => edit(r.key, { cells: { ...e.cells, [d.id]: ev.target.value }, confirmed: false })}
                              />
                              <span className="cell-src">
                                {typed ? "typed" : cell ? `p. ${cell.page}` : "not found"}
                                {cell?.alternatives && !typed && (
                                  <span className="warn-text" title={`Also printed as ${cell.alternatives.map((v) => formatFigure(v, r.unit)).join(", ")}`}>
                                    {" "}· {cell.alternatives.length + 1} values
                                  </span>
                                )}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {visible.length === 0 && <p className="muted">No figures match.</p>}
          </section>
        )}

        {panel}

        {ready.length > 0 && (
          <section className="row create-bar">
            <label style={{ flex: 1, minWidth: 220 }}>
              Deck name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={ready.length > 1 ? `Figures, ${ready[0].period} to ${ready[ready.length - 1].period}` : "Figures"} />
            </label>
            <button className="primary" disabled={busy || confirmed.length === 0} onClick={createDeck}>
              {busy ? "Creating…" : `Draft a deck from ${confirmed.length} confirmed ${confirmed.length === 1 ? "row" : "rows"}`}
            </button>
            {error && <p role="alert" className="error">{error}</p>}
          </section>
        )}
      </main>
    </>
  );
}
