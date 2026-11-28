"use client";
/**
 * Discover (F-020): from the presentation's topic, the current landscape:
 * strongest evidence, newest studies, ongoing trials and government reports.
 * Every result is a candidate; the author adds what matters.
 */
import { useEffect, useState } from "react";
import type { ArgOpBody, Argument, SearchRecord } from "@/model/argument";
import { newId } from "@/model/ids";
import type { Candidate, LandscapeSection } from "@/find/types";
import { DiscoverPlan, discoverPlanPrompt } from "@/ai/search";
import { CATALOG, cleanSelection, LIVE, sourceName } from "@/find/catalog";
import { askClaudeFor, claudeAvailable, type Transport } from "@/ai/analysis-client";
import { CandidateCard, candidateDoc, post } from "./FindSources";
import { ReadAndPick, type SourceDoc } from "./ReadAndPick";

const SHOW = 4;

export function DiscoverPanel({ arg, apply }: { arg: Argument; apply: (b: ArgOpBody[], reason: string) => void }) {
  const topic = (arg.topic ?? "").trim();
  // The last Discover run is saved with the presentation: start from it.
  const last = [...(arg.searches ?? [])].reverse().find((s) => s.sections);
  const [transport, setTransport] = useState<Transport | null | undefined>(undefined);
  const [query, setQuery] = useState(last?.query ?? "");
  const [broader, setBroader] = useState(last?.broader ?? "");
  const [words, setWords] = useState(last?.words ?? "");
  const chosen = cleanSelection(arg.sourceScope);
  const reasons = arg.sourceReasons ?? {};
  const [showSources, setShowSources] = useState(false);
  const [note, setNote] = useState(last?.note ?? "");
  const [sections, setSections] = useState<LandscapeSection[] | null>(last?.sections ?? null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState<{ c: Candidate; doc: SourceDoc } | null>(null);

  useEffect(() => {
    claudeAvailable().then(setTransport);
  }, []);

  const inWorkspace = new Set((arg.sources ?? []).filter((s) => s.status === "active").map((s) => s.url).filter(Boolean));

  function toggleSource(id: string) {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
    if (!next.length) return;
    apply([{ kind: "arg.set", patch: { sourceScope: cleanSelection(next) } }], `${chosen.includes(id) ? "Stopped searching" : "Searching"} ${sourceName(id)}`);
  }

  /**
   * Discover: with no search yet, Claude plans it (the searches, and which
   * sources fit the topic, with reasons), unless the author has already chosen
   * the sources. "Run" uses the search as edited.
   */
  async function discover(useQuery?: string) {
    if (topic.length < 2) return;
    setError("");
    setSections(null);
    // A changed topic needs a new plan, not the last topic's searches.
    const stale = Boolean(last && last.topic !== topic);
    let q = useQuery ?? (stale ? "" : query);
    let wide = stale ? "" : broader;
    let plain = stale ? "" : words;
    let plannedNote = note;
    let scope = chosen;
    let by: SearchRecord["by"] = useQuery !== undefined ? "author" : query ? (last?.by ?? "claude") : "claude";
    try {
      if (!q && transport) {
        setBusy("Claude is choosing where to search and writing the searches…");
        try {
          const req = { topic, purpose: arg.purpose, thesis: arg.thesis };
          const { value } = await askClaudeFor({
            prompt: discoverPlanPrompt(req),
            parse: (raw) => {
              const r = DiscoverPlan.safeParse(raw);
              return r.success ? r.data : null;
            },
            route: "/api/sources/discover-plan",
            payload: req,
            key: "value",
          });
          q = value.query;
          wide = value.broader ?? "";
          plain = value.words;
          plannedNote = value.note;
          setQuery(q);
          setBroader(wide);
          setWords(plain);
          setNote(plannedNote);
          const why = Object.fromEntries(value.sources.filter((x) => LIVE.some((l) => l.id === x.id)).map((x) => [x.id, { use: x.use, why: x.why }]));
          // Claude's choice applies only while the author hasn't chosen.
          if (!arg.sourceScope) scope = cleanSelection(value.sources.filter((x) => x.use).map((x) => x.id));
          apply([{ kind: "arg.set", patch: { sourceReasons: why, ...(arg.sourceScope ? {} : { sourceScope: scope }) } }], "Claude proposed where to search");
        } catch {
          q = topic;
        }
      }
      if (!q) {
        q = topic;
        by = "author";
      }
      if (!plain) plain = topic;
      setBusy(`Searching ${scope.map(sourceName).join(", ")}…`);
      const { sections } = await post<{ sections: LandscapeSection[] }>("/api/sources/landscape", { query: q, words: topic, plain, sources: scope, ...(wide ? { broader: wide } : {}) });
      setSections(sections);
      const record: SearchRecord = {
        id: newId("srch"),
        at: new Date().toISOString(),
        topic,
        query: q,
        ...(wide ? { broader: wide } : {}),
        words: plain,
        ...(plannedNote ? { note: plannedNote } : {}),
        by,
        sources: scope,
        counts: sections.map((s) => ({ key: s.key, title: s.title, n: s.results.length })),
        sections,
      };
      apply([{ kind: "search.put", search: record }], `Discovered: ${q.slice(0, 80)}`);
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
          <div className="source-scope">
            <button className="small ghost" aria-expanded={showSources} onClick={() => setShowSources((v) => !v)}>
              Where to search: {chosen.map(sourceName).join(", ")} {showSources ? "▴" : "▾"}
            </button>
            {showSources && (
              <ul className="source-list">
                {CATALOG.map((src) => {
                  const live = src.status === "live";
                  const r = reasons[src.id];
                  return (
                    <li key={src.id} className={live ? "" : "muted"}>
                      <label className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 10 }}>
                        <input type="checkbox" disabled={!live || Boolean(busy)} checked={live && chosen.includes(src.id)} onChange={() => toggleSource(src.id)} style={{ marginTop: 3 }} />
                        <span className="stack" style={{ gap: 2 }}>
                          <span>
                            <strong>{src.name}</strong> <span className="small muted">· {src.owner}</span> {!live && <span className="pill">Coming</span>}
                          </span>
                          <span className="small muted">{src.covers}.</span>
                          {r && live && <span className="small">Claude: {r.use ? "use" : "skip"}, {r.why}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
                <li className="small muted">Your choice is saved with this presentation. Click Discover again to search the new selection.</li>
              </ul>
            )}
          </div>
          {(query || note) && (
            <label className="small">
              Search used for PubMed (edit and run again if you like){words && chosen.some((id) => id === "openalex" || id === "clinicaltrials") ? `; other databases searched for: ${words}` : ""}
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
                {sec.broadened && <p className="small notice" style={{ margin: 0 }}>Nothing matched your exact topic, so these are on the broader topic: <em>{sec.broadened}</em>.</p>}
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
