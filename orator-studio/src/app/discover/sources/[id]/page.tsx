"use client";
/**
 * One source in the Body of Knowledge: its details, annotation (F-135), the
 * facts kept from it, the topics it bears on, whether others can discover it
 * (F-139), and discard. Discarding a fact or the source flags every assertion
 * that relies on it (F-138).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { knowledge } from "@/knowledge/client";
import type { Fact, Source, Topic, TopicSource } from "@/knowledge/types";
import { Annotation, annotatePrompt } from "@/ai/annotate";
import { askClaudeFor, claudeAvailable, ClaudeError } from "@/ai/analysis-client";
import { KIND_LABEL } from "@/discover/labels";
import { LinkToTopics } from "@/discover/LinkToTopics";

const where = (s: Source, page: number | null) => (page ? (s.page_labels?.[String(page)] ?? `p. ${page}`) : "");

function Discard({ label, onDiscard }: { label: string; onDiscard: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) return <button className="small ghost danger" onClick={() => setOpen(true)}>{label}</button>;
  return (
    <span className="discard-ask">
      <input aria-label="Why? (optional)" placeholder="Why? (optional)" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      <button className="small danger" onClick={() => { onDiscard(reason.trim() || "Discarded by the author"); setOpen(false); }}>Discard</button>
      <button className="small ghost" onClick={() => setOpen(false)}>Cancel</button>
    </span>
  );
}

export default function SourcePage() {
  const { id } = useParams<{ id: string }>();
  const k = knowledge();
  const [source, setSource] = useState<Source | null>(null);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [links, setLinks] = useState<TopicSource[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [uses, setUses] = useState(0);
  const [me, setMe] = useState("");
  const [annotation, setAnnotation] = useState("");
  const [newFact, setNewFact] = useState("");
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [hasClaude, setHasClaude] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s] = await k.db.select("sources", { id });
      if (!s) throw new Error("This source isn't in your Body of Knowledge.");
      const [f, l, user] = await Promise.all([k.factsOf([id]), k.db.select("topic_sources", { source_id: id }), k.userId()]);
      const [t, af] = await Promise.all([k.db.select("topics", { id: l.map((x) => x.topic_id) }), k.db.select("assertion_facts", { fact_id: f.map((x) => x.id) })]);
      setSource(s);
      setAnnotation(s.annotation);
      setFacts(f.sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || a.created_at.localeCompare(b.created_at)));
      setLinks(l);
      setTopics(t);
      setUses(new Set(af.map((x) => x.assertion_id)).size);
      setMe(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [k, id]);

  useEffect(() => {
    load();
    claudeAvailable().then((t) => setHasClaude(Boolean(t)));
  }, [load]);

  async function run(label: string, f: () => Promise<unknown>) {
    setBusy(label);
    setError("");
    try {
      await f();
      await load();
    } catch (e) {
      setError(e instanceof ClaudeError ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function draft() {
    if (!source) return;
    await run("Claude is drafting the annotation…", async () => {
      const req = { citation: source.citation || source.title, design: source.design ?? "", sample: source.sample ?? "", access: source.access ?? "", facts: facts.filter((f) => f.status === "active").map((f) => ({ text: f.text, kind: f.kind })) };
      const { value } = await askClaudeFor({
        prompt: annotatePrompt(req),
        parse: (raw) => {
          const r = Annotation.safeParse(raw);
          return r.success ? r.data : null;
        },
        route: "/api/discover/annotate",
        payload: req,
        key: "value",
      });
      await k.updateSource(source.id, { annotation: value.annotation, annotation_by: "claude" });
    });
  }

  if (!source)
    return (
      <>
        <TopBar />
        <main className="wide stack">{error ? <p className="notice">{error}</p> : <p className="small muted">Loading…</p>}</main>
      </>
    );

  const mine = source.owner_id === me;
  const active = facts.filter((f) => f.status === "active");
  const discarded = facts.filter((f) => f.status === "discarded");

  return (
    <>
      <TopBar>
        <Link href="/discover" className="small">← Discover</Link>
      </TopBar>
      <main className="wide stack" style={{ gap: 20 }}>
        <header className="stack" style={{ gap: 6 }}>
          <p className="eyebrow">{KIND_LABEL[source.kind]} · {source.origin === "discovered" ? "Discovered" : source.origin === "copied" ? "Copied from a public source" : source.origin === "ingested" ? "Ingested" : "Yours"}</p>
          <h1 style={{ margin: 0 }}>{source.title}</h1>
          {source.citation && source.citation !== source.title && <p className="small" style={{ margin: 0 }}>{source.citation}</p>}
          <p className="small muted" style={{ margin: 0 }}>
            {[source.design, source.sample, source.access === "abstract" ? "Only the abstract was read" : source.access === "typed" ? "Typed by you" : null].filter(Boolean).join(" · ")}
            {source.url && <> · <a href={source.url} target="_blank" rel="noopener noreferrer">View the original</a></>}
          </p>
          {source.status === "discarded" && <p className="notice small">Discarded: {source.discard_reason}. It isn&apos;t offered for new assertions.</p>}
          {uses > 0 && <p className="small" style={{ margin: 0 }}>Facts from this source back {uses} assertion{uses === 1 ? "" : "s"}.</p>}
        </header>
        {error && <p className="notice" role="alert">{error}</p>}
        {busy && <p className="small" role="status">{busy}</p>}

        <section className="stack" style={{ gap: 8 }}>
          <h2 className="section-h">Annotation</h2>
          <textarea rows={4} value={annotation} disabled={!mine} onChange={(e) => setAnnotation(e.target.value)} placeholder="What it found, how strong it is, and why it matters." />
          <div className="row">
            {mine && <button className="small primary" disabled={Boolean(busy) || annotation === source.annotation} onClick={() => run("Saving…", () => k.updateSource(source.id, { annotation, annotation_by: "author" }))}>Save</button>}
            {mine && hasClaude && active.length > 0 && <button className="small" disabled={Boolean(busy)} onClick={draft}>{source.annotation ? "Redraft with Claude" : "Draft with Claude"}</button>}
            {source.annotation_by === "claude" && <span className="small muted">Drafted by Claude from the facts below; edit it to make it yours.</span>}
          </div>
        </section>

        <section className="stack" style={{ gap: 8 }}>
          <h2 className="section-h">Facts ({active.length})</h2>
          {active.length === 0 && <p className="small muted">No facts kept from it yet.</p>}
          <ul className="fact-list">
            {active.map((f) => (
              <li key={f.id}>
                <span className="stack" style={{ gap: 2, flex: 1 }}>
                  <span>{f.kind !== "finding" && f.kind !== "note" && <span className={`finding-kind ${f.kind === "limitation" ? "limit" : ""}`}>{f.kind}</span>} {f.text}</span>
                  {f.quote && f.quote !== f.text && <span className="quote-line small">“{f.quote}” <span className="muted">{where(source, f.page)}</span></span>}
                  <span className={f.checked ? "verify ok" : "small muted"}>{f.checked ? "Checked against the source" : "Unchecked"}</span>
                </span>
                {mine && <Discard label="Discard" onDiscard={(r) => run("Discarding…", () => k.discardFact(f.id, r))} />}
              </li>
            ))}
          </ul>
          {mine && (
            <div className="row" style={{ alignItems: "flex-end" }}>
              <label className="small" style={{ flex: "1 1 260px" }}>
                Add a fact you noted from it (kept as unchecked)
                <input value={newFact} onChange={(e) => setNewFact(e.target.value)} />
              </label>
              <button className="small" disabled={newFact.trim().length < 3 || Boolean(busy)} onClick={() => run("Adding…", async () => { await k.addFacts(source.id, [{ kind: "note", text: newFact.trim(), checked: false }]); setNewFact(""); })}>Add</button>
            </div>
          )}
          {discarded.length > 0 && (
            <details>
              <summary className="small">Discarded facts ({discarded.length})</summary>
              <ul className="fact-list">
                {discarded.map((f) => (
                  <li key={f.id}>
                    <span style={{ flex: 1 }}><s>{f.text}</s> <span className="small muted">{f.discard_reason}</span></span>
                    {mine && <button className="small ghost" onClick={() => run("Restoring…", () => k.restoreFact(f.id))}>Restore</button>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="stack" style={{ gap: 8 }}>
          <h2 className="section-h">Topics</h2>
          {links.length === 0 ? <p className="small muted">Not linked to a topic yet.</p> : (
            <ul className="small">
              {links.map((l) => (
                <li key={l.topic_id}>
                  {topics.find((t) => t.id === l.topic_id)?.name ?? "A topic shared with you"} <span className="muted">{l.linked_by === "auto" ? "(linked when an assertion cited it)" : ""}</span>
                  {l.note && <> · {l.note}</>}
                </li>
              ))}
            </ul>
          )}
          {mine && source.status === "active" && (linking ? <LinkToTopics source={source} onDone={() => { setLinking(false); load(); }} /> : <button className="small" style={{ alignSelf: "flex-start" }} onClick={() => setLinking(true)}>Link to a topic</button>)}
        </section>

        {mine && (
          <section className="stack" style={{ gap: 8 }}>
            <h2 className="section-h">Sharing and discard</h2>
            <label className="inline small">
              <input type="checkbox" checked={source.is_public} disabled={Boolean(busy)} onChange={(e) => run("Saving…", () => k.updateSource(source.id, { is_public: e.target.checked }))} />
              Let others discover this source. They can take a copy of its citation and facts, from then on theirs; your files, topics and assertions are never shared.
            </label>
            <div className="row">
              {source.status === "active" ? <Discard label="Discard this source" onDiscard={(r) => run("Discarding…", () => k.discardSource(source.id, r))} /> : <button className="small" onClick={() => run("Restoring…", () => k.restoreSource(source.id))}>Restore this source</button>}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
