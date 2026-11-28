"use client";
/**
 * After a source is kept: which topics does it bear on? (F-142) Topics whose
 * words match the source are suggested; any topic can be chosen; a new topic
 * can be created here, after a check that it doesn't exist already.
 */
import { useEffect, useMemo, useState } from "react";
import { knowledge } from "@/knowledge/client";
import { parseKeywords, similarTopics } from "@/knowledge/logic";
import type { Source, Topic } from "@/knowledge/types";

export function LinkToTopics({ source, onDone, hint = "" }: { source: Source; onDone: () => void; hint?: string }) {
  const k = knowledge();
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [name, setName] = useState(hint);
  const [keywords, setKeywords] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const [t, links] = await Promise.all([k.listTopics(), k.db.select("topic_sources", { source_id: source.id })]);
      setTopics(t);
      setLinked(new Set(links.map((l) => l.topic_id)));
    })().catch((e) => setError(e.message));
  }, [k, source.id]);

  const suggested = useMemo(() => (topics ? similarTopics(`${source.title} ${hint}`, [], topics, 0.34).map((x) => x.topic).filter((t) => !linked.has(t.id)).slice(0, 5) : []), [topics, source.title, hint, linked]);
  const dupes = useMemo(() => (topics && name.trim() ? similarTopics(name, parseKeywords(keywords), topics) : []), [topics, name, keywords]);

  async function link() {
    setBusy(true);
    setError("");
    try {
      for (const id of chosen) await k.linkSource(id, source.id);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setBusy(true);
    setError("");
    try {
      const t = await k.createTopic({ name: name.trim(), keywords: parseKeywords(keywords) });
      await k.linkSource(t.id, source.id);
      setTopics((x) => [t, ...(x ?? [])]);
      setLinked((s) => new Set(s).add(t.id));
      setName("");
      setKeywords("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!topics) return <p className="small muted">Loading your topics…</p>;
  const others = topics.filter((t) => !linked.has(t.id) && !suggested.includes(t));
  const toggle = (id: string) => setChosen((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)));

  return (
    <div className="add-box stack" style={{ gap: 10 }}>
      <strong>Kept: {source.short || source.title}</strong>
      <p className="small muted" style={{ margin: 0 }}>Which topics does it bear on? Linking is optional; a source is also linked to a topic whenever an assertion there cites one of its facts.</p>
      {linked.size > 0 && <p className="small" style={{ margin: 0 }}>Linked to: {topics.filter((t) => linked.has(t.id)).map((t) => t.name).join(", ")}</p>}
      {suggested.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <span className="small"><strong>Suggested</strong> (matching words)</span>
          {suggested.map((t) => (
            <label key={t.id} className="inline small">
              <input type="checkbox" checked={chosen.has(t.id)} onChange={() => toggle(t.id)} /> {t.name}
            </label>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <details>
          <summary className="small">All your topics ({others.length})</summary>
          <div className="stack" style={{ gap: 4, marginTop: 6 }}>
            {others.map((t) => (
              <label key={t.id} className="inline small">
                <input type="checkbox" checked={chosen.has(t.id)} onChange={() => toggle(t.id)} /> {t.name}
              </label>
            ))}
          </div>
        </details>
      )}
      <div className="stack" style={{ gap: 6 }}>
        <span className="small"><strong>Or a new topic</strong></span>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="small" style={{ flex: "2 1 200px" }}>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sabbath rest and health" />
          </label>
          <label className="small" style={{ flex: "1 1 160px" }}>
            Keywords
            <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="sabbath, rest, burnout" />
          </label>
          <button className="small" disabled={busy || name.trim().length < 2} onClick={create}>Create and link</button>
        </div>
        {dupes.length > 0 && (
          <p className="small notice" style={{ margin: 0 }}>
            You already have {dupes.map((d) => `“${d.topic.name}”`).join(", ")}. Tick it above instead, unless this is a different topic.
          </p>
        )}
      </div>
      {error && <p className="small error" role="alert">{error}</p>}
      <div className="row">
        <button className="small primary" disabled={busy || !chosen.size} onClick={link}>Link to {chosen.size || ""} topic{chosen.size === 1 ? "" : "s"}</button>
        <button className="small ghost" onClick={onDone}>{linked.size ? "Done" : "Not now"}</button>
      </div>
    </div>
  );
}
