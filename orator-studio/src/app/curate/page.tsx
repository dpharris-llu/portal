"use client";
/**
 * Orator Curate: the Topic Library (F-131). Each topic gathers the sources
 * that bear on it, observations (yours or Claude's) and your assertions.
 * Topics are reused across presentations.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { knowledge } from "@/knowledge/client";
import { parseKeywords, similarTopics, words } from "@/knowledge/logic";
import type { Assertion, AssertionFact, Fact, ReviewFlag, Topic, TopicSource } from "@/knowledge/types";

type Counts = { sources: number; assertions: number; unsupported: number; flags: number };

export default function TopicLibrary() {
  const k = knowledge();
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [me, setMe] = useState("");
  const [filter, setFilter] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [t, user] = await Promise.all([k.listTopics(), k.userId()]);
      const ids = t.map((x) => x.id);
      const [links, assertions] = await Promise.all([k.db.select("topic_sources", { topic_id: ids }), k.db.select("assertions", { topic_id: ids })]);
      const [af, flags] = await Promise.all([k.db.select("assertion_facts", { assertion_id: assertions.map((a) => a.id) }), k.openFlags("assertion", assertions.map((a) => a.id))]);
      const facts = await k.db.select("facts", { id: [...new Set(af.map((l) => l.fact_id))] });
      setTopics(t);
      setMe(user);
      setCounts(tally(t, links, assertions, af, facts, flags));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [k]);
  useEffect(() => {
    load();
  }, [load]);

  const dupes = useMemo(() => (topics && name.trim() ? similarTopics(name, parseKeywords(keywords), topics) : []), [topics, name, keywords]);
  const q = words(filter);
  const shown = (topics ?? []).filter((t) => !q.length || q.every((w) => words(`${t.name} ${t.description} ${t.keywords.join(" ")}`).some((x) => x.startsWith(w))));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const t = await k.createTopic({ name: name.trim(), description: description.trim(), keywords: parseKeywords(keywords) });
      router.push(`/curate/topics/${t.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar />
      <main className="wide stack" style={{ gap: 24 }}>
        <header className="page-head">
          <div>
            <p className="eyebrow">Orator Curate</p>
            <h1>Your Topic Library</h1>
            <p className="lede">On each topic: based on these facts and sources, you observe, and you make your assertions. Topics are reused by every presentation you build.</p>
          </div>
        </header>

        <form className="add-box stack" style={{ gap: 10 }} onSubmit={create}>
          <strong>New topic</strong>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label style={{ flex: "2 1 240px" }}>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sabbath rest and health" />
            </label>
            <label style={{ flex: "1 1 200px" }}>
              Keywords
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="sabbath, rest, burnout" />
            </label>
          </div>
          <label>
            What it covers (optional)
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          {dupes.length > 0 && (
            <p className="small notice" style={{ margin: 0 }}>
              You already have {dupes.map((d, i) => <span key={d.topic.id}>{i > 0 && ", "}<Link href={`/curate/topics/${d.topic.id}`}>“{d.topic.name}”</Link></span>)}. Open it instead, unless this is a different topic.
            </p>
          )}
          <div className="row">
            <button className="primary" disabled={busy || name.trim().length < 2}>Create topic</button>
          </div>
        </form>

        <section className="stack" style={{ gap: 12 }}>
          <div className="row" style={{ alignItems: "baseline" }}>
            <h2 className="section-h" style={{ flex: 1 }}>Topics ({topics?.length ?? 0})</h2>
            <input aria-label="Find a topic" placeholder="Find by name or keyword" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 280 }} />
          </div>
          {error && <p className="notice" role="alert">{error}</p>}
          {topics === null ? (
            <p className="small muted">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="small muted">{topics.length ? "No topic matches." : "No topics yet. Create one above, or add topics while you discover."}</p>
          ) : (
            <div className="list-card">
              {shown.map((t) => {
                const c = counts[t.id];
                return (
                  <Link key={t.id} href={`/curate/topics/${t.id}`} className="list-row">
                    <span className="title">{t.name}</span>
                    <span className="meta">{[t.keywords.join(", "), c && `${c.sources} source${c.sources === 1 ? "" : "s"}`, c && `${c.assertions} assertion${c.assertions === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</span>
                    {c?.unsupported ? <span className="pill warn">{c.unsupported} unsupported</span> : null}
                    {c?.flags ? <span className="pill warn">{c.flags} to review</span> : null}
                    {t.owner_id !== me && <span className="pill navy">Shared with you</span>}
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function tally(topics: Topic[], links: TopicSource[], assertions: Assertion[], af: AssertionFact[], facts: Fact[], flags: ReviewFlag[]): Record<string, Counts> {
  const live = new Set(facts.filter((f) => f.status === "active").map((f) => f.id));
  const supported = new Set(af.filter((l) => live.has(l.fact_id)).map((l) => l.assertion_id));
  const flagged = new Set(flags.map((f) => f.object_id));
  return Object.fromEntries(
    topics.map((t) => {
      const mine = assertions.filter((a) => a.topic_id === t.id);
      return [t.id, { sources: links.filter((l) => l.topic_id === t.id).length, assertions: mine.length, unsupported: mine.filter((a) => !supported.has(a.id)).length, flags: mine.filter((a) => flagged.has(a.id)).length }];
    }),
  );
}
