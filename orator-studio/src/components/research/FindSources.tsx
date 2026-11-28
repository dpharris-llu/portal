"use client";
/**
 * Find sources (F-119): search named scientific and government databases, look
 * over the candidates, and add the ones you choose. Nothing is added on its own.
 */
import { useEffect, useState } from "react";
import type { ArgOpBody, Argument } from "@/model/argument";
import { PROVIDERS, type Candidate, type Provider } from "@/find/types";
import { SearchPlan, searchPlanPrompt } from "@/ai/search";
import { askClaudeFor, claudeAvailable, ClaudeError, type Transport } from "@/ai/analysis-client";
import { shortCitation } from "@/ai/evidence";
import { ReadAndPick, type SourceDoc } from "./ReadAndPick";

export async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "The search couldn't run here.");
  return json as T;
}

function citationOf(c: Candidate): string {
  const authors = c.authors.length ? c.authors.join(", ") : c.venue ?? "";
  return `${authors}${c.year ? ` (${c.year})` : ""}. ${c.title}.${c.venue && c.authors.length ? ` ${c.venue}.` : ""}${c.doi ? ` doi:${c.doi}` : ""}${c.provider === "clinicaltrials" ? ` ClinicalTrials.gov ${c.id}.` : c.pmid ? ` PMID ${c.pmid}.` : ""}`;
}

/** "Delgado et al., 2025"; an organization as author keeps its whole name. */
function shortFor(c: Candidate): string {
  const first = c.authors[0] ?? "";
  const person = /\b[A-Z]{1,3}\.?$/.test(first) || /,/.test(first);
  if (c.authors.length === 1 && !person) return `${first}${c.year ? `, ${c.year}` : ""}`;
  return shortCitation({ title: c.title, authors: c.authors, year: c.year });
}


/** What to read for a chosen result (F-119, F-020): full text when free, else the abstract, or the registry record. */
export async function candidateDoc(c: Candidate): Promise<{ doc: SourceDoc; note?: string }> {
  const meta = {
    kind: c.kind === "trial" ? ("trial" as const) : c.kind === "report" ? ("report" as const) : ("paper" as const),
    title: c.title,
    citation: citationOf(c),
    short: c.provider === "clinicaltrials" ? c.id : shortFor(c),
    url: c.url,
    access: c.access,
    origin: "discovered" as const,
    ...(c.year ? { year: c.year } : {}),
  };
  if (c.provider === "clinicaltrials")
    return { doc: { name: c.id, pages: [{ page: 1, text: c.recordText ?? c.title }], labels: { 1: "Registry record" }, meta, context: "This is a ClinicalTrials.gov registry record, not a paper. Findings are what the record states (design, enrollment, status, outcomes measured, whether results are posted). Do not infer results that are not posted." } };
  let note: string | undefined;
  if (c.access === "full text" && c.pmcid) {
    try {
      const ft = await post<{ pages: SourceDoc["pages"]; labels: Record<number, string> }>("/api/sources/fulltext", { pmcid: c.pmcid });
      return { doc: { name: c.title, pages: ft.pages, labels: ft.labels, meta } };
    } catch {
      note = "The full text couldn't be fetched, so only the abstract is used.";
    }
  }
  if (!c.abstract) throw new Error("This record has no abstract to read. Upload the PDF if you have it.");
  return { note, doc: { name: c.title, pages: [{ page: 1, text: c.abstract }], labels: { 1: "Abstract" }, meta: { ...meta, access: "abstract" }, context: "Only the abstract is available. Extract findings from the abstract alone and note that the full paper was not read." } };
}

/** One search result, with its access level, labels, abstract and an Add button. */
export function CandidateCard({ c, inWorkspace, busy, onAdd }: { c: Candidate; inWorkspace: boolean; busy: boolean; onAdd: () => void }) {
  return (
    <li className="candidate">
      <strong className="cand-title">{c.title}</strong>
      <span className="small muted">{[c.authors.slice(0, 3).join(", ") + (c.authors.length > 3 ? " et al." : ""), c.venue, c.year].filter(Boolean).join(" · ")}</span>
      <span className="row small">
        <span className={c.access === "full text" ? "pill ok" : c.access === "registry record" ? "pill navy" : "pill"}>{c.access === "full text" ? "Free full text" : c.access === "abstract" ? "Abstract only" : "Registry record"}</span>
        {c.badges.map((b) => <span key={b} className="pill">{b}</span>)}
      </span>
      {c.abstract && (
        <details>
          <summary className="small">{c.provider === "clinicaltrials" ? "Summary" : "Abstract"}</summary>
          <p className="small" style={{ margin: "6px 0 0", whiteSpace: "pre-line" }}>{c.abstract}</p>
        </details>
      )}
      <span className="row">
        <a className="small" href={c.url} target="_blank" rel="noopener noreferrer">View the record</a>
        <span className="spacer" />
        {inWorkspace ? <span className="pill ok">In the workspace</span> : <button className="small primary" disabled={busy} onClick={onAdd}>Add to workspace</button>}
      </span>
    </li>
  );
}

export function FindSources({ arg, apply, onDone, initial }: { arg: Argument; apply: (b: ArgOpBody[], reason: string) => void; onDone: () => void; initial?: string }) {
  const [provider, setProvider] = useState<Provider>("europepmc");
  const [want, setWant] = useState(initial ?? "");
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [fromYear, setFromYear] = useState("");
  const [transport, setTransport] = useState<Transport | null | undefined>(undefined);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [from, setFrom] = useState<{ from: string; note?: string } | null>(null);
  const [adding, setAdding] = useState<{ c: Candidate; doc: SourceDoc } | null>(null);

  useEffect(() => {
    claudeAvailable().then(setTransport);
  }, []);

  const inWorkspace = new Set((arg.sources ?? []).filter((s) => s.status === "active").map((s) => s.url).filter(Boolean));

  async function plan() {
    setError("");
    setBusy("Claude is writing the search…");
    try {
      const req = { provider, want, purpose: arg.purpose, thesis: arg.thesis };
      const { value } = await askClaudeFor({
        prompt: searchPlanPrompt(req),
        parse: (raw) => {
          const r = SearchPlan.safeParse(raw);
          return r.success ? r.data : null;
        },
        route: "/api/sources/plan",
        payload: req,
        key: "value",
      });
      setQuery(value.query);
      setNote(value.note);
    } catch (e) {
      setError(e instanceof ClaudeError ? e.message : "Claude couldn't write the search. Type your own below.");
    } finally {
      setBusy("");
    }
  }

  async function search() {
    setError("");
    setBusy("Searching…");
    setResults(null);
    try {
      const { results, from, note } = await post<{ results: Candidate[]; from: string; note?: string }>("/api/sources/search", {
        provider,
        query: query || want,
        ...(openOnly && provider === "europepmc" ? { openAccessOnly: true } : {}),
        ...(Number(fromYear) > 1900 ? { fromYear: Number(fromYear) } : {}),
      });
      setResults(results);
      setFrom({ from, note });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function choose(c: Candidate) {
    setError("");
    setBusy(c.access === "full text" ? "Getting the full text from PubMed Central…" : "");
    try {
      const { doc, note } = await candidateDoc(c);
      if (note) setError(note);
      setAdding({ c, doc });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  if (adding)
    return (
      <div className="add-box stack" style={{ gap: 10 }}>
        <p className="small" style={{ margin: 0 }}>
          <strong>{adding.doc.meta?.short}</strong>: {adding.c.title} <span className="pill">{adding.doc.meta?.access}</span>
        </p>
        <ReadAndPick arg={arg} apply={apply} doc={adding.doc} onDone={() => { setAdding(null); onDone(); }} />
      </div>
    );

  return (
    <div className="add-box stack" style={{ gap: 10 }}>
      <div className="row" role="radiogroup" aria-label="Where to search">
        {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
          <button key={p} className={provider === p ? "small primary" : "small"} role="radio" aria-checked={provider === p} onClick={() => { setProvider(p); setResults(null); setQuery(""); setNote(""); }}>
            {PROVIDERS[p].name}
          </button>
        ))}
      </div>
      <p className="small muted" style={{ margin: 0 }}>{PROVIDERS[provider].covers}.</p>
      <label>
        What are you looking for?
        <textarea rows={2} value={want} onChange={(e) => setWant(e.target.value)} placeholder="For example: trials of walking programs and HbA1c in adults over 65" />
      </label>
      {transport && (
        <button className="small" style={{ alignSelf: "flex-start" }} disabled={want.trim().length < 3 || Boolean(busy)} onClick={plan}>Let Claude write the search</button>
      )}
      {(query || note) && (
        <label>
          Search to run (edit if you like)
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
          {note && <span className="small muted" style={{ fontWeight: 400 }}>{note}</span>}
        </label>
      )}
      <div className="row">
        {provider === "europepmc" && (
          <label className="inline small"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Free full text only</label>
        )}
        <label className="inline small">From year <input style={{ width: 90, minHeight: 36 }} inputMode="numeric" value={fromYear} onChange={(e) => setFromYear(e.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
        <span className="spacer" />
        <button className="primary small" disabled={(query || want).trim().length < 2 || Boolean(busy)} onClick={search}>Search</button>
        <button className="small ghost" onClick={onDone}>Close</button>
      </div>
      {busy && <p className="small" role="status">{busy}</p>}
      {error && <p className="small error" role="alert">{error}</p>}
      {results && (
        <>
          <p className="small muted" style={{ margin: 0 }}>{results.length ? `${results.length} results from ${from?.from ?? "the database"}. Nothing is added until you choose.` : "No results. Try broader words, or the other database."}</p>
          {from?.note && <p className="small notice" style={{ margin: 0 }}>{from.note}</p>}
          <ul className="candidates">
            {results.map((c) => (
              <CandidateCard key={c.id} c={c} inWorkspace={inWorkspace.has(c.url)} busy={Boolean(busy)} onAdd={() => choose(c)} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
