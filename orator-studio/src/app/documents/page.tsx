"use client";
/**
 * Start from documents: read figures from a set of PDFs (for example, monthly
 * reports), review and confirm them, then draft a deck whose every number is
 * sourced. Files are read in this browser and never uploaded.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { figuresInDocument, parseValue } from "@/documents/extract";
import { alignSeries, orderDocuments, periodFromName, type CandidateRow, type ScannedDocument } from "@/documents/series";
import { draftFromSource, formatFigure } from "@/documents/build";
import { analyze, type Finding } from "@/documents/analyze";
import { requestFromSource, verifyAnalysis, type CheckedAnalysis } from "@/ai/analysis";
import { askClaude, claudeAvailable, ClaudeError, type Transport } from "@/ai/analysis-client";
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

const KIND_LABEL: Record<string, string> = {
  volatile: "Swings",
  trend: "Trend",
  cumulative: "Rising",
  concentration: "Concentrated",
  summary: "Summary",
  reconciles: "Check",
  carries: "Check",
  matches: "Match",
  share: "Share",
  together: "Together",
};

export default function DocumentsPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  /** Findings the author unticked; kept out of the deck. */
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [goal, setGoal] = useState("");
  const [transport, setTransport] = useState<Transport | null | undefined>(undefined);
  const [claude, setClaude] = useState<
    | { status: "idle" }
    | { status: "thinking"; chars: number }
    | { status: "error"; message: string }
    | { status: "done"; via: Transport; result: CheckedAnalysis; request: string }
  >({ status: "idle" });
  const stop = useRef<AbortController | null>(null);

  useEffect(() => {
    claudeAvailable().then(setTransport);
  }, []);
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
  const analysis = preview ? analyze(preview) : null;
  const checks = analysis ? analysis.findings.filter((f) => f.kind === "reconciles" || f.kind === "carries") : [];
  const patterns = analysis ? analysis.findings.filter((f) => f.kind !== "summary" && f.kind !== "reconciles" && f.kind !== "carries") : [];
  const request = preview ? requestFromSource(preview, goal, checks.map((f) => f.text)) : null;
  // Claude's answer only counts for the rows it was asked about.
  const fresh = claude.status === "done" && request && claude.request === JSON.stringify({ ...request, goal: "" });

  async function runClaude() {
    if (!request) return;
    stop.current?.abort();
    const ctl = new AbortController();
    stop.current = ctl;
    setClaude({ status: "thinking", chars: 0 });
    try {
      const { analysis: a, via } = await askClaude(request, { signal: ctl.signal, onProgress: (chars) => setClaude({ status: "thinking", chars }) });
      setClaude({ status: "done", via, result: verifyAnalysis(request, a), request: JSON.stringify({ ...request, goal: "" }) });
      setDropped(new Set());
    } catch (e) {
      const err = e instanceof ClaudeError ? e : new ClaudeError("Claude couldn't be reached. Try again.", "upstream_error");
      setClaude(err.code === "cancelled" ? { status: "idle" } : { status: "error", message: err.message });
    }
  }

  /** Claude's checked insights as findings for the deck (only verified ones, and only those still ticked). */
  function claudeFindings(src: DataSource): Finding[] {
    if (!fresh || claude.status !== "done") return [];
    const idOf = (label: string) => src.series.find((x) => x.label.toLowerCase() === label.toLowerCase())?.id;
    return claude.result.insights
      .map((ins, i) => ({ ins, id: `ai-${i}` }))
      .filter(({ ins, id }) => ins.verified && !dropped.has(id))
      .map(({ ins, id }, k) => ({
        id,
        kind: "insight" as const,
        seriesIds: ins.rows.map(idOf).filter((x): x is string => Boolean(x)),
        text: /[.!?]$/.test(ins.headline) ? `${ins.headline} ${ins.detail}` : `${ins.headline}. ${ins.detail}`,
        claim: ins.headline.replace(/[.]$/, ""),
        suggestion: ins.suggestion,
        score: 2 - k * 0.01,
        ai: { via: claude.via },
      }));
  }

  async function createDeck() {
    setBusy(true);
    try {
      const repo = getRepo();
      const me: Author = { kind: "human", id: await currentAuthorId() };
      const now = new Date().toISOString();
      const source = buildSource(now, me.id);
      const rules = analyze(source).findings.filter((f) => !dropped.has(f.id));
      const fromClaude = claudeFindings(source);
      // With Claude's analysis, the rule patterns step back; the add-up checks always stay.
      const findings = fromClaude.length ? [...fromClaude, ...rules.filter((f) => f.kind === "summary" || f.kind === "reconciles" || f.kind === "carries")] : rules;
      const steps =
        fresh && claude.status === "done"
          ? claude.result.nextSteps.map((st, i) => ({ st, id: `ai-step-${i}` })).filter(({ st, id }) => st.verified && !dropped.has(id)).map(({ st }) => ({ text: st.text, ai: true }))
          : [];
      const draft = draftFromSource(source, findings, steps);
      const bodies: OpBody[] = [
        { kind: "deck.setMeta", patch: { title: source.name, goal: "", timeLimitMin: Math.max(5, draft.narrative.length * 2) } },
        { kind: "source.put", source },
        ...draft.narrative.map((slide, index) => ({ kind: "slide.insert" as const, slide, section: "narrative" as const, index })),
        ...draft.backup.map((slide, index) => ({ kind: "slide.insert" as const, slide, section: "backup" as const, index })),
      ];
      let deck = emptyDeck({}, await repo.tenantId());
      const log: Operation[] = bodies.map((b) => makeOp(b, me, "Created from documents"));
      for (const op of log) deck = applyOp(deck, op);
      await repo.save(deck, log, true);
      router.push(`/decks/${deck.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  function toggle(id: string, keep: boolean) {
    setDropped((d) => {
      const next = new Set(d);
      if (keep) next.delete(id);
      else next.add(id);
      return next;
    });
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

        {confirmed.length > 0 && (
          <section className="stack" aria-labelledby="analysis-h">
            <h2 id="analysis-h" style={{ margin: 0, fontSize: 18 }}>Analysis</h2>
            <label>
              What is this deck for?
              <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="For example: decide on a monthly spending target" />
            </label>
            {transport === undefined && <p className="small muted">Checking for Claude…</p>}
            {transport && (
              <div className="row">
                <button className="primary" onClick={runClaude} disabled={claude.status === "thinking"}>
                  {claude.status === "done" ? "Ask Claude again" : "Ask Claude to analyze"}
                </button>
                {claude.status === "thinking" && <button onClick={() => stop.current?.abort()}>Stop</button>}
                <span className="small muted" style={{ flex: 1, minWidth: 220 }}>
                  Sends the labels and figures of the {confirmed.length} confirmed {confirmed.length === 1 ? "row" : "rows"} to Claude
                  {transport === "claude.ai" ? " on your Claude account" : " through this server's Claude API key"}. The PDFs stay here.
                </span>
              </div>
            )}
            {transport === null && (
              <p className="small notice">
                Claude isn&apos;t connected here. Open this page in claude.ai to use your Claude account, or set ANTHROPIC_API_KEY on the server. Until then, the computed patterns below stand in.
              </p>
            )}
            {claude.status === "thinking" && (
              <p className="small" role="status">{claude.chars ? `Claude is writing (${claude.chars} characters)…` : "Claude is thinking. This can take a minute."}</p>
            )}
            {claude.status === "error" && <p className="small error" role="alert">{claude.message}</p>}
            {claude.status === "done" && !fresh && (
              <p className="small notice">The confirmed rows changed since Claude&apos;s analysis. Ask again to use it.</p>
            )}

            {claude.status === "done" && fresh && (
              <>
                <h3 className="sub-h">Claude&apos;s analysis</h3>
                <ul className="findings">
                  {claude.result.insights.map((ins, i) => {
                    const id = `ai-${i}`;
                    return (
                      <li key={id} className={ins.verified ? undefined : "unverified"}>
                        <label className="inline">
                          <input type="checkbox" disabled={!ins.verified} checked={ins.verified && !dropped.has(id)} onChange={(e) => toggle(id, e.target.checked)} />
                          <span>
                            <span className="finding-kind ai">Claude</span> <strong>{ins.headline}</strong> {ins.detail}
                            {ins.suggestion && <span className="suggestion">Suggestion: {ins.suggestion}</span>}
                            <span className={ins.verified ? "verify ok" : "verify bad"}>
                              {ins.verified
                                ? ins.checkedCount === 0
                                  ? "No numbers to check"
                                  : ins.checkedCount === 1
                                    ? "Its number was checked against your figures"
                                    : `All ${ins.checkedCount} numbers checked against your figures`
                                : `Left out: ${ins.problems.join("; ")}`}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {claude.result.nextSteps.length > 0 && (
                  <>
                    <h3 className="sub-h">Suggested next steps</h3>
                    <ul className="findings">
                      {claude.result.nextSteps.map((st, i) => {
                        const id = `ai-step-${i}`;
                        return (
                          <li key={id} className={st.verified ? undefined : "unverified"}>
                            <label className="inline">
                              <input type="checkbox" disabled={!st.verified} checked={st.verified && !dropped.has(id)} onChange={(e) => toggle(id, e.target.checked)} />
                              <span>
                                {st.text}
                                {!st.verified && <span className="verify bad">Left out: {st.problems.join("; ")}</span>}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </>
            )}

            {checks.length > 0 && (
              <>
                <h3 className="sub-h">Checks on the figures</h3>
                <ul className="findings">
                  {checks.map((f) => (
                    <li key={f.id}>
                      <span className="finding-kind check">Check</span> {f.text}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {!(claude.status === "done" && fresh) && patterns.length > 0 && (
              <>
                <h3 className="sub-h">Computed patterns{transport ? " (until you ask Claude)" : ""}</h3>
                <ul className="findings">
                  {patterns.map((f) => (
                    <li key={f.id}>
                      <label className="inline">
                        <input type="checkbox" checked={!dropped.has(f.id)} onChange={(e) => toggle(f.id, e.target.checked)} />
                        <span>
                          <span className="finding-kind">{KIND_LABEL[f.kind]}</span> {f.text}
                          {f.suggestion && <span className="suggestion">Suggestion: {f.suggestion}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

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
