"use client";
/**
 * A presentation (Build, F-136): its purpose and audience, a series of topics
 * from the Topic Library, and in each the assertions that suit this purpose
 * and audience, in order. New topics and assertions can be written here; they
 * go into the Topic Library, and a new assertion with no facts is unsupported
 * until investigated in Curate. Then draft the slides.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { knowledge } from "@/knowledge/client";
import type { PresentationView, TopicView } from "@/knowledge/repo";
import { describeEvidence, evidenceSummary, parseKeywords, similarTopics } from "@/knowledge/logic";
import type { Assertion, LinkRole, Topic } from "@/knowledge/types";
import { AssertionComposer, factRefs } from "@/curate/parts";
import { draftFromPresentation } from "@/build/fromPresentation";
import { MINUTES_PER_SLIDE, slidesFor } from "@/build/fromArgument";
import { applyOp, makeOp, type OpBody, type Operation } from "@/model/ops";
import { emptyDeck } from "@/model/factory";
import type { Author } from "@/model/types";
import { currentAuthorId, getRepo } from "@/lib/repo";

const move = <T,>(xs: T[], i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= xs.length) return xs;
  const out = [...xs];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};

export default function PresentationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const k = knowledge();
  const [v, setV] = useState<PresentationView | null>(null);
  const [library, setLibrary] = useState<Topic[]>([]);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const [view, lib] = await Promise.all([k.presentationView(id), k.listTopics()]);
      const all = Object.values(view.available).flat();
      const flags = await k.openFlags("assertion", all.map((a) => a.id));
      setV(view);
      setLibrary(lib);
      setFlagged(new Set(flags.map((f) => f.object_id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [k, id]);
  useEffect(() => {
    load();
  }, [load]);

  async function run(label: string, f: () => Promise<unknown>) {
    setBusy(label);
    setError("");
    try {
      await f();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  if (!v)
    return (
      <>
        <TopBar />
        <main className="wide stack">{error ? <p className="notice">{error}</p> : <p className="small muted">Loading…</p>}</main>
      </>
    );

  const topicIds = v.topics.map((t) => t.id);
  const setTopics = (ids: string[]) => run("Saving…", () => k.setTopics(id, ids));
  const setChosen = (topicId: string, ids: string[]) => run("Saving…", () => k.setAssertions(id, topicId, ids));

  return (
    <>
      <TopBar>
        <Link href="/build" className="small">← Build</Link>
      </TopBar>
      <main className="wide stack" style={{ gap: 24 }}>
        <Details v={v} onSave={(patch) => run("Saving…", () => k.updatePresentation(id, patch))} onDelete={() => run("Deleting…", async () => { await k.deletePresentation(id); router.push("/build"); })} />
        {busy && <p className="small" role="status">{busy}</p>}
        {error && <p className="notice" role="alert">{error}</p>}
        {v.flags.length > 0 && (
          <section className="notice stack" style={{ gap: 6 }}>
            <strong>To review</strong>
            {v.flags.map((f) => (
              <span key={f.id} className="row small" style={{ gap: 8 }}>
                <span style={{ flex: 1 }}>{f.reason}</span>
                <button className="small ghost" onClick={() => run("Saving…", () => k.resolveFlag(f.id))}>Reviewed</button>
              </span>
            ))}
          </section>
        )}

        <section className="stack" style={{ gap: 14 }} aria-labelledby="topics-h">
          <h2 id="topics-h" className="section-h">Topics, in order ({v.topics.length})</h2>
          {v.topics.length === 0 && <p className="small muted">Add the topics this presentation covers. Each brings its assertions; choose the ones that suit this purpose and audience.</p>}
          {v.topics.map((t, i) => (
            <TopicBlock
              key={t.id}
              index={i}
              count={v.topics.length}
              topic={t}
              v={v}
              flagged={flagged}
              onMove={(d) => setTopics(move(topicIds, i, d))}
              onRemove={() => setTopics(topicIds.filter((x) => x !== t.id))}
              onChosen={(ids) => setChosen(t.id, ids)}
              onChange={load}
            />
          ))}
          <AddTopic library={library} chosen={topicIds} onAdd={(tid) => setTopics([...topicIds, tid])} />
        </section>

        <Draft v={v} flagged={flagged} />
      </main>
    </>
  );
}

function Details({ v, onSave, onDelete }: { v: PresentationView; onSave: (p: { title: string; purpose: string; audience: string; minutes: number | null }) => void; onDelete: () => void }) {
  const p = v.presentation;
  const [title, setTitle] = useState(p.title);
  const [purpose, setPurpose] = useState(p.purpose);
  const [audience, setAudience] = useState(p.audience);
  const [minutes, setMinutes] = useState(p.minutes ? String(p.minutes) : "");
  const [confirming, setConfirming] = useState(false);
  const changed = title !== p.title || purpose !== p.purpose || audience !== p.audience || (minutes ? Number(minutes) : null) !== p.minutes;
  return (
    <header className="stack" style={{ gap: 8 }}>
      <p className="eyebrow">Presentation</p>
      <input className="title-input-plain" aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="row" style={{ alignItems: "flex-end" }}>
        <label style={{ flex: "2 1 260px" }}>
          Purpose
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="What should happen because of it?" />
        </label>
        <label style={{ flex: "1 1 200px" }}>
          Audience
          <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Who will hear it?" />
        </label>
        <label style={{ flex: "0 0 120px" }}>
          Minutes
          <input type="number" min={1} max={240} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <button className="small primary" disabled={!changed || title.trim().length < 1} onClick={() => onSave({ title: title.trim(), purpose: purpose.trim(), audience: audience.trim(), minutes: minutes ? Math.max(1, Math.min(240, Number(minutes))) : null })}>Save</button>
        <span className="spacer" />
        {confirming ? (
          <span className="discard-ask">
            <span className="small">Delete this presentation? Its topics and assertions stay in your library.</span>
            <button className="small danger" onClick={onDelete}>Delete</button>
            <button className="small ghost" onClick={() => setConfirming(false)}>Cancel</button>
          </span>
        ) : (
          <button className="small ghost danger" onClick={() => setConfirming(true)}>Delete presentation</button>
        )}
      </div>
    </header>
  );
}

function AssertionRow({ a, v, flagged, children }: { a: Assertion; v: PresentationView; flagged: Set<string>; children?: React.ReactNode }) {
  const links = v.assertionFacts.filter((l) => l.assertion_id === a.id);
  const summary = describeEvidence(evidenceSummary(links, new Map(v.facts.map((f) => [f.id, f])), new Map(v.sources.map((s) => [s.id, s]))));
  return (
    <li className="build-assertion">
      <span className="stack" style={{ gap: 2, flex: 1 }}>
        <span className="assertion-line">{a.text}</span>
        <span className={`small ${links.length ? "muted" : "warn-text"}`}>{summary}</span>
        {flagged.has(a.id) && <span className="small warn-text">Evidence changed: review in Curate</span>}
        {!a.still_held && <span className="small warn-text">Marked as no longer held</span>}
      </span>
      {children}
    </li>
  );
}

function TopicBlock({ index, count, topic, v, flagged, onMove, onRemove, onChosen, onChange }: { index: number; count: number; topic: Topic; v: PresentationView; flagged: Set<string>; onMove: (d: number) => void; onRemove: () => void; onChosen: (ids: string[]) => void; onChange: () => void }) {
  const k = knowledge();
  const chosen = v.chosen[topic.id] ?? [];
  const ids = chosen.map((a) => a.id);
  const others = (v.available[topic.id] ?? []).filter((a) => !ids.includes(a.id));
  const [writing, setWriting] = useState<TopicView | null>(null);
  return (
    <article className="build-topic">
      <header className="row" style={{ alignItems: "baseline" }}>
        <span className="num-badge">{index + 1}</span>
        <h3 style={{ margin: 0, flex: 1 }}><Link href={`/curate/topics/${topic.id}`}>{topic.name}</Link></h3>
        <button className="small ghost" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
        <button className="small ghost" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>↓</button>
        <button className="small ghost" onClick={onRemove}>Remove</button>
      </header>
      {chosen.length === 0 && <p className="small muted">No assertions chosen from this topic yet.</p>}
      <ol className="build-list">
        {chosen.map((a, i) => (
          <AssertionRow key={a.id} a={a} v={v} flagged={flagged}>
            <span className="row" style={{ gap: 2, flexWrap: "nowrap" }}>
              <button className="small ghost" aria-label="Move up" disabled={i === 0} onClick={() => onChosen(move(ids, i, -1))}>↑</button>
              <button className="small ghost" aria-label="Move down" disabled={i === chosen.length - 1} onClick={() => onChosen(move(ids, i, 1))}>↓</button>
              <button className="small ghost" onClick={() => onChosen(ids.filter((x) => x !== a.id))}>Leave out</button>
            </span>
          </AssertionRow>
        ))}
      </ol>
      {others.length > 0 && (
        <details>
          <summary className="small">More assertions on this topic ({others.length})</summary>
          <ul className="build-list">
            {others.map((a) => (
              <AssertionRow key={a.id} a={a} v={v} flagged={flagged}>
                <button className="small" onClick={() => onChosen([...ids, a.id])}>Use</button>
              </AssertionRow>
            ))}
          </ul>
        </details>
      )}
      {writing ? (
        <AssertionComposer
          heading={`A new assertion on “${topic.name}”`}
          prompt="It goes into this topic in your library. With no facts it is unsupported; investigate it in Curate."
          topicFacts={writing.facts}
          topicSources={writing.sources}
          refs={factRefs(writing.facts)}
          onSave={async (text, links: { fact_id: string; role: LinkRole }[]) => {
            const a = await k.assert({ topic_id: topic.id, text }, links);
            await k.setAssertions(v.presentation.id, topic.id, [...ids, a.id]);
            setWriting(null);
            onChange();
          }}
          onCancel={() => setWriting(null)}
        />
      ) : (
        <button className="small" style={{ alignSelf: "flex-start" }} onClick={async () => setWriting(await k.topicView(topic.id))}>Write a new assertion here</button>
      )}
    </article>
  );
}

function AddTopic({ library, chosen, onAdd }: { library: Topic[]; chosen: string[]; onAdd: (id: string) => void }) {
  const k = knowledge();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [keywords, setKeywords] = useState("");
  const available = library.filter((t) => !chosen.includes(t.id));
  const matches = q.trim() ? similarTopics(q, [], available, 0.3).map((x) => x.topic) : available.slice(0, 8);
  const dupes = useMemo(() => (q.trim() ? similarTopics(q, parseKeywords(keywords), library) : []), [q, keywords, library]);
  return (
    <div className="add-box stack" style={{ gap: 8 }}>
      <strong>Add a topic</strong>
      <input aria-label="Find or name a topic" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a topic in your library, or name a new one" />
      {matches.length > 0 && (
        <div className="row">
          {matches.map((t) => <button key={t.id} className="small" onClick={() => { onAdd(t.id); setQ(""); }}>{t.name}</button>)}
        </div>
      )}
      {q.trim().length > 1 && (
        creating ? (
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="small" style={{ flex: "1 1 200px" }}>
              Keywords for “{q.trim()}”
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} />
            </label>
            <button className="small primary" onClick={async () => { const t = await k.createTopic({ name: q.trim(), keywords: parseKeywords(keywords) }); onAdd(t.id); setQ(""); setKeywords(""); setCreating(false); }}>Create and add</button>
          </div>
        ) : (
          <button className="small ghost" style={{ alignSelf: "flex-start" }} onClick={() => setCreating(true)}>Create “{q.trim()}” as a new topic</button>
        )
      )}
      {creating && dupes.length > 0 && <p className="small notice" style={{ margin: 0 }}>You already have {dupes.map((d) => `“${d.topic.name}”`).join(", ")}. Add it instead, unless this is a different topic.</p>}
    </div>
  );
}

function Draft({ v, flagged }: { v: PresentationView; flagged: Set<string> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const draft = useMemo(() => draftFromPresentation(v, flagged), [v, flagged]);
  const minutes = v.presentation.minutes ?? 20;
  const fits = slidesFor(minutes);
  const chosen = Object.values(v.chosen).flat();
  const unsupported = chosen.filter((a) => !v.assertionFacts.some((l) => l.assertion_id === a.id)).length;

  async function create() {
    setBusy(true);
    setError("");
    try {
      const repo = getRepo();
      const me: Author = { kind: "human", id: await currentAuthorId() };
      const p = v.presentation;
      const bodies: OpBody[] = [
        { kind: "deck.setMeta", patch: { title: p.title, goal: p.purpose, audience: p.audience, takeaway: "", timeLimitMin: minutes, presentationId: p.id } },
        ...draft.narrative.map((slide, index) => ({ kind: "slide.insert" as const, slide, section: "narrative" as const, index })),
        ...draft.backup.map((slide, index) => ({ kind: "slide.insert" as const, slide, section: "backup" as const, index })),
      ];
      let deck = emptyDeck({}, await repo.tenantId());
      const log: Operation[] = bodies.map((b) => makeOp(b, me, "Drafted from the presentation"));
      for (const op of log) deck = applyOp(deck, op);
      await repo.save(deck, log, true);
      router.push(`/decks/${deck.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <section className="add-box stack" style={{ gap: 8 }} aria-labelledby="draft-h">
      <h2 id="draft-h" className="section-h" style={{ margin: 0 }}>Draft the slides</h2>
      <p className="small" style={{ margin: 0 }}>
        {draft.narrative.length} slides in the talk ({chosen.length} assertion{chosen.length === 1 ? "" : "s"}, a title slide{v.topics.length > 1 ? ", a slide per topic" : ""} and the sources), {draft.backup.length} backup slide{draft.backup.length === 1 ? "" : "s"} from assertions left out.
        {" "}At about {MINUTES_PER_SLIDE} minutes a slide, {minutes} minutes fits about {fits}.
      </p>
      {draft.narrative.length > fits && <p className="small warn-text" style={{ margin: 0 }}>That&apos;s more than fits: leave some assertions out, or allow more time.</p>}
      {unsupported > 0 && <p className="small warn-text" style={{ margin: 0 }}>{unsupported} chosen assertion{unsupported === 1 ? " is" : "s are"} unsupported; the slides will say so until evidence is linked in Curate.</p>}
      {error && <p className="small error" role="alert">{error}</p>}
      <div className="row">
        <button className="primary" disabled={busy || chosen.length === 0} onClick={create}>{busy ? "Drafting…" : "Draft the slides"}</button>
      </div>
    </section>
  );
}
