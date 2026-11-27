"use client";
/**
 * Presenter view (spec 5). The audience window only changes on explicit actions;
 * search and voice matches open as a private preview first.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Deck } from "@/model/types";
import { getRepo } from "@/lib/repo";
import { getTheme } from "@/theme/llu";
import { buildIndex, search, LOW_CONFIDENCE } from "@/search/index";
import { initPresenter, presenterReducer, type PresenterAction, type PresenterState } from "@/present/state";
import { audienceChannel, type AudienceMessage } from "@/present/channel";
import { SlideView } from "@/components/SlideView";
import { CommandBar } from "@/components/CommandBar";
import { TopBar } from "@/components/TopBar";
import { listenOnce, speechAvailable } from "@/lib/speech";
import { useLiveSession } from "@/lib/useLiveSession";
import { LivePanel } from "@/components/LivePanel";
import { LiveContext, type LiveInfo } from "@/components/LiveContext";
import { JoinScreen } from "@/components/JoinScreen";

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

export default function PresentPage() {
  const { id } = useParams<{ id: string }>();
  const [deck, setDeck] = useState<Deck | null>(null);
  useEffect(() => {
    getRepo().load(id).then((s) => s && setDeck(s.deck));
  }, [id]);
  if (!deck) return <main className="narrow muted">Loading…</main>;
  return <Presenter deck={deck} />;
}

function Presenter({ deck }: { deck: Deck }) {
  const theme = getTheme(deck.meta.themeId);
  const index = useMemo(() => buildIndex(deck), [deck]);
  const [state, dispatch] = useReducer(
    (s: PresenterState, a: PresenterAction) => presenterReducer(deck, s, a),
    deck,
    (d) => initPresenter(d),
  );
  const [cmdk, setCmdk] = useState<{ open: boolean; query: string }>({ open: false, query: "" });
  const [listening, setListening] = useState(false);
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [detourSec, setDetourSec] = useState(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const live = useLiveSession(deck.id);
  const liveInfo: LiveInfo = useMemo(
    () => ({
      results: live.view?.results ?? {},
      activePoll: live.view?.activePoll ?? null,
      join: live.creds ? { code: live.creds.code, host: window.location.host } : undefined,
    }),
    [live.view, live.creds],
  );
  const liveRef = useRef(liveInfo);
  liveRef.current = liveInfo;

  // Timer: total time, and time spent on detours, kept apart (L-08).
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      if (state.detour) setDetourSec((d) => d + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [state.detour]);

  // Sync the audience window. It asks for the deck when it opens.
  useEffect(() => {
    const ch = audienceChannel(deck.id);
    channel.current = ch;
    if (!ch) return;
    ch.onmessage = (e) => {
      if (e.data === "hello") ch.postMessage({ deckId: deck.id, view: stateRef.current.audience, deckJson: JSON.stringify(deck), live: liveRef.current } satisfies AudienceMessage);
    };
    return () => ch.close();
  }, [deck]);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    channel.current?.postMessage({ deckId: deck.id, view: state.audience, deckJson: JSON.stringify(deck), live: liveInfo } satisfies AudienceMessage);
  }, [deck, state.audience, liveInfo]);

  const voice = useCallback(() => {
    if (listening) return;
    setListening(true);
    listenOnce(
      (text) => {
        setListening(false);
        const hits = search(index, text);
        if (hits.length === 1 || (hits[0] && hits[0].confidence >= LOW_CONFIDENCE && hits[0].confidence - (hits[1]?.confidence ?? 0) > 0.2)) {
          dispatch({ type: "preview", slideId: hits[0].slideId, via: "voice" });
        } else {
          // Ambiguous or weak: show the top matches and let the presenter choose (L-09).
          setCmdk({ open: true, query: text });
        }
      },
      (reason) => {
        setListening(false);
        dispatch({ type: "notice", message: reason });
      },
    );
  }, [index, listening]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (cmdk.open) return;
      const k = e.key;
      if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === "k") {
        e.preventDefault();
        setCmdk({ open: true, query: "" });
      } else if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      } else if (k === "Enter" && state.preview) {
        e.preventDefault();
        dispatch({ type: "send" });
      } else if (k === "Escape" && state.preview) {
        dispatch({ type: "cancelPreview" });
      } else if (k === "ArrowRight" || k === "PageDown" || k === " ") {
        e.preventDefault();
        dispatch({ type: "next" });
      } else if (k === "ArrowLeft" || k === "PageUp") {
        dispatch({ type: "prev" });
      } else if (k === "Backspace" || k.toLowerCase() === "r") {
        dispatch({ type: "returnToPlace" });
      } else if (k.toLowerCase() === "b" || k === ".") {
        dispatch({ type: "toggleBlank" });
      } else if (k.toLowerCase() === "v") {
        voice();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cmdk.open, state.preview, voice]);

  const liveSlide = state.audience.kind === "slide" ? deck.slides[state.audience.slideId] : null;
  const current = deck.slides[deck.narrative[state.index]];
  const next = deck.slides[deck.narrative[state.index + 1]];
  const preview = state.preview ? deck.slides[state.preview] : null;
  const elapsed = (now - started) / 1000;
  const budget = deck.meta.timeLimitMin * 60;
  const over = elapsed - detourSec > budget;

  return (
    <LiveContext.Provider value={liveInfo}>
      <TopBar>
        <strong>{deck.meta.title}</strong>
        <button onClick={() => window.open(`/decks/${deck.id}/audience`, `lectern-audience-${deck.id}`, "popup")}>Open audience window</button>
        <button onClick={() => setCmdk({ open: true, query: "" })}>Jump <span className="kbd">Ctrl K</span></button>
        {speechAvailable() && <button onClick={voice} aria-pressed={listening}>{listening ? "Listening…" : "Voice"} <span className="kbd">V</span></button>}
        <Link href={`/decks/${deck.id}`}>Edit</Link>
      </TopBar>
      <div className="presenter">
        <div className="main">
          {state.notice && <div className="notice" role="status">{state.notice}</div>}
          {preview ? (
            <>
              <div className="row">
                <span className="preview-tag">PREVIEW · only you see this</span>
                <span className="spacer" />
                <button className="primary" onClick={() => dispatch({ type: "send" })}>
                  {state.confirming ? "Confirm: show confidential slide" : "Show to audience"} <span className="kbd">Enter</span>
                </button>
                <button onClick={() => dispatch({ type: "cancelPreview" })}>Cancel <span className="kbd">Esc</span></button>
              </div>
              <SlideView slide={preview} theme={theme} />
            </>
          ) : (
            <>
              <div className="row">
                <span className="live-tag">LIVE</span>
                {state.detour && <span className="small">Detour from slide {state.index + 1}</span>}
                <span className="spacer" />
                {state.detour && <button className="primary" onClick={() => dispatch({ type: "returnToPlace" })}>Return to slide {state.index + 1} <span className="kbd">R</span></button>}
              </div>
              {state.audience.kind === "join" ? (
                <JoinScreen code={state.audience.code} url={state.audience.url} theme={theme} />
              ) : liveSlide ? (
                <SlideView slide={liveSlide} theme={theme} />
              ) : (
                <div className="slide" style={{ background: "#000" }} aria-label="Audience screen is blank" />
              )}
            </>
          )}
          <div className="row">
            <button onClick={() => dispatch({ type: "prev" })}>← Previous</button>
            <button onClick={() => dispatch({ type: "next" })}>Next →</button>
            <button onClick={() => dispatch({ type: "toggleBlank" })}>{state.audience.kind === "blank" ? "Unblank" : "Blank"} <span className="kbd">B</span></button>
            <span className="spacer" />
            <span className="small muted">Slide {state.index + 1} of {deck.narrative.length}</span>
          </div>
        </div>
        <aside className="aside">
          <div className="row" style={{ fontSize: 24, fontVariantNumeric: "tabular-nums" }}>
            <span style={{ color: over ? "var(--err)" : undefined }} title="Time on the main narrative">{fmt(elapsed - detourSec)}</span>
            <span className="muted small">of {deck.meta.timeLimitMin}:00</span>
            <span className="spacer" />
            <span className="small muted" title="Time on planned detours">detours {fmt(detourSec)}</span>
          </div>
          {preview && liveSlide && (
            <div>
              <p className="small" style={{ margin: "0 0 4px" }}><span className="live-tag">LIVE</span> Audience still sees:</p>
              <SlideView slide={liveSlide} theme={theme} />
            </div>
          )}
          <LivePanel live={live} deck={deck} index={index} liveSlide={liveSlide ?? (state.audience.kind === "join" ? current : null)} dispatch={dispatch} />
          <div>
            <h2 style={{ fontSize: 14, margin: "0 0 4px" }}>Notes · {current?.claim}</h2>
            <div className="notes">{current?.notes || <span className="muted">No notes.</span>}</div>
          </div>
          {next && (
            <div>
              <h2 style={{ fontSize: 14, margin: "0 0 4px" }}>Next</h2>
              <SlideView slide={next} theme={theme} />
            </div>
          )}
          <p className="small muted">
            <span className="kbd">→</span> next · <span className="kbd">←</span> back · <span className="kbd">Ctrl K</span> jump · <span className="kbd">R</span> return · <span className="kbd">B</span> blank
          </p>
        </aside>
      </div>
      {cmdk.open && (
        <CommandBar
          deck={deck}
          index={index}
          theme={theme}
          initialQuery={cmdk.query}
          onClose={() => setCmdk({ open: false, query: "" })}
          onPick={(slideId) => {
            setCmdk({ open: false, query: "" });
            dispatch({ type: "preview", slideId, via: "search" });
          }}
        />
      )}
    </LiveContext.Provider>
  );
}
