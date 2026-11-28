"use client";
/**
 * A topic in the Topic Library (Curate): the sources that bear on it, the
 * observations made about its facts (yours or Claude's, labeled), and the
 * assertions people make, each resting on facts that support, qualify or
 * contradict it. "On this topic, based on these facts and sources, I observe
 * the following and make this assertion."
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { knowledge } from "@/knowledge/client";
import type { TopicView } from "@/knowledge/repo";
import { describeEvidence, evidenceSummary, parseKeywords } from "@/knowledge/logic";
import type { Assertion, Fact, LinkRole, Observation, Source, Topic } from "@/knowledge/types";
import { askClaudeFor, claudeAvailable, ClaudeError } from "@/ai/analysis-client";
import { challengeQuestion, checkObservation, ObservationAnswer, observePrompt, SUMMARY_QUESTION } from "@/ai/observe";
import { AssertionComposer, FactLine, FactPicker, factRefs, ROLE_LABEL, ROLES } from "@/curate/parts";

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function TopicPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const k = knowledge();
  const [v, setV] = useState<TopicView | null>(null);
  const [library, setLibrary] = useState<Topic[]>([]);
  const [related, setRelated] = useState<string[]>([]);
  const [me, setMe] = useState("");
  const [hasClaude, setHasClaude] = useState(false);
  const [error, setError] = useState("");
  const [composing, setComposing] = useState<{ heading: string; prompt?: string; facts?: string[]; observation?: string; buildsOn?: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [view, user, lib, rel] = await Promise.all([k.topicView(id), k.userId(), k.listTopics(), k.db.select("topic_relations", { topic_id: id })]);
      setV(view);
      setMe(user);
      setLibrary(lib);
      setRelated(rel.map((r) => r.related_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [k, id]);
  useEffect(() => {
    load();
    claudeAvailable().then((t) => setHasClaude(Boolean(t)));
  }, [load]);

  const facts = useMemo(() => {
    if (!v) return [] as Fact[];
    const order = new Map(v.sources.map((s, i) => [s.id, i]));
    return [...v.facts].sort((a, b) => (order.get(a.source_id) ?? 0) - (order.get(b.source_id) ?? 0) || (a.page ?? 0) - (b.page ?? 0) || a.created_at.localeCompare(b.created_at));
  }, [v]);
  const refs = useMemo(() => factRefs(facts), [facts]);
  const srcOf = useMemo(() => new Map((v?.sources ?? []).map((s) => [s.id, s])), [v]);

  if (!v)
    return (
      <>
        <TopBar />
        <main className="wide stack">{error ? <p className="notice">{error}</p> : <p className="small muted">Loading…</p>}</main>
      </>
    );

  const t = v.topic;
  const canAdd = true; // The database refuses additions from viewers; collaborators' and viewers' controls come with sharing (F-137).
  const isOwner = t.owner_id === me;

  async function saveAssertion(text: string, links: { fact_id: string; role: LinkRole }[]) {
    await k.assert({ topic_id: id, text, origin: composing?.observation ? "from_observation" : "typed", observation_id: composing?.observation ?? null, builds_on: composing?.buildsOn ?? null }, links);
    setComposing(null);
    await load();
  }

  return (
    <>
      <TopBar>
        <Link href="/curate" className="small">← Topic Library</Link>
      </TopBar>
      <main className="wide stack" style={{ gap: 28 }}>
        <TopicHeader topic={t} isOwner={isOwner} library={library} related={related} onChange={load} onDeleted={() => router.push("/curate")} />
        {error && <p className="notice" role="alert">{error}</p>}
        <SourcesSection view={v} facts={facts} refs={refs} canAdd={canAdd} onChange={load} />
        <ObservationsSection
          view={v}
          facts={facts}
          refs={refs}
          srcOf={srcOf}
          hasClaude={hasClaude}
          canAdd={canAdd}
          onChange={load}
          onAssert={(o) => setComposing({ heading: "Do you agree? How would you say this?", prompt: "Write the assertion yourself. The facts this observation cited are chosen below; change them as you see fit.", facts: o.fact_ids, observation: o.id })}
        />
        <section className="stack" style={{ gap: 12 }} aria-labelledby="as-h">
          <div className="row" style={{ alignItems: "baseline" }}>
            <h2 id="as-h" className="section-h" style={{ flex: 1 }}>Assertions ({v.assertions.length})</h2>
            {canAdd && !composing && <button className="small primary" onClick={() => setComposing({ heading: "A new assertion" })}>Make an assertion</button>}
          </div>
          {composing && <AssertionComposer heading={composing.heading} prompt={composing.prompt} startFacts={composing.facts} topicFacts={facts} topicSources={v.sources} refs={refs} onSave={saveAssertion} onCancel={() => setComposing(null)} />}
          {v.assertions.length === 0 && !composing && <p className="small muted">No assertions yet. Make one, or start from an observation.</p>}
          {v.assertions.map((a) => (
            <AssertionCard
              key={a.id}
              a={a}
              view={v}
              me={me}
              refs={refs}
              topicFacts={facts}
              srcOf={srcOf}
              onChange={load}
              onEnhance={() => setComposing({ heading: "An enhanced assertion, building on this one", prompt: `Building on: “${a.text}”. Write your own version; it stays yours, credited as building on theirs.`, buildsOn: a.id, facts: v.assertionFacts.filter((l) => l.assertion_id === a.id).map((l) => l.fact_id) })}
            />
          ))}
        </section>
      </main>
    </>
  );
}

function TopicHeader({ topic, isOwner, library, related, onChange, onDeleted }: { topic: Topic; isOwner: boolean; library: Topic[]; related: string[]; onChange: () => void; onDeleted: () => void }) {
  const k = knowledge();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(topic.name);
  const [description, setDescription] = useState(topic.description);
  const [keywords, setKeywords] = useState(topic.keywords.join(", "));
  const [relate, setRelate] = useState("");
  const [confirming, setConfirming] = useState(false);
  const rel = library.filter((x) => related.includes(x.id));
  const others = library.filter((x) => x.id !== topic.id && !related.includes(x.id));
  return (
    <header className="stack" style={{ gap: 8 }}>
      <p className="eyebrow">Topic</p>
      {editing ? (
        <div className="stack" style={{ gap: 8 }}>
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>What it covers<input value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <label>Keywords<input value={keywords} onChange={(e) => setKeywords(e.target.value)} /></label>
          <div className="row">
            <button className="small primary" disabled={name.trim().length < 2} onClick={async () => { await k.updateTopic(topic.id, { name: name.trim(), description: description.trim(), keywords: parseKeywords(keywords) }); setEditing(false); onChange(); }}>Save</button>
            <button className="small ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <h1 style={{ margin: 0 }}>{topic.name}</h1>
          {topic.description && <p className="lede" style={{ margin: 0 }}>{topic.description}</p>}
          <p className="small muted" style={{ margin: 0 }}>
            {topic.keywords.length ? `Keywords: ${topic.keywords.join(", ")}` : "No keywords yet"}
            {rel.length > 0 && <> · Related: {rel.map((r, i) => <span key={r.id}>{i > 0 && ", "}<Link href={`/curate/topics/${r.id}`}>{r.name}</Link></span>)}</>}
          </p>
          <div className="row">
            <button className="small ghost" onClick={() => setEditing(true)}>Edit topic</button>
            {others.length > 0 && (
              <span className="row" style={{ gap: 6 }}>
                <select aria-label="Related topic" value={relate} onChange={(e) => setRelate(e.target.value)} style={{ width: "auto", minHeight: 32, fontSize: 13 }}>
                  <option value="">Relate to another topic…</option>
                  {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                {relate && <button className="small" onClick={async () => { await k.relateTopics(topic.id, relate); setRelate(""); onChange(); }}>Relate</button>}
              </span>
            )}
            <Link className="small" href={`/discover?q=${encodeURIComponent(topic.name)}`}>Find evidence for this topic</Link>
            <span className="spacer" />
            {isOwner && (confirming ? (
              <span className="discard-ask">
                <span className="small">Delete the topic with its observations and assertions? Sources stay in your Body of Knowledge.</span>
                <button className="small danger" onClick={async () => { await k.deleteTopic(topic.id); onDeleted(); }}>Delete</button>
                <button className="small ghost" onClick={() => setConfirming(false)}>Cancel</button>
              </span>
            ) : <button className="small ghost danger" onClick={() => setConfirming(true)}>Delete topic</button>)}
          </div>
        </>
      )}
    </header>
  );
}

function SourcesSection({ view, facts, refs, canAdd, onChange }: { view: TopicView; facts: Fact[]; refs: Map<string, string>; canAdd: boolean; onChange: () => void }) {
  const k = knowledge();
  const [adding, setAdding] = useState(false);
  const [mine, setMine] = useState<Source[] | null>(null);
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => {
    if (adding && !mine) k.listSources("active").then(setMine).catch(() => setMine([]));
  }, [adding, mine, k]);
  const linked = new Set(view.links.map((l) => l.source_id));
  const candidates = (mine ?? []).filter((s) => !linked.has(s.id) && (!q.trim() || `${s.title} ${s.citation}`.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 30);
  return (
    <section className="stack" style={{ gap: 12 }} aria-labelledby="src-h">
      <div className="row" style={{ alignItems: "baseline" }}>
        <h2 id="src-h" className="section-h" style={{ flex: 1 }}>Sources ({view.sources.length})</h2>
        {canAdd && <button className="small" onClick={() => setAdding((x) => !x)}>{adding ? "Close" : "Link a source from your Body of Knowledge"}</button>}
      </div>
      {adding && (
        <div className="add-box stack" style={{ gap: 8 }}>
          <input aria-label="Find a source" placeholder="Find a source by words" value={q} onChange={(e) => setQ(e.target.value)} />
          {mine === null ? <p className="small muted">Loading…</p> : candidates.length === 0 ? <p className="small muted">Nothing to link. <Link href="/discover">Find evidence in Discover.</Link></p> : (
            <ul className="fact-list">
              {candidates.map((s) => (
                <li key={s.id}>
                  <span style={{ flex: 1 }}>{s.title} <span className="small muted">{s.year}</span></span>
                  <button className="small" onClick={async () => { await k.linkSource(view.topic.id, s.id); onChange(); }}>Link</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {view.sources.length === 0 && !adding && <p className="small muted">No sources linked yet. Link one from your Body of Knowledge, or <Link href={`/discover?q=${encodeURIComponent(view.topic.name)}`}>find evidence</Link>.</p>}
      {view.sources.map((s) => {
        const link = view.links.find((l) => l.source_id === s.id)!;
        const fs = facts.filter((f) => f.source_id === s.id && f.status === "active");
        const note = notes[s.id] ?? link.note;
        return (
          <details key={s.id} className="source-card">
            <summary>
              <strong>{s.short || s.title}</strong> <span className="small muted">{s.title !== s.short ? s.title : ""} · {fs.length} fact{fs.length === 1 ? "" : "s"}{s.status === "discarded" ? " · discarded" : ""}{link.linked_by === "auto" ? " · linked when an assertion cited it" : ""}</span>
            </summary>
            <div className="stack" style={{ gap: 8, marginTop: 8 }}>
              {s.annotation && <p className="small" style={{ margin: 0 }}>{s.annotation}</p>}
              <label className="small">
                Why it matters to this topic
                <span className="row" style={{ flexWrap: "nowrap" }}>
                  <input value={note} onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))} disabled={!canAdd} />
                  {canAdd && note !== link.note && <button className="small" onClick={async () => { await k.setSourceNote(view.topic.id, s.id, note); onChange(); }}>Save</button>}
                </span>
              </label>
              <ul className="fact-list">
                {fs.map((f) => <li key={f.id}><FactLine f={f} refId={refs.get(f.id)} source={s} /></li>)}
              </ul>
              <div className="row">
                <Link className="small" href={`/discover/sources/${s.id}`}>Open the source</Link>
                {canAdd && <button className="small ghost" onClick={async () => { await k.unlinkSource(view.topic.id, s.id); onChange(); }}>Unlink from this topic</button>}
              </div>
            </div>
          </details>
        );
      })}
    </section>
  );
}

function ObservationsSection({ view, facts, refs, srcOf, hasClaude, canAdd, onChange, onAssert }: { view: TopicView; facts: Fact[]; refs: Map<string, string>; srcOf: Map<string, Source>; hasClaude: boolean; canAdd: boolean; onChange: () => void; onAssert: (o: Observation) => void }) {
  const k = knowledge();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [own, setOwn] = useState<{ text: string; facts: Map<string, LinkRole> } | null>(null);
  const live = facts.filter((f) => f.status === "active");
  const byRef = new Map([...refs].map(([fid, r]) => [r, fid]));

  async function ask(q: string) {
    setBusy("Claude is reading the facts…");
    setError("");
    try {
      const req = {
        topic: view.topic.name,
        description: view.topic.description,
        question: q,
        facts: live.map((f) => ({ ref: refs.get(f.id)!, text: f.text, source: srcOf.get(f.source_id)?.short ?? "", kind: f.kind, checked: f.checked })),
        assertions: view.assertions.map((a) => a.text),
      };
      const { value } = await askClaudeFor({
        prompt: observePrompt(req),
        parse: (raw) => {
          const r = ObservationAnswer.safeParse(raw);
          return r.success ? r.data : null;
        },
        route: "/api/curate/observe",
        payload: req,
        key: "value",
      });
      const checked = checkObservation(value, req.facts);
      await k.addObservation({
        topic_id: view.topic.id,
        made_by: "claude",
        text: value.observation + (value.gaps.length ? `\n\nNot covered by these facts: ${value.gaps.join("; ")}.` : ""),
        general_knowledge: value.general_knowledge?.trim() || null,
        fact_ids: checked.cites.map((r) => byRef.get(r)!).filter(Boolean),
        question: q || SUMMARY_QUESTION,
        problems: checked.problems,
      });
      setQuestion("");
      onChange();
    } catch (e) {
      setError(e instanceof ClaudeError ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="stack" style={{ gap: 12 }} aria-labelledby="obs-h">
      <div className="row" style={{ alignItems: "baseline" }}>
        <h2 id="obs-h" className="section-h" style={{ flex: 1 }}>Observations ({view.observations.length})</h2>
        {canAdd && !own && <button className="small" onClick={() => setOwn({ text: "", facts: new Map() })}>Add your observation</button>}
      </div>
      {canAdd && hasClaude && (
        <div className="add-box stack" style={{ gap: 8 }}>
          <span className="small"><strong>Ask Claude</strong> about this topic&apos;s {live.length} fact{live.length === 1 ? "" : "s"}. It answers from them, citing each, and labels anything it adds from general knowledge.</span>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <input aria-label="Your question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What do these studies say about older adults?" style={{ flex: "1 1 260px" }} />
            <button className="small primary" disabled={Boolean(busy) || question.trim().length < 3 || !live.length} onClick={() => ask(question.trim())}>Ask</button>
          </div>
          <div className="row">
            <button className="small" disabled={Boolean(busy) || !live.length} onClick={() => ask(SUMMARY_QUESTION)}>What do the facts show?</button>
            {view.assertions.length > 0 && (
              <select aria-label="Challenge an assertion" disabled={Boolean(busy) || !live.length} value="" onChange={(e) => e.target.value && ask(challengeQuestion(e.target.value))} style={{ width: "auto", minHeight: 36, fontSize: 14 }}>
                <option value="">Challenge an assertion…</option>
                {view.assertions.map((a) => <option key={a.id} value={a.text}>{a.text.slice(0, 80)}</option>)}
              </select>
            )}
          </div>
          {!live.length && <p className="small muted" style={{ margin: 0 }}>Link sources with facts to this topic first.</p>}
          {busy && <p className="small" role="status" style={{ margin: 0 }}>{busy}</p>}
          {error && <p className="small error" role="alert" style={{ margin: 0 }}>{error}</p>}
        </div>
      )}
      {own && (
        <div className="add-box stack" style={{ gap: 8 }}>
          <label>
            What you notice in the facts
            <textarea rows={2} value={own.text} onChange={(e) => setOwn({ ...own, text: e.target.value })} />
          </label>
          <details>
            <summary className="small">Facts it draws on ({own.facts.size})</summary>
            <div style={{ marginTop: 8 }}><FactPicker topicFacts={facts} topicSources={view.sources} chosen={own.facts} onChange={(m) => setOwn({ ...own, facts: m })} refs={refs} /></div>
          </details>
          <div className="row">
            <button className="small primary" disabled={own.text.trim().length < 3} onClick={async () => { await k.addObservation({ topic_id: view.topic.id, made_by: "author", text: own.text.trim(), fact_ids: [...own.facts.keys()] }); setOwn(null); onChange(); }}>Save observation</button>
            <button className="small ghost" onClick={() => setOwn(null)}>Cancel</button>
          </div>
        </div>
      )}
      {view.observations.length === 0 && !own && <p className="small muted">No observations yet.</p>}
      {view.observations.map((o) => (
        <article key={o.id} className={`observation ${o.made_by}`}>
          <header className="row small" style={{ gap: 8 }}>
            <span className={o.made_by === "claude" ? "pill navy" : "pill ok"}>{o.made_by === "claude" ? "Claude observed" : "You observed"}</span>
            <span className="muted">{when(o.created_at)}</span>
            {o.question && o.question !== SUMMARY_QUESTION && <span className="muted">· asked: “{o.question.slice(0, 120)}”</span>}
          </header>
          <p style={{ margin: "6px 0", whiteSpace: "pre-line" }}>{o.text}</p>
          {o.general_knowledge && (
            <p className="small general-knowledge" style={{ margin: "6px 0" }}>
              <strong>Claude&apos;s general knowledge, not from your sources:</strong> {o.general_knowledge}
            </p>
          )}
          {o.problems.length > 0 && <p className="small warn-text" style={{ margin: "6px 0" }}>Checks found: {o.problems.join("; ")}. Read it with care.</p>}
          {o.fact_ids.length > 0 && <p className="small muted" style={{ margin: 0 }}>Draws on {o.fact_ids.map((f) => refs.get(f) ?? "a fact no longer here").join(", ")}</p>}
          {canAdd && (
            <div className="row" style={{ marginTop: 6 }}>
              <button className="small primary" onClick={() => onAssert(o)}>Do you agree? Make an assertion</button>
              <button className="small ghost" onClick={async () => { await k.deleteObservation(o.id); onChange(); }}>Remove</button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}

function AssertionCard({ a, view, me, refs, topicFacts, srcOf, onChange, onEnhance }: { a: Assertion; view: TopicView; me: string; refs: Map<string, string>; topicFacts: Fact[]; srcOf: Map<string, Source>; onChange: () => void; onEnhance: () => void }) {
  const k = knowledge();
  const mine = a.author_id === me;
  const links = view.assertionFacts.filter((l) => l.assertion_id === a.id);
  const factById = new Map(view.facts.map((f) => [f.id, f]));
  const [extra, setExtra] = useState<Map<string, Fact>>(new Map());
  const asked = useRef<Set<string>>(new Set());
  const [revising, setRevising] = useState(false);
  const [text, setText] = useState(a.text);
  const [linking, setLinking] = useState(false);
  const [chosen, setChosen] = useState<Map<string, LinkRole>>(new Map());
  const flags = view.flags.filter((f) => f.object_id === a.id);
  const base = view.assertions.find((x) => x.id === a.builds_on);

  // Facts cited from outside this topic's sources are loaded on demand.
  useEffect(() => {
    const missing = links.map((l) => l.fact_id).filter((fid) => !factById.has(fid) && !asked.current.has(fid));
    if (!missing.length) return;
    missing.forEach((fid) => asked.current.add(fid));
    k.db.select("facts", { id: missing }).then((fs) => setExtra((x) => new Map([...x, ...fs.map((f) => [f.id, f] as [string, Fact])])));
  }, [links, factById, k]);
  const allFacts = new Map([...factById, ...extra]);
  const summary = describeEvidence(evidenceSummary(links, allFacts, srcOf));

  return (
    <article className={`assertion-card${flags.length ? " flagged" : ""}${a.still_held ? "" : " withdrawn"}`}>
      <div className="row small" style={{ gap: 8 }}>
        <span className="pill">{mine ? "Your assertion" : "A collaborator's assertion"}</span>
        {a.origin === "from_observation" && <span className="muted">from an observation</span>}
        {a.origin === "own_writing" && <span className="muted">from your writing</span>}
        {!a.still_held && <span className="pill warn">No longer held</span>}
      </div>
      {base && <p className="small muted" style={{ margin: "4px 0 0" }}>Builds on: “{base.text}”</p>}
      {revising ? (
        <div className="stack" style={{ gap: 6, marginTop: 6 }}>
          <textarea className="serif-input" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row">
            <button className="small primary" disabled={text.trim().length < 3} onClick={async () => { await k.reviseAssertion(a.id, { text: text.trim() }); setRevising(false); onChange(); }}>Save</button>
            <button className="small ghost" onClick={() => { setText(a.text); setRevising(false); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <p className="assertion-text">{a.text}</p>
      )}
      <p className={`small ${links.length ? "" : "warn-text"}`} style={{ margin: "0 0 6px" }}>{summary}</p>
      {flags.map((f) => (
        <p key={f.id} className="small notice" style={{ margin: "0 0 6px" }}>
          To review: {f.reason}
          {mine && <button className="small ghost" style={{ marginLeft: 8 }} onClick={async () => { await k.resolveFlag(f.id); onChange(); }}>Reviewed</button>}
        </p>
      ))}
      {links.length > 0 && (
        <details>
          <summary className="small">The facts it rests on ({links.length})</summary>
          <ul className="fact-list" style={{ marginTop: 6 }}>
            {links.map((l) => {
              const f = allFacts.get(l.fact_id);
              return (
                <li key={l.fact_id}>
                  <span style={{ flex: 1 }}>{f ? <FactLine f={f} refId={refs.get(f.id)} source={srcOf.get(f.source_id)} /> : <span className="small muted">A fact you can&apos;t see</span>}</span>
                  {mine ? (
                    <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                      <select aria-label="How it bears on the assertion" value={l.role} onChange={async (e) => { await k.setLinkRole(a.id, l.fact_id, e.target.value as LinkRole); onChange(); }} style={{ width: "auto", minHeight: 32, fontSize: 13 }}>
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                      <button className="small ghost" aria-label="Unlink this fact" onClick={async () => { await k.unlinkFact(a.id, l.fact_id); onChange(); }}>×</button>
                    </span>
                  ) : (
                    <span className={`role-chip ${l.role}`}>{ROLE_LABEL[l.role]}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {linking && (
        <div className="stack" style={{ gap: 8, marginTop: 8 }}>
          <FactPicker topicFacts={topicFacts.filter((f) => !links.some((l) => l.fact_id === f.id))} topicSources={view.sources} chosen={chosen} onChange={setChosen} refs={refs} />
          <div className="row">
            <button className="small primary" disabled={!chosen.size} onClick={async () => { for (const [fid, role] of chosen) await k.linkFact(a.id, fid, role); setChosen(new Map()); setLinking(false); onChange(); }}>Link {chosen.size} fact{chosen.size === 1 ? "" : "s"}</button>
            <button className="small ghost" onClick={() => setLinking(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="row" style={{ marginTop: 6 }}>
        {mine ? (
          <>
            {!linking && <button className="small" onClick={() => setLinking(true)}>Link facts</button>}
            {!revising && <button className="small ghost" onClick={() => setRevising(true)}>Revise</button>}
            <button className="small ghost" onClick={async () => { await k.reviseAssertion(a.id, { still_held: !a.still_held }); onChange(); }}>{a.still_held ? "I no longer hold this" : "I hold this again"}</button>
            <span className="spacer" />
            <button className="small ghost danger" onClick={async () => { await k.deleteAssertion(a.id); onChange(); }}>Delete</button>
          </>
        ) : (
          <button className="small" onClick={onEnhance}>Write an enhanced assertion</button>
        )}
      </div>
    </article>
  );
}
