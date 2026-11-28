"use client";
/**
 * Word study (F-128): type a verse to see each word in the original Greek or
 * Hebrew, then pick a word to see its definition and every place it occurs,
 * counted by book. Any occurrence can be read in the chosen version and
 * added to the workspace. All of it comes from STEPBible's data, never from
 * Claude's memory.
 */
import { useState } from "react";
import { bookName, formatReference, parseReference, type Passage, type Version } from "@/find/bible";
import { byBook, CREDIT, isFunctionWord, lexicon, loadBook, occurrences, refToText, type BookData, type LexEntry, type Word } from "@/find/wordstudy";
import { post } from "./FindSources";
import type { ScriptureHost } from "./BiblePanel";

type Study = { strong: string; lex: LexEntry | null; refs: string[] };
const SHOW = 40;

export function WordStudy({ host, versions }: { host: ScriptureHost; versions: Version[] }) {
  const [ref, setRef] = useState("");
  const [verse, setVerse] = useState<{ label: string; lang: BookData["lang"]; words: Word[] } | null>(null);
  const [study, setStudy] = useState<Study | null>(null);
  const [all, setAll] = useState(false);
  const [version, setVersion] = useState<Version>(versions.includes("NIV") ? "NIV" : versions[0] ?? "KJV");
  const [texts, setTexts] = useState<Record<string, Passage | string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const parsed = parseReference(ref);

  async function showVerse() {
    if (!parsed) return;
    setError("");
    setStudy(null);
    setBusy("Loading the original text…");
    try {
      const book = await loadBook(parsed.code);
      const key = `${parsed.chapter}:${parsed.verse ?? 1}`;
      const words = book.verses[key];
      if (!words) throw new Error(`${formatReference({ ...parsed, endChapter: undefined, endVerse: undefined })} isn't in the data. Check the chapter and verse.`);
      setVerse({ label: `${bookName(parsed.code)} ${parsed.chapter}:${parsed.verse ?? 1}`, lang: book.lang, words });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function studyWord(strong: string) {
    setError("");
    setAll(false);
    setBusy("Finding every occurrence…");
    try {
      const [lex, refs] = await Promise.all([lexicon(strong), occurrences(strong)]);
      setStudy({ strong, lex, refs });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function read(r: string) {
    if (texts[r]) return;
    try {
      const { passage } = await post<{ passage: Passage }>("/api/sources/bible", { reference: refToText(r, bookName), version });
      setTexts((t) => ({ ...t, [r]: passage }));
    } catch (e) {
      setTexts((t) => ({ ...t, [r]: e instanceof Error ? e.message : "Couldn't fetch it." }));
    }
  }

  const inWorkspace = host.kept;
  const shown = study ? (all ? study.refs : study.refs.slice(0, SHOW)) : [];

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <label className="small" style={{ flex: "1 1 220px" }}>
          A verse
          <input value={ref} placeholder="Mark 2:27, Genesis 2:2, Matthew 11:28" onChange={(e) => setRef(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && parsed) showVerse(); }} />
        </label>
        {versions.length > 0 && (
          <label className="small">
            Read occurrences in
            <select value={version} onChange={(e) => { setVersion(e.target.value as Version); setTexts({}); }}>
              {versions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        )}
        <button className="small primary" disabled={!parsed || Boolean(busy)} onClick={showVerse}>Show the original</button>
      </div>
      {busy && <p className="small" role="status" style={{ margin: 0 }}>{busy}</p>}
      {error && <p className="small error" role="alert" style={{ margin: 0 }}>{error}</p>}

      {verse && (
        <div className="stack" style={{ gap: 6 }}>
          <strong className="small">{verse.label} in {verse.lang === "greek" ? "Greek" : "Hebrew"}: pick a word to study</strong>
          <div className={`interlinear ${verse.lang}`}>
            {verse.words.map((w, i) => {
              const studyable = w[3] && !isFunctionWord(w[3]);
              return (
                <button key={i} className={`il-word${study?.strong === w[3] ? " on" : ""}`} disabled={!studyable || Boolean(busy)} onClick={() => studyWord(w[3])} title={w[4] ? `Grammar: ${w[4]}` : undefined}>
                  <span className="il-orig" lang={verse.lang === "greek" ? "grc" : "he"} dir={verse.lang === "hebrew" ? "rtl" : undefined}>{w[0]}</span>
                  <span className="il-tr">{w[1]}</span>
                  <span className="il-en">{w[2]}</span>
                  <span className="il-num">{w[3]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {study && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="word-entry">
            <span className="il-orig" lang={study.strong.startsWith("G") ? "grc" : "he"} dir={study.strong.startsWith("H") ? "rtl" : undefined}>{study.lex?.w ?? study.strong}</span>{" "}
            <span className="small muted">{study.lex?.t} · {study.strong}</span>
            {study.lex?.g && <strong>, “{study.lex.g}”</strong>}
            {study.lex?.d && <p className="small" style={{ margin: "6px 0 0" }}>{study.lex.d}</p>}
          </div>
          <p className="small" style={{ margin: 0 }}>
            <strong>{study.refs.length}</strong> verse{study.refs.length === 1 ? "" : "s"} use this word: {byBook(study.refs).map(([b, n]) => `${bookName(b)} ${n}`).join(", ")}.
          </p>
          <ul className="occurrences">
            {shown.map((r) => {
              const label = refToText(r, bookName);
              const t = texts[r];
              const passage = t && typeof t !== "string" ? t : null;
              const have = passage && inWorkspace.has(`${passage.reference} (${passage.version})`);
              return (
                <li key={r}>
                  <span className="row" style={{ gap: 8 }}>
                    <strong className="small">{label}</strong>
                    {!t && versions.length > 0 && <button className="small ghost" onClick={() => read(r)}>Read in {version}</button>}
                    {passage && (have ? <span className="pill ok">Kept</span> : <button className="small" onClick={() => host.onKeep(passage)}>Keep</button>)}
                  </span>
                  {passage && <span className="small scripture-line">{passage.text}</span>}
                  {typeof t === "string" && <span className="small warn-text">{t}</span>}
                </li>
              );
            })}
          </ul>
          {study.refs.length > SHOW && <button className="small ghost" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${study.refs.length}`}</button>}
        </div>
      )}
      <p className="small muted" style={{ margin: 0 }}>{CREDIT}. Verse “0” of a psalm is its title.</p>
    </div>
  );
}
