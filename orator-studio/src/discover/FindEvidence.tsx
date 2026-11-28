"use client";
/**
 * Find evidence (Discover, F-020, F-121, F-122): from a topic or question,
 * Claude chooses which catalog sources fit and writes the searches; the
 * landscape comes back in parts (strongest evidence, newest studies, research
 * in all fields, ongoing trials, government reports). Each result is a
 * candidate until kept; keeping reads it into the Body of Knowledge.
 */
import { useEffect, useState } from "react";
import type { Candidate, LandscapeSection } from "@/find/types";
import { DiscoverPlan, discoverPlanPrompt } from "@/ai/search";
import { askClaudeFor, claudeAvailable, type Transport } from "@/ai/analysis-client";
import { CATALOG, cleanSelection, LIVE, sourceName } from "@/find/catalog";
import { knowledge } from "@/knowledge/client";
import type { Source } from "@/knowledge/types";
import { candidateDoc, post } from "./candidates";
import { ReadSource, type SourceDoc } from "./ReadSource";
import { LinkToTopics } from "./LinkToTopics";
import { Drawer } from "@/components/Drawer";

/** A saved search: what was asked, where, and what came back, so it can be reopened without running again. */
export type SearchRecord = {
  kind: "search";
  topic: string;
  query: string;
  broader?: string;
  words: string;
  note?: string;
  sources: string[];
  by: "claude" | "author";
  at: string;
  counts: { key: string; title: string; n: number }[];
  sections: LandscapeSection[];
};
const isSearch = (r: unknown): r is SearchRecord => Boolean(r && typeof r === "object" && (r as SearchRecord).kind === "search" && Array.isArray((r as SearchRecord).sections));
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const SHOW = 4;
const SCOPE_KEY = "orator-discover-scope";
const readScope = (): string[] | undefined => {
  try {
    return JSON.parse(localStorage.getItem(SCOPE_KEY) ?? "null") ?? undefined;
  } catch {
    return undefined;
  }
};

/** Has this result been kept already? Matched by DOI, PubMed id, trial number or address. */
export function keptKey(s: Pick<Source, "ids" | "url">): string[] {
  return [s.ids?.doi && `doi:${s.ids.doi.toLowerCase()}`, s.ids?.pmid && `pmid:${s.ids.pmid}`, s.ids?.nct && `nct:${s.ids.nct}`, s.url && `url:${s.url}`].filter(Boolean) as string[];
}
const candidateKeys = (c: Candidate) => [c.doi && `doi:${c.doi.toLowerCase()}`, c.pmid && `pmid:${c.pmid}`, c.provider === "clinicaltrials" && `nct:${c.id}`, `url:${c.url}`].filter(Boolean) as string[];

function ResultCard({ c, kept, busy, onKeep }: { c: Candidate; kept: boolean; busy: boolean; onKeep: () => void }) {
  return (
    <li className="candidate">
      <strong className="cand-title">{c.title}</strong>
      <span className="small muted">{[c.authors.slice(0, 3).join(", ") + (c.authors.length > 3 ? " et al." : ""), c.venue, c.year].filter(Boolean).join(" · ")}</span>
      <span className="row small">
        <span className={c.access === "full text" ? "pill ok" : c.access === "registry record" ? "pill navy" : "pill"}>{c.access === "full text" ? "Free full text" : c.access === "abstract" ? "Abstract only" : c.access === "link only" ? "Link only" : "Registry record"}</span>
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
        {kept ? <span className="pill ok">In your Body of Knowledge</span> : c.access === "link only" ? <span className="small muted">No abstract to read: open it, and upload the PDF to keep it</span> : <button className="small primary" disabled={busy} onClick={onKeep}>Keep</button>}
      </span>
    </li>
  );
}

export function FindEvidence({ start = "", kept, onKept, onSearched }: { start?: string; kept: Set<string>; onKept: (s: Source) => void; onSearched?: (topic: string) => void }) {
  const k = knowledge();
  const [want, setWant] = useState(start);
  const [transport, setTransport] = useState<Transport | null | undefined>(undefined);
  const [scope, setScope] = useState<string[]>(cleanSelection(undefined));
  const [userChose, setUserChose] = useState(false);
  const [reasons, setReasons] = useState<Record<string, { use: boolean; why: string }>>({});
  const [query, setQuery] = useState("");
  const [broader, setBroader] = useState("");
  const [words, setWords] = useState("");
  const [note, setNote] = useState("");
  const [sections, setSections] = useState<LandscapeSection[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showSources, setShowSources] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState<{ c: Candidate; doc: SourceDoc } | null>(null);
  const [justKept, setJustKept] = useState<Source | null>(null);
  const [recent, setRecent] = useState<SearchRecord[]>([]);
  const [shownFrom, setShownFrom] = useState<string | null>(null);

  // Saved searches, newest first: reopen one without running it again.
  useEffect(() => {
    k.db
      .select("search_runs")
      .then((rows) => {
        const runs = rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r) => r.record).filter(isSearch);
        setRecent(runs);
        runs.forEach((r) => onSearched?.(r.topic));
      })
      .catch(() => undefined);
  }, [k]); // eslint-disable-line react-hooks/exhaustive-deps

  function openRun(r: SearchRecord) {
    setWant(r.topic);
    setQuery(r.query);
    setBroader(r.broader ?? "");
    setWords(r.words);
    setNote(r.note ?? "");
    setSections(r.sections);
    setShownFrom(r.at);
    setError("");
  }

  useEffect(() => {
    claudeAvailable().then(setTransport);
    const saved = readScope();
    if (saved) {
      setScope(cleanSelection(saved));
      setUserChose(true);
    }
  }, []);
  // Arriving with a topic (from Explore or a topic's page): reopen its saved results if there are any.
  useEffect(() => {
    if (!start) return;
    const saved = recent.find((r) => r.topic.toLowerCase() === start.toLowerCase());
    if (saved) openRun(saved);
    else {
      setWant(start);
      setSections(null);
      setQuery("");
      setNote("");
      setShownFrom(null);
      setAutoRun(true);
    }
  }, [start, recent.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new topic arriving from Explore runs straight away (once the box holds it).
  const [autoRun, setAutoRun] = useState(false);
  useEffect(() => {
    if (autoRun && want === start && transport !== undefined) {
      setAutoRun(false);
      discover();
    }
  }, [autoRun, want, start, transport]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSource(id: string) {
    const next = cleanSelection(scope.includes(id) ? scope.filter((x) => x !== id) : [...scope, id]);
    setScope(next);
    setUserChose(true);
    try {
      localStorage.setItem(SCOPE_KEY, JSON.stringify(next));
    } catch {}
  }

  async function discover(edited?: string) {
    const topic = want.trim();
    if (topic.length < 2) return;
    setError("");
    setSections(null);
    let q = edited ?? "";
    let wide = edited ? broader : "";
    let plain = edited ? words : "";
    let s = scope;
    try {
      if (!q && transport) {
        setBusy("Claude is choosing where to search and writing the searches…");
        try {
          const req = { topic, purpose: "", thesis: "" };
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
          setQuery(q);
          setBroader(wide);
          setWords(plain);
          setNote(value.note);
          setReasons(Object.fromEntries(value.sources.filter((x) => LIVE.some((l) => l.id === x.id)).map((x) => [x.id, { use: x.use, why: x.why }])));
          if (!userChose) {
            s = cleanSelection(value.sources.filter((x) => x.use).map((x) => x.id));
            setScope(s);
          }
        } catch {
          q = topic;
        }
      }
      if (!q) q = topic;
      if (!plain) plain = topic;
      setBusy(`Searching ${s.map(sourceName).join(", ")}…`);
      const { sections } = await post<{ sections: LandscapeSection[] }>("/api/sources/landscape", { query: q, words: topic, plain, sources: s, ...(wide ? { broader: wide } : {}) });
      setSections(sections);
      setShownFrom(null);
      const record: SearchRecord = { kind: "search", topic, query: q, ...(wide ? { broader: wide } : {}), words: plain, ...(note ? { note } : {}), sources: s, by: edited ? "author" : transport ? "claude" : "author", at: new Date().toISOString(), counts: sections.map((x) => ({ key: x.key, title: x.title, n: x.results.length })), sections };
      setRecent((r) => [record, ...r.filter((x) => x.topic.toLowerCase() !== topic.toLowerCase())]);
      onSearched?.(topic);
      await k.recordSearch(record).catch(() => undefined);
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
      setReading({ c, doc });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  const total = sections?.reduce((n, s) => n + s.results.length, 0) ?? 0;
  return (
    <section className="stack" style={{ gap: 12 }} aria-label="Find evidence">
      {reading && (
        <Drawer title={`Read and keep: ${reading.doc.meta?.short ?? reading.c.title}`} onClose={() => setReading(null)}>
          <p className="small" style={{ margin: 0 }}>
            {reading.c.title} <span className="pill">{reading.doc.meta?.access}</span>
          </p>
          <ReadSource
            doc={reading.doc}
            busy={Boolean(busy)}
            onCancel={() => setReading(null)}
            onKeep={async (source, facts) => {
              setBusy("Keeping…");
              try {
                const { source: kept } = await k.keepSource(source, facts);
                onKept(kept);
                setReading(null);
                setJustKept(kept);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy("");
              }
            }}
          />
          {error && <p className="small error" role="alert">{error}</p>}
        </Drawer>
      )}
      {justKept && (
        <Drawer title="Link it to topics" onClose={() => setJustKept(null)}>
          <LinkToTopics source={justKept} hint={want} onDone={() => setJustKept(null)} />
        </Drawer>
      )}
      <form
        className="row"
        style={{ alignItems: "flex-end" }}
        onSubmit={(e) => {
          e.preventDefault();
          discover();
        }}
      >
        <label style={{ flex: "1 1 320px" }}>
          A topic or question
          <input value={want} onChange={(e) => setWant(e.target.value)} placeholder="Sabbath rest and burnout in clinicians" />
        </label>
        <button className="primary" disabled={Boolean(busy) || want.trim().length < 2}>Find evidence</button>
      </form>
      {busy && !reading && <p className="small" role="status" style={{ margin: 0 }}>{busy}</p>}
      {recent.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <span className="small muted">Recent searches (reopen without running again):</span>
          <div className="recent-list">
            {recent.slice(0, 8).map((r) => (
              <button key={r.at} className="small" onClick={() => openRun(r)} title={`Searched ${day(r.at)}`}>{r.topic}</button>
            ))}
          </div>
        </div>
      )}
      {shownFrom && sections && (
        <p className="small notice" style={{ margin: 0 }}>
          Results saved on {day(shownFrom)}. <button className="small ghost" disabled={Boolean(busy)} onClick={() => discover(query || undefined)}>Search again for anything newer</button>
        </p>
      )}
      <div className="source-scope">
        <button className="small ghost" aria-expanded={showSources} onClick={() => setShowSources((v) => !v)}>
          Where to search: {scope.map(sourceName).join(", ")} {showSources ? "▴" : "▾"}
        </button>
        {showSources && (
          <ul className="source-list">
            {CATALOG.map((src) => {
              const live = src.status === "live" && src.discover !== false;
              const r = reasons[src.id];
              return (
                <li key={src.id} className={live ? "" : "muted"}>
                  <label className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 10 }}>
                    <input type="checkbox" disabled={!live || Boolean(busy)} checked={live && scope.includes(src.id)} onChange={() => toggleSource(src.id)} style={{ marginTop: 3 }} />
                    <span className="stack" style={{ gap: 2 }}>
                      <span>
                        <strong>{src.name}</strong> <span className="small muted">· {src.owner}</span> {!live && <span className="pill">{src.status === "live" ? "Add your own" : "Coming"}</span>}
                      </span>
                      <span className="small muted">{src.covers}.</span>
                      {r && live && <span className="small">Claude: {r.use ? "use" : "skip"}, {r.why}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
            <li className="small muted">{userChose ? "Your choice is remembered on this device." : "Until you choose, Claude proposes the sources for each search."}</li>
          </ul>
        )}
      </div>
      {(query || note) && (
        <label className="small">
          Search used for PubMed (edit and run again if you like){words && scope.some((id) => id === "openalex" || id === "clinicaltrials") ? `; other databases searched for: ${words}` : ""}
          <span className="row" style={{ flexWrap: "nowrap" }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="small" disabled={Boolean(busy) || query.trim().length < 2} onClick={() => discover(query)}>Run</button>
          </span>
          {note && <span className="muted" style={{ fontWeight: 400 }}>{note}</span>}
        </label>
      )}
      {error && <p className="small error" role="alert">{error}</p>}
      {sections && total === 0 && <p className="small muted">Nothing found. Try broader words.</p>}
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
              {list.map((c) => <ResultCard key={c.id} c={c} kept={candidateKeys(c).some((x) => kept.has(x))} busy={Boolean(busy)} onKeep={() => choose(c)} />)}
            </ul>
            {sec.results.length > SHOW && (
              <button className="small ghost" onClick={() => setOpen((o) => { const n = new Set(o); if (all) n.delete(sec.key); else n.add(sec.key); return n; })}>
                {all ? "Show fewer" : `Show all ${sec.results.length}`}
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
