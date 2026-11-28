"use client";
/**
 * Explore an idea (Discover): Claude shapes a loose idea into questions, what
 * is debated, suggested topics and searches. All of it is Claude's general
 * knowledge, labeled as such; the author then finds the evidence. Suggested
 * topics can be added to the Topic Library after a check for duplicates.
 */
import { useEffect, useState } from "react";
import { Exploration, explorePrompt } from "@/ai/explore";
import { askClaudeFor, claudeAvailable, ClaudeError } from "@/ai/analysis-client";
import { knowledge } from "@/knowledge/client";
import { similarTopics } from "@/knowledge/logic";
import type { Topic } from "@/knowledge/types";

/** A saved exploration, so it can be reopened without asking Claude again. */
type ExploreRecord = { kind: "explore"; idea: string; at: string; result: Exploration };
const isExplore = (r: unknown): r is ExploreRecord => Boolean(r && typeof r === "object" && (r as ExploreRecord).kind === "explore");

export function ExploreIdea({ onSearch, searched }: { onSearch: (words: string) => void; searched: Set<string> }) {
  const k = knowledge();
  const [idea, setIdea] = useState("");
  const [has, setHas] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Exploration | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [added, setAdded] = useState<Record<string, string>>({});
  const [recent, setRecent] = useState<ExploreRecord[]>([]);
  const [shownFrom, setShownFrom] = useState<string | null>(null);

  useEffect(() => {
    claudeAvailable().then((t) => setHas(Boolean(t)));
    k.listTopics().then(setTopics).catch(() => undefined);
    k.db
      .select("search_runs")
      .then((rows) => setRecent(rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r) => r.record).filter(isExplore)))
      .catch(() => undefined);
  }, [k]);

  function reopen(r: ExploreRecord) {
    setIdea(r.idea);
    setResult(r.result);
    setShownFrom(r.at);
    setError("");
  }

  async function explore() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const req = { idea: idea.trim(), existingTopics: topics.map((t) => t.name).slice(0, 200) };
      const { value } = await askClaudeFor({
        prompt: explorePrompt(req),
        parse: (raw) => {
          const r = Exploration.safeParse(raw);
          return r.success ? r.data : null;
        },
        route: "/api/discover/explore",
        payload: req,
        key: "value",
      });
      setResult(value);
      setShownFrom(null);
      const record: ExploreRecord = { kind: "explore", idea: req.idea, at: new Date().toISOString(), result: value };
      setRecent((r) => [record, ...r.filter((x) => x.idea.toLowerCase() !== req.idea.toLowerCase())]);
      await k.recordSearch(record).catch(() => undefined);
    } catch (e) {
      setError(e instanceof ClaudeError ? e.message : "Claude couldn't explore it just now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function addTopic(t: Exploration["topics"][number], useExisting?: Topic) {
    if (useExisting) return setAdded((a) => ({ ...a, [t.name]: `Already in your library as “${useExisting.name}”` }));
    try {
      const created = await k.createTopic({ name: t.name, keywords: t.keywords });
      setTopics((x) => [created, ...x]);
      setAdded((a) => ({ ...a, [t.name]: "Added to your Topic Library" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (has === false) return <p className="small muted">Exploring an idea needs Claude, which isn&apos;t connected here. You can still find evidence and add your own.</p>;

  return (
    <section className="stack" style={{ gap: 12 }} aria-label="Explore an idea">
      <form
        className="row"
        style={{ alignItems: "flex-end" }}
        onSubmit={(e) => {
          e.preventDefault();
          explore();
        }}
      >
        <label style={{ flex: "1 1 320px" }}>
          Your idea, in a few words
          <input value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Does keeping the Sabbath help clinicians avoid burnout?" />
        </label>
        <button className="primary" disabled={busy || idea.trim().length < 2}>{busy ? "Exploring…" : "Explore"}</button>
      </form>
      {error && <p className="small error" role="alert">{error}</p>}
      {recent.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <span className="small muted">Recent explorations (reopen without asking Claude again):</span>
          <div className="recent-list">
            {recent.slice(0, 8).map((r) => <button key={r.at} className="small" onClick={() => reopen(r)}>{r.idea.slice(0, 60)}</button>)}
          </div>
        </div>
      )}
      {shownFrom && result && <p className="small notice" style={{ margin: 0 }}>Saved exploration from {new Date(shownFrom).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. <button className="small ghost" disabled={busy} onClick={explore}>Explore again</button></p>}
      {result && (
        <div className="stack" style={{ gap: 12 }}>
          <p className="small notice" style={{ margin: 0 }}>Claude&apos;s general knowledge, to point the way. It isn&apos;t evidence: find and keep the evidence itself.</p>
          <p style={{ margin: 0 }}>{result.overview}</p>
          {result.questions.length > 0 && (
            <div>
              <h3 className="sub-h">Questions worth answering</h3>
              <ul className="small">{result.questions.map((q) => <li key={q}>{q}</li>)}</ul>
            </div>
          )}
          {result.debated.length > 0 && (
            <div>
              <h3 className="sub-h">Where people disagree</h3>
              <ul className="small">{result.debated.map((q) => <li key={q}>{q}</li>)}</ul>
            </div>
          )}
          {result.topics.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <h3 className="sub-h">Suggested topics</h3>
              {result.topics.map((t) => {
                const existing = similarTopics(t.name, t.keywords, topics)[0]?.topic;
                return (
                  <div key={t.name} className="row" style={{ alignItems: "baseline" }}>
                    <span style={{ flex: 1 }}>
                      <strong>{t.name}</strong> <span className="small muted">{t.keywords.join(", ")}</span>
                      <br />
                      <span className="small">{t.why}</span>
                    </span>
                    {added[t.name] ? (
                      <span className="pill ok">{added[t.name]}</span>
                    ) : existing ? (
                      <button className="small" onClick={() => addTopic(t, existing)} title={`You already have “${existing.name}”`}>Use “{existing.name}”</button>
                    ) : (
                      <button className="small" onClick={() => addTopic(t)}>Add topic</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {result.searches.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <h3 className="sub-h">Searches to run</h3>
              {result.searches.map((s) => (
                <div key={s.words} className="row" style={{ alignItems: "baseline" }}>
                  <span style={{ flex: 1 }}>
                    <strong>{s.words}</strong> <span className="small muted">{s.why}</span>
                  </span>
                  {searched.has(s.words.toLowerCase()) ? (
                    <button className="small" onClick={() => onSearch(s.words)}>Searched ✓ Open results</button>
                  ) : (
                    <button className="small primary" onClick={() => onSearch(s.words)}>Find evidence</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
