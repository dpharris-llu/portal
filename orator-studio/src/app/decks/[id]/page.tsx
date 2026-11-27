"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useDeck } from "@/lib/useDeck";
import { TopBar } from "@/components/TopBar";
import { SlideView } from "@/components/SlideView";
import { BlockEditor } from "@/components/BlockEditor";
import { SourcesPanel } from "@/components/SourcesPanel";
import { getTheme } from "@/theme/llu";
import { layoutSlide, LAYOUT_NAMES } from "@/layout/engine";
import { deckChecks } from "@/checks/checks";
import { diffSlide } from "@/model/diff";
import { blankBlock, newSlide } from "@/model/factory";
import { locateSlide } from "@/model/ops";
import type { Block, BlockType, Intent, Section, Slide } from "@/model/types";

const BLOCK_TYPES: BlockType[] = ["text", "bullets", "image", "chart", "table", "quote", "poll"];

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const { deck, log, commit, undo, redo, canUndo, canRedo, status, missing, me } = useDeck(id);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Slide | null>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const theme = getTheme(deck?.meta.themeId ?? "llu");
  const slideId = selected && deck?.slides[selected] ? selected : deck?.narrative[0] ?? deck?.backup[0] ?? null;
  const saved = slideId ? deck?.slides[slideId] ?? null : null;

  // The draft mirrors the stored slide until the author types; the preview renders the draft,
  // so layout reflows on every keystroke while operations are committed when typing pauses.
  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  function flush(current = draft) {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    if (saved && current && current.id === saved.id) {
      const ops = diffSlide(saved, current);
      if (ops.length) commit(ops, "Edited slide");
    }
  }

  function edit(next: Slide) {
    setDraft(next);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => flush(next), 700);
  }

  // Undo and redo shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      flush();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const issues = useMemo(() => (deck ? deckChecks(deck, theme) : []), [deck, theme]);

  if (missing) {
    return (
      <main className="narrow">
        <p>This deck was not found. <Link href="/">Back to your decks</Link></p>
      </main>
    );
  }
  if (!deck) return <main className="narrow muted">Loading…</main>;

  const select = (sid: string) => {
    flush();
    setSelected(sid);
  };

  function addSlide(section: Section) {
    flush();
    const s = newSlide("New claim");
    const index = slideId ? (locateSlide(deck!, slideId)?.section === section ? locateSlide(deck!, slideId)!.index + 1 : deck![section].length) : 0;
    commit({ kind: "slide.insert", slide: s, section, index }, "Added slide");
    setSelected(s.id);
  }

  function structural(fn: () => void) {
    flush();
    fn();
  }

  const loc = slideId ? locateSlide(deck, slideId) : null;
  const view = draft && draft.id === slideId ? draft : saved;
  const slideIssues = issues.filter((i) => i.slideId === slideId);

  return (
    <>
      <TopBar>
        <strong>{deck.meta.title}</strong>
        <span className="status" role="status">{status === "saving" ? "Saving…" : status === "error" ? "Save failed: kept locally" : "Saved"}</span>
        <button onClick={() => { flush(); undo(); }} disabled={!canUndo}>Undo</button>
        <button onClick={() => { flush(); redo(); }} disabled={!canRedo}>Redo</button>
        <Link href={`/decks/${deck.id}/present`}><button className="primary">Present</button></Link>
      </TopBar>
      <div className="editor">
        <nav className="rail" aria-label="Slides">
          {(["narrative", "backup"] as const).map((section) => (
            <div key={section}>
              <h3>{section === "narrative" ? "Narrative" : "Backup"} ({deck[section].length})</h3>
              <ol className="thumbs">
                {deck[section].map((sid, i) => (
                  <li key={sid}>
                    <button className="thumb" aria-current={sid === slideId} onClick={() => select(sid)}>
                      <span className="num">
                        {section === "narrative" ? i + 1 : `B${i + 1}`}
                        {deck.slides[sid].importNotes && <span className="review-dot" title="Needs review after import" />}
                      </span>
                      <SlideView slide={sid === slideId && view ? view : deck.slides[sid]} theme={theme} />
                    </button>
                  </li>
                ))}
              </ol>
              <button style={{ marginTop: 8, width: "100%" }} onClick={() => addSlide(section)}>
                Add {section === "narrative" ? "slide" : "backup slide"}
              </button>
            </div>
          ))}
        </nav>

        <main className="canvas">
          {view && loc ? (
            <>
              <SlideView slide={view} theme={theme} />
              <div className="row small">
                <span className="muted">Layout: {layoutSlide(view, theme).name}{view.layoutOverride ? " (forced)" : " (automatic)"}</span>
                <span className="spacer" />
                <button onClick={() => structural(() => commit({ kind: "slide.move", slideId: view.id, section: loc.section, index: loc.index - 1 }, "Moved slide"))} disabled={loc.index === 0}>Move up</button>
                <button onClick={() => structural(() => commit({ kind: "slide.move", slideId: view.id, section: loc.section, index: loc.index + 1 }, "Moved slide"))} disabled={loc.index >= deck[loc.section].length - 1}>Move down</button>
                <button onClick={() => structural(() => commit({ kind: "slide.move", slideId: view.id, section: loc.section === "narrative" ? "backup" : "narrative", index: 0 }, "Moved slide"))}>
                  Move to {loc.section === "narrative" ? "backup" : "narrative"}
                </button>
                <button className="danger" onClick={() => structural(() => { commit({ kind: "slide.delete", slideId: view.id }, "Deleted slide"); setSelected(null); })}>Delete slide</button>
              </div>

              <section className="stack">
                <label>
                  Claim
                  <input value={view.claim} onChange={(e) => edit({ ...view, claim: e.target.value })} onBlur={() => flush()} />
                </label>
                <div className="row">
                  <label style={{ flex: 1 }}>
                    Intent
                    <select value={view.intent} onChange={(e) => edit({ ...view, intent: e.target.value as Intent })}>
                      <option value="inform">Inform</option>
                      <option value="persuade">Persuade</option>
                      <option value="decide">Decide</option>
                    </select>
                  </label>
                  <label style={{ flex: 1 }}>
                    Layout
                    <select value={view.layoutOverride ?? ""} onChange={(e) => edit({ ...view, layoutOverride: e.target.value || undefined })}>
                      <option value="">Automatic</option>
                      {LAYOUT_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                </div>

                {view.blocks.map((b, i) => (
                  <BlockEditor
                    key={b.id}
                    block={b}
                    index={i}
                    count={view.blocks.length}
                    sources={deck.sources}
                    onChange={(nb: Block) => edit({ ...view, blocks: view.blocks.map((x) => (x.id === nb.id ? nb : x)) })}
                    onRemove={() => structural(() => commit({ kind: "block.delete", slideId: view.id, blockId: b.id }, "Removed block"))}
                    onMove={(d) => structural(() => commit({ kind: "block.move", slideId: view.id, blockId: b.id, index: i + d }, "Moved block"))}
                  />
                ))}
                <div className="row">
                  <span className="muted small">Add evidence:</span>
                  {BLOCK_TYPES.map((t) => (
                    <button key={t} onClick={() => structural(() => commit({ kind: "block.insert", slideId: view.id, block: blankBlock(t), index: view.blocks.length }, `Added ${t}`))}>
                      {t}
                    </button>
                  ))}
                </div>

                <label>
                  Speaker notes
                  <textarea rows={4} value={view.notes} onChange={(e) => edit({ ...view, notes: e.target.value })} onBlur={() => flush()} />
                </label>
                <fieldset className="stack" style={{ border: "1px solid var(--line)", borderRadius: 8 }}>
                  <legend>Live presenting</legend>
                  <label className="inline">
                    <input type="checkbox" checked={Boolean(view.flags.neverShowOnVoice)} onChange={(e) => edit({ ...view, flags: { ...view.flags, neverShowOnVoice: e.target.checked || undefined } })} />
                    Never open by voice command
                  </label>
                  <label className="inline">
                    <input type="checkbox" checked={Boolean(view.flags.requireConfirm)} onChange={(e) => edit({ ...view, flags: { ...view.flags, requireConfirm: e.target.checked || undefined } })} />
                    Confidential: confirm before showing to the audience
                  </label>
                  <label className="inline">
                    <input
                      type="checkbox"
                      checked={Boolean(view.freeform)}
                      onChange={(e) =>
                        edit({
                          ...view,
                          freeform: e.target.checked ? { rect: { x: 0.62, y: 0.3, w: 0.32, h: 0.6 }, blocks: [] } : undefined,
                        })
                      }
                    />
                    Reserve a freeform region (right side)
                  </label>
                </fieldset>
              </section>
            </>
          ) : (
            <p className="muted">No slides yet. Add one from the left.</p>
          )}
        </main>

        <aside className="side" aria-label="Checks and history">
          <section>
            <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Checks on this slide</h2>
            {slideIssues.length === 0 ? (
              <p className="muted small">No issues.</p>
            ) : (
              <ul className="issues">
                {slideIssues.map((i, k) => <li key={k} className={i.severity}>{i.message}</li>)}
              </ul>
            )}
            {view?.importNotes && (
              <button style={{ marginTop: 8 }} onClick={() => structural(() => commit({ kind: "slide.update", slideId: view.id, patch: { importNotes: null } }, "Marked import reviewed"))}>
                Mark reviewed
              </button>
            )}
            <p className="muted small">
              {deck.backup.concat(deck.narrative).filter((x) => deck.slides[x]?.importNotes).length > 0 &&
                `${deck.backup.concat(deck.narrative).filter((x) => deck.slides[x]?.importNotes).length} slides need review. `}
              Deck: {issues.filter((i) => i.severity === "error").length} errors, {issues.filter((i) => i.severity === "warning").length} warnings.
            </p>
          </section>
          <SourcesPanel deck={deck} me={me} commit={(ops, reason) => { flush(); commit(ops, reason); }} />
          <section>
            <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Deck</h2>
            <div className="small stack" style={{ gap: 4 }}>
              <span><strong>Goal:</strong> {deck.meta.goal || "—"}</span>
              <span><strong>Audience:</strong> {deck.meta.audience || "—"}</span>
              <span><strong>Time:</strong> {deck.meta.timeLimitMin} min, {deck.narrative.length} slides</span>
              <span><strong>Takeaway:</strong> {deck.meta.takeaway || "—"}</span>
            </div>
          </section>
          <section>
            <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>History</h2>
            <ol className="history" reversed>
              {log.slice(-15).reverse().map((op) => (
                <li key={op.id}>
                  {op.author.kind === "ai" && <span className="ai-flag">AI</span>} {op.reason ?? op.kind}{" "}
                  <span className="muted">{new Date(op.at).toLocaleTimeString()}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
