"use client";
/**
 * Discover (F-020): from the presentation's topic, the current landscape:
 * strongest evidence, newest studies, ongoing trials and government reports.
 * Every result is a candidate; the author adds what matters.
 */
import { useEffect, useState } from "react";
import type { ArgOpBody, Argument } from "@/model/argument";
import type { Candidate, LandscapeSection } from "@/find/types";
import { SearchPlan, searchPlanPrompt } from "@/ai/search";
import { askClaudeFor, claudeAvailable, type Transport } from "@/ai/analysis-client";
import { CandidateCard, candidateDoc, post } from "./FindSources";
import { ReadAndPick, type SourceDoc } from "./ReadAndPick";

const SHOW = 4;

export function DiscoverPanel({ arg, apply }: { arg: Argument; apply: (b: ArgOpBody[], reason: string) => void }) {
  const topic = (arg.topic ?? "").trim();
  const [transport, setTransport] = useState<Transport | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [sections, setSections] = useState<LandscapeSection[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState<{ c: Candidate; doc: SourceDoc } | null>(null);

  useEffect(() => {
    claudeAvailable().then(setTransport);
  }, []);

  const inWorkspace = new Set((arg.sources ?? []).filter((s) => s.status === "active").map((s) => s.url).filter(Boolean));

  async function discover(useQuery?: string) {
    if (topic.length < 2) return;
    setError("");
    setSections(null);
    let q = useQuery ?? query;
    try {
      if (!q && transport) {
        setBusy("Claude is writing the searches from your topic…");
        try {
          const req = { provider: "europepmc" as const, want: topic, purpose: arg.purpose, thesis: arg.thesis };
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
          q = value.query;
          setQuery(value.query);
          setNote(value.note);
        } catch {
          q = topic;
        }
      }
      if (!q) q = topic;
      setBusy("Searching PubMed, ClinicalTrials.gov and government reports…");
      const { sections } = await post<{ sections: LandscapeSection[] }>("/api/sources/landscape", { query: q, words: topic });
      setSections(sections);
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
      <section className="discover-panel stack" style={{ gap: 10 }} aria-label="Add a source">
        <p className="small" style={{ margin: 0 }}>
          Adding <strong>{adding.doc.meta?.short}</strong>: {adding.c.title} <span className="pill">{adding.doc.meta?.access}</span>
        </p>
        <ReadAndPick arg={arg} apply={apply} doc={adding.doc} onDone={() => setAdding(null)} />
      </section>
    );

  const total = sections?.reduce((n, s) => n + s.results.length, 0) ?? 0;

  return (
    <section className="discover-panel stack" style={{ gap: 12 }} aria-labelledby="discover-h">
      <div className="panel-head">
        <h2 id="discover-h">Discover what's known</h2>
      </div>
      {!topic ? (
        <p className="small muted" style={{ margin: 0 }}>Add a topic above to discover what's been published about it.</p>
      ) : (
        <>
          <p className="small" style={{ margin: 0 }}>
            The current landscape on <strong>{topic}</strong>: strongest evidence first, then the newest studies, ongoing trials and government reports. Nothing is added until you choose.
          </p>
          <div className="row">
            <button className="primary" disabled={Boolean(busy)} onClick={() => discover()}>{sections ? "Discover again" : "Discover"}</button>
            {busy && <span className="small" role="status">{busy}</span>}
          </div>
          {(query || note) && (
            <label className="small">
              Search used for PubMed (edit and run again if you like)
              <span className="row" style={{ flexWrap: "nowrap" }}>
                <input value={query} onChange={(e) => setQuery(e.target.value)} />
                <button className="small" disabled={Boolean(busy) || query.trim().length < 2} onClick={() => discover(query)}>Run</button>
              </span>
              {note && <span className="muted" style={{ fontWeight: 400 }}>{note}</span>}
            </label>
          )}
          {error && <p className="small error" role="alert">{error}</p>}
          {sections && total === 0 && <p className="small muted">Nothing found. Try broader words in the topic.</p>}
          {sections?.map((sec) => {
            const all = open.has(sec.key);
            const list = all ? sec.results : sec.results.slice(0, SHOW);
            return (
              <div key={sec.key} className="landscape-section">
                <h3 className="sub-h" style={{ margin: 0 }}>{sec.title} <span className="small muted">({sec.results.length})</span></h3>
                <p className="small muted" style={{ margin: 0 }}>{sec.note}</p>
                {sec.error && <p className="small warn-text" style={{ margin: 0 }}>{sec.error}</p>}
                {!sec.error && sec.results.length === 0 && <p className="small muted" style={{ margin: 0 }}>None found.</p>}
                <ul className="candidates">
                  {list.map((c) => <CandidateCard key={c.id} c={c} inWorkspace={inWorkspace.has(c.url)} busy={Boolean(busy)} onAdd={() => choose(c)} />)}
                </ul>
                {sec.results.length > SHOW && (
                  <button className="small ghost" onClick={() => setOpen((o) => { const n = new Set(o); if (all) n.delete(sec.key); else n.add(sec.key); return n; })}>
                    {all ? "Show fewer" : `Show all ${sec.results.length}`}
                  </button>
                )}
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
