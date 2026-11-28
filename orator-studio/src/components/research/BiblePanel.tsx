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
import { nextId, type ArgOpBody, type Argument, type Fact, type WorkspaceSource } from "@/model/argument";
import { formatReference, needsRefresh, parseReference, TPT_NOTICE, VERSIONS, type Passage, type Version } from "@/find/bible";
import { post } from "./FindSources";

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

export function BiblePanel({ arg, apply, onDone }: { arg: Argument; apply: (b: ArgOpBody[], reason: string) => void; onDone: () => void }) {
  const [status, setStatus] = useState<{ available: boolean; versions: Version[]; error?: string } | null>(null);
  const [version, setVersion] = useState<Choice>("NIV");
  const [ref, setRef] = useState("");
  const [typed, setTyped] = useState("");
  const [passage, setPassage] = useState<Passage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/sources/bible", { cache: "no-store" })
      .then((r) => r.json())
      .then((s) => {
        setStatus(s);
        if (s.available && s.versions.length && !s.versions.includes("NIV")) setVersion(s.versions[0]);
        if (!s.available) setVersion("TPT");
      })
      .catch(() => setStatus({ available: false, versions: [] }));
  }, []);

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
    <div className="add-box stack" style={{ gap: 10 }}>
      <strong>Add a Bible passage</strong>
      <p className="small muted" style={{ margin: 0 }}>
        Scripture is kept as its own kind of source: quoted word for word with its version, and never presented as a research finding.
      </p>
      {status && !status.available && (
        <p className="small notice" style={{ margin: 0 }}>
          {status.error ?? "Bible lookup isn't set up on this server yet (API_BIBLE_KEY)."} You can still enter The Passion Translation yourself.
        </p>
      )}
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
        <button className="small ghost" onClick={onDone}>Cancel</button>
        <span className="spacer" />
        <a className="small" href="https://api.bible" target="_blank" rel="noopener noreferrer">Scripture provided by API.Bible</a>
      </div>
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
