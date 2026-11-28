"use client";
/**
 * Add a Bible passage (F-123). NIV, NKJV and NLT come through API.Bible under
 * its non-commercial license, with KJV (public domain); The Passion
 * Translation is typed by the author and labeled as a paraphrase.
 *
 * API.Bible's terms, built in: the version's copyright with every passage, a
 * visible link to api.bible, the text never altered, usage reported through
 * its tracker (FUMS), and stored text fetched again within 30 days
 * (useScriptureRefresh).
 */
import { useEffect, useRef, useState } from "react";
import { PassageIdeas, passagePrompt } from "@/ai/passages";
import { askClaudeFor, claudeAvailable, ClaudeError } from "@/ai/analysis-client";
import { nextId, type ArgOpBody, type Argument, type Fact, type WorkspaceSource } from "@/model/argument";
import { formatReference, needsRefresh, parseReference, TPT_NOTICE, VERSIONS, type Passage, type Version } from "@/find/bible";
import { post } from "./FindSources";
import { WordStudy } from "./WordStudy";

type Choice = Version | "TPT";

/** API.Bible's usage tracker, loaded once; every displayed passage is reported (its terms require it in web apps). */
function reportView(token?: string) {
  if (!token || typeof window === "undefined") return;
  const w = window as unknown as { fums?: (...a: unknown[]) => void; fumsData?: unknown[] };
  if (!document.getElementById("fums-js")) {
    w.fumsData = w.fumsData || [];
    w.fums = w.fums || ((...a: unknown[]) => w.fumsData!.push(a));
    const s = document.createElement("script");
    s.id = "fums-js";
    s.src = "https://pkg.api.bible/fumsV3.min.js";
    s.async = true;
    document.body.appendChild(s);
  }
  w.fums?.("trackView", token);
}

/** The source and fact for a passage: the passage is the quote, checked because it came from the publisher's text. */
export function passageBodies(a: Argument, p: { reference: string; version: string; text: string; copyright: string; enteredByAuthor?: boolean }): ArgOpBody[] {
  const short = `${p.reference} (${p.version})`;
  const source: WorkspaceSource = {
    id: nextId("S", a.sources),
    kind: "scripture",
    origin: "yours",
    title: short,
    citation: `${short}. ${p.copyright}`.trim(),
    short,
    version: p.version,
    reference: p.reference,
    ...(p.enteredByAuthor ? { enteredByAuthor: true } : { fetchedAt: new Date().toISOString(), url: "https://api.bible" }),
    status: "active",
    addedAt: new Date().toISOString(),
  };
  const fact: Fact = {
    id: nextId("F", a.facts),
    sourceId: source.id,
    kind: "note",
    text: `${short}${p.enteredByAuthor ? ", a paraphrase entered by the author" : ""}: “${p.text}”`,
    quote: p.text,
    checked: !p.enteredByAuthor,
    status: "active",
  };
  return [
    { kind: "source.put", source },
    { kind: "fact.put", fact },
  ];
}

type Status = { available: boolean; versions: Version[]; error?: string };
type Apply = (b: ArgOpBody[], reason: string) => void;

export function BiblePanel({ arg, apply, onDone }: { arg: Argument; apply: Apply; onDone: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [tab, setTab] = useState<"find" | "look" | "words">("find");
  useEffect(() => {
    fetch("/api/sources/bible", { cache: "no-store" })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ available: false, versions: [] }));
  }, []);
  return (
    <div className="add-box stack" style={{ gap: 10 }}>
      <div className="row">
        <strong style={{ flex: 1 }}>Bible passages</strong>
        <span className="segmented" role="tablist" aria-label="How to add">
          <button role="tab" aria-selected={tab === "find"} className={tab === "find" ? "small primary" : "small"} onClick={() => setTab("find")}>Find passages</button>
          <button role="tab" aria-selected={tab === "look"} className={tab === "look" ? "small primary" : "small"} onClick={() => setTab("look")}>Look up a reference</button>
          <button role="tab" aria-selected={tab === "words"} className={tab === "words" ? "small primary" : "small"} onClick={() => setTab("words")}>Word study</button>
        </span>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Scripture is kept as its own kind of source: quoted word for word with its version, and never presented as a research finding.</p>
      {status && !status.available && (
        <p className="small notice" style={{ margin: 0 }}>{status.error ?? "Bible lookup isn't set up on this server yet (API_BIBLE_KEY)."} You can still enter The Passion Translation yourself under Look up a reference.</p>
      )}
      {tab === "find" ? <FindPassages arg={arg} apply={apply} status={status} /> : tab === "look" ? <LookUp arg={arg} apply={apply} status={status} onDone={onDone} /> : <WordStudy arg={arg} apply={apply} versions={status?.available ? status.versions : []} />}
      <div className="row">
        <button className="small ghost" onClick={onDone}>Close</button>
        <span className="spacer" />
        <a className="small" href="https://api.bible" target="_blank" rel="noopener noreferrer">Scripture provided by API.Bible</a>
      </div>
    </div>
  );
}

function LookUp({ arg, apply, status, onDone }: { arg: Argument; apply: Apply; status: Status | null; onDone: () => void }) {
  const [version, setVersion] = useState<Choice>("NIV");
  useEffect(() => {
    if (!status) return;
    if (!status.available) setVersion("TPT");
    else if (status.versions.length && !status.versions.includes("NIV")) setVersion(status.versions[0]);
  }, [status]);
  const [ref, setRef] = useState("");
  const [typed, setTyped] = useState("");
  const [passage, setPassage] = useState<Passage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const parsed = parseReference(ref);

  async function look() {
    setError("");
    setPassage(null);
    setBusy(true);
    try {
      const { passage } = await post<{ passage: Passage }>("/api/sources/bible", { reference: ref, version });
      setPassage(passage);
      reportView(passage.fumsToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function add() {
    if (version === "TPT") {
      if (!parsed || !typed.trim()) return;
      apply(passageBodies(arg, { reference: formatReference(parsed), version: "TPT", text: typed.trim(), copyright: TPT_NOTICE, enteredByAuthor: true }), `Added ${formatReference(parsed)} (TPT)`);
    } else if (passage) {
      apply(passageBodies(arg, passage), `Added ${passage.reference} (${passage.version})`);
    } else return;
    onDone();
  }

  const offered: Choice[] = [...VERSIONS.filter((v) => status?.versions.includes(v.id)).map((v) => v.id), "TPT"];

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <label className="small" style={{ flex: "1 1 200px" }}>
          Reference
          <input value={ref} placeholder="John 3:16–17, 1 Cor 13:4–7, Psalm 23" onChange={(e) => { setRef(e.target.value); setPassage(null); }} onKeyDown={(e) => { if (e.key === "Enter" && version !== "TPT" && parsed) look(); }} />
        </label>
        <label className="small">
          Version
          <select value={version} onChange={(e) => { setVersion(e.target.value as Choice); setPassage(null); }}>
            {offered.map((v) => (
              <option key={v} value={v}>{v === "TPT" ? "TPT (enter it yourself)" : `${v}: ${VERSIONS.find((x) => x.id === v)?.name}`}</option>
            ))}
          </select>
        </label>
        {version !== "TPT" && <button className="small primary" disabled={busy || !parsed} onClick={look}>{busy ? "Looking up…" : "Look up"}</button>}
      </div>
      {ref.trim().length > 2 && !parsed && <p className="small warn-text" style={{ margin: 0 }}>Not a reference yet. Try a form like John 3:16–17.</p>}
      {error && <p className="small error" role="alert" style={{ margin: 0 }}>{error}</p>}

      {version === "TPT" && (
        <>
          <label className="small">
            The passage, typed or pasted from your TPT Bible or app
            <textarea rows={4} value={typed} onChange={(e) => setTyped(e.target.value)} />
          </label>
          <p className="small muted" style={{ margin: 0 }}>
            The Passion Translation has no online source to check against, so it is labeled “paraphrase, entered by the author”. Its publisher allows up to 500 verses; on slides, “TPT” after each quotation is enough.
          </p>
        </>
      )}

      {passage && (
        <blockquote className="scripture">
          <p style={{ margin: 0 }}>{passage.text}</p>
          <footer className="small muted">
            {passage.reference} ({passage.version}). {passage.copyright}
          </footer>
        </blockquote>
      )}

      <div className="row">
        <button className="small primary" disabled={version === "TPT" ? !parsed || !typed.trim() : !passage} onClick={add}>Add to workspace</button>
      </div>
    </div>
  );
}

type Found = { reference: string; why?: string; caution?: string; passage?: Passage; text?: string; failed?: string };

/** Run `f` over `items`, a few at a time. */
async function pool<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await f(items[i]);
    }
  }));
  return out;
}

/**
 * Find passages (F-123): Claude proposes references on a theme, with reasons,
 * and the app fetches each one's text in the chosen version (a reference that
 * doesn't exist is left out and said so); or a word search of the version.
 */
function FindPassages({ arg, apply, status }: { arg: Argument; apply: Apply; status: Status | null }) {
  const versions = status?.versions ?? [];
  const [version, setVersion] = useState<Version>("NIV");
  useEffect(() => {
    if (versions.length && !versions.includes(version)) setVersion(versions[0]);
  }, [versions.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const [want, setWant] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [note, setNote] = useState("");
  const [hasClaude, setHasClaude] = useState(false);
  useEffect(() => {
    claudeAvailable().then((t) => setHasClaude(Boolean(t)));
  }, []);

  const inWorkspace = new Set((arg.sources ?? []).filter((s) => s.kind === "scripture" && s.status === "active").map((s) => `${s.reference} (${s.version})`));

  async function fetchText(reference: string): Promise<Passage | string> {
    try {
      return (await post<{ passage: Passage }>("/api/sources/bible", { reference, version })).passage;
    } catch (e) {
      return e instanceof Error ? e.message : "Not found.";
    }
  }

  async function askClaude() {
    setError("");
    setFound(null);
    setNote("");
    setBusy("Claude is finding passages…");
    try {
      const req = { theme: want.trim(), topic: arg.topic ?? "", message: arg.thesis, already: (arg.sources ?? []).filter((s) => s.kind === "scripture" && s.status === "active").map((s) => s.reference ?? s.short) };
      const { value } = await askClaudeFor({
        prompt: passagePrompt(req),
        parse: (raw) => {
          const r = PassageIdeas.safeParse(raw);
          return r.success ? r.data : null;
        },
        route: "/api/sources/bible/themes",
        payload: req,
        key: "value",
      });
      setNote(value.note);
      setBusy(`Fetching ${value.passages.length} passages in the ${version}…`);
      const rows = await pool(value.passages, 4, async (p): Promise<Found> => {
        const parsed = parseReference(p.reference);
        if (!parsed) return { ...p, failed: "Not a reference the app recognizes." };
        const got = await fetchText(formatReference(parsed));
        return typeof got === "string" ? { ...p, failed: got } : { ...p, reference: formatReference(parsed), passage: got };
      });
      setFound(rows);
      rows.forEach((r) => reportView(r.passage?.fumsToken));
    } catch (e) {
      setError(e instanceof ClaudeError ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function searchWords() {
    setError("");
    setFound(null);
    setNote("");
    setBusy(`Searching the ${version}…`);
    try {
      const r = await post<{ verses: { reference: string; text: string }[]; total: number; fumsToken?: string }>("/api/sources/bible", { words: want.trim(), version });
      reportView(r.fumsToken);
      setFound(r.verses.map((v) => ({ reference: v.reference, text: v.text })));
      setNote(r.total > r.verses.length ? `${r.total} verses contain these words; the best ${r.verses.length} are shown.` : `${r.total} verse${r.total === 1 ? "" : "s"} contain these words.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function addFound(f: Found) {
    let p = f.passage;
    if (!p) {
      // A word-search hit: fetch the verse itself, for its exact text and copyright.
      setBusy(`Adding ${f.reference}…`);
      const got = await fetchText(f.reference);
      setBusy("");
      if (typeof got === "string") return setError(got);
      p = got;
    }
    apply(passageBodies(arg, p), `Added ${p.reference} (${p.version})`);
  }

  if (!status?.available) return <p className="small muted" style={{ margin: 0 }}>Finding passages needs Bible lookup on this server.</p>;
  const ok = (found ?? []).filter((f) => !f.failed);
  const failed = (found ?? []).filter((f) => f.failed);

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <label className="small" style={{ flex: "1 1 260px" }}>
          What are you looking for?
          <input value={want} placeholder="Sabbath rest and health; God's care for the sick; forgiveness" onChange={(e) => setWant(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && want.trim().length > 1 && !busy) (hasClaude ? askClaude : searchWords)(); }} />
        </label>
        <label className="small">
          Version
          <select value={version} onChange={(e) => setVersion(e.target.value as Version)}>
            {versions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
      </div>
      <div className="row">
        {hasClaude && <button className="small primary" disabled={Boolean(busy) || want.trim().length < 2} onClick={askClaude}>Ask Claude for passages</button>}
        <button className={hasClaude ? "small" : "small primary"} disabled={Boolean(busy) || want.trim().length < 2} onClick={searchWords}>Search for these words</button>
        {busy && <span className="small" role="status">{busy}</span>}
      </div>
      <p className="small muted" style={{ margin: 0 }}>Claude suggests references by theme and why each fits; the wording always comes from the {version} itself. Word search finds verses containing all your words.</p>
      {error && <p className="small error" role="alert" style={{ margin: 0 }}>{error}</p>}
      {note && <p className="small" style={{ margin: 0 }}>{note}</p>}
      {ok.length > 0 && (
        <ul className="candidates">
          {ok.map((f) => {
            const label = `${f.passage?.reference ?? f.reference} (${f.passage?.version ?? version})`;
            const have = inWorkspace.has(label);
            return (
              <li key={label} className="candidate">
                <strong className="cand-title">{label}</strong>
                {f.why && <span className="small">{f.why}</span>}
                {f.caution && <span className="small warn-text">Note: {f.caution}</span>}
                <blockquote className="scripture">
                  <p style={{ margin: 0 }}>{f.passage?.text ?? f.text}</p>
                  {f.passage?.copyright && <footer className="small muted">{f.passage.copyright}</footer>}
                </blockquote>
                <span className="row">
                  <span className="spacer" />
                  {have ? <span className="pill ok">In the workspace</span> : <button className="small primary" disabled={Boolean(busy)} onClick={() => addFound(f)}>Add to workspace</button>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {failed.length > 0 && <p className="small muted" style={{ margin: 0 }}>Left out, because the {version} text couldn&apos;t be fetched: {failed.map((f) => f.reference).join(", ")}.</p>}
      {found && found.length === 0 && <p className="small muted" style={{ margin: 0 }}>Nothing found. Try other words, or ask Claude by theme.</p>}
    </div>
  );
}

/**
 * API.Bible text kept in a presentation is fetched again before 30 days pass
 * (its terms). Runs once when the workspace opens; text that changed is
 * updated in place.
 */
export function useScriptureRefresh(arg: Argument, apply: (b: ArgOpBody[], reason: string) => void) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const stale = (arg.sources ?? []).filter((s) => s.kind === "scripture" && s.status === "active" && !s.enteredByAuthor && s.reference && s.version && needsRefresh(s.fetchedAt));
    if (!stale.length) return;
    (async () => {
      const bodies: ArgOpBody[] = [];
      for (const s of stale) {
        try {
          const { passage } = await post<{ passage: Passage }>("/api/sources/bible", { reference: s.reference, version: s.version });
          bodies.push({ kind: "source.put", source: { ...s, fetchedAt: new Date().toISOString() } });
          for (const f of (arg.facts ?? []).filter((x) => x.sourceId === s.id && x.quote && x.quote !== passage.text)) {
            bodies.push({ kind: "fact.put", fact: { ...f, quote: passage.text, text: f.text.replace(f.quote!, passage.text) } });
          }
        } catch {
          // Not reachable now (no key, offline): try again next time.
        }
      }
      if (bodies.length) apply(bodies, "Refreshed Scripture text from API.Bible");
    })();
  }, [arg, apply]);
}
