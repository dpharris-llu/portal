"use client";
/**
 * Presenter controls for audience response (spec 8): session, polls, and the
 * moderation queues. Each question shows the best-matching slide (A-05), which
 * opens as a private preview, never straight on the audience screen.
 */
import { useMemo } from "react";
import type { Deck, PollBlock, Slide } from "@/model/types";
import type { PollSpec } from "@/audience/model";
import { search, LOW_CONFIDENCE, type SearchIndex } from "@/search/index";
import type { PresenterAction } from "@/present/state";
import type { useLiveSession } from "@/lib/useLiveSession";
import { DEMO } from "@/lib/demo";

type Live = ReturnType<typeof useLiveSession>;

export function pollSpec(b: PollBlock): PollSpec {
  return {
    blockId: b.id,
    kind: b.poll,
    question: b.question,
    options: b.options.map((o) => o.trim()).filter(Boolean),
    ...(b.poll === "rating" ? { scale: b.scale ?? 5 } : {}),
  };
}

export function LivePanel({
  live,
  deck,
  index,
  liveSlide,
  dispatch,
}: {
  live: Live;
  deck: Deck;
  index: SearchIndex;
  liveSlide: Slide | null;
  dispatch: (a: PresenterAction) => void;
}) {
  const { creds, view, status, error, start, end, act } = live;
  const polls = (liveSlide?.blocks ?? []).filter((b): b is PollBlock => b.type === "poll");

  const questions = view?.questions ?? [];
  const pending = questions.filter((q) => q.status === "pending");
  const approved = questions.filter((q) => q.status === "approved").sort((a, b) => b.votes - a.votes || a.at - b.at);
  const answered = questions.filter((q) => q.status === "answered");

  // A-05: best slide for each visible question, from the same local search as the command bar.
  const matches = useMemo(() => {
    const out: Record<string, { slideId: string; claim: string; confidence: number } | null> = {};
    for (const q of [...pending, ...approved]) {
      const hit = search(index, q.text, { limit: 1 })[0];
      out[q.id] = hit ? { slideId: hit.slideId, claim: deck.slides[hit.slideId]?.claim ?? "", confidence: hit.confidence } : null;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, deck, view]);

  if (!creds && DEMO) {
    return (
      <section className="live-panel" aria-label="Audience response">
        <h2>Audience response</h2>
        <p className="small muted">
          In the full app, the room joins from their phones by QR code for live polls and moderated Q&amp;A, and each question links to the slide that answers it. Phones need a server to connect to, so this is off in the demo. Poll slides still show their questions.
        </p>
      </section>
    );
  }

  if (!creds) {
    return (
      <section className="live-panel" aria-label="Audience response">
        <h2>Audience response</h2>
        <p className="small muted">Let the room join from their phones for polls and questions. Slides keep working if this fails.</p>
        <button onClick={start}>Start audience session</button>
        {error && <p className="small error" role="alert">{error}</p>}
      </section>
    );
  }

  const url = `${window.location.origin}/j/${creds.code}`;
  const matchButton = (qid: string) => {
    const m = matches[qid];
    if (!m) return <span className="small muted">No matching slide</span>;
    return (
      <button className="small" onClick={() => dispatch({ type: "preview", slideId: m.slideId, via: "question" })} title="Preview privately">
        {m.confidence < LOW_CONFIDENCE ? "Maybe: " : "Slide: "}
        {m.claim}
      </button>
    );
  };

  return (
    <section className="live-panel" aria-label="Audience response">
      <div className="row">
        <h2>
          <span className={`live-dot ${status}`} aria-hidden="true" />
          Code <span style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.05em" }}>{creds.code}</span>
        </h2>
        <span className="spacer" />
        <span className="small" role="status">
          {status === "live" ? `${view?.participants ?? 0} joined` : status === "reconnecting" ? "Reconnecting…" : status}
        </span>
      </div>
      {error && <p className="small error" role="alert">{error}</p>}
      <div className="row">
        <button onClick={() => dispatch({ type: "showJoin", code: creds.code, url })}>Show join screen</button>
        <button onClick={() => act({ type: "setLocked", locked: !view?.locked })} aria-pressed={Boolean(view?.locked)}>{view?.locked ? "Unlock room" : "Lock room"}</button>
        <button onClick={() => act({ type: "setQa", open: !view?.qaOpen })} aria-pressed={!view?.qaOpen}>{view?.qaOpen ? "Close questions" : "Open questions"}</button>
        <button className="danger" onClick={() => confirm("End the audience session? Phones will be disconnected.") && end()}>End</button>
      </div>

      {(polls.length > 0 || view?.activePoll) && (
        <div className="stack" style={{ gap: 6 }}>
          <strong className="small">Polls</strong>
          {polls.map((p) => {
            const isOpen = view?.activePoll === p.id;
            const ready = p.question.trim() && (!(p.poll === "choice" || p.poll === "ranking") || p.options.filter((o) => o.trim()).length >= 2);
            return (
              <div key={p.id} className="row small">
                <span style={{ flex: 1 }}>{p.question || "Untitled poll"}</span>
                {isOpen ? (
                  <button onClick={() => act({ type: "closePoll" })}>Close poll</button>
                ) : (
                  <button className="primary" disabled={!ready} onClick={() => act({ type: "openPoll", spec: pollSpec(p) })}>Open poll</button>
                )}
              </div>
            );
          })}
          {view?.activePoll && !polls.some((p) => p.id === view.activePoll) && (
            <div className="row small">
              <span style={{ flex: 1 }}>A poll on another slide is open.</span>
              <button onClick={() => act({ type: "closePoll" })}>Close it</button>
            </div>
          )}
          {view && view.pendingTexts.length > 0 && view.activePoll && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="row small">
                <strong>{view.pendingTexts.length} answers to review</strong>
                <span className="spacer" />
                <button onClick={() => act({ type: "approveUnflagged", blockId: view.activePoll! })}>Approve all unflagged</button>
              </div>
              <ul className="queue">
                {view.pendingTexts.slice(0, 20).map((t) => (
                  <li key={t.device}>
                    <span>{t.flagged && <span className="flag">FLAGGED</span>} {t.text}</span>
                    <div className="row">
                      <button className="small" onClick={() => act({ type: "moderateText", blockId: view.activePoll!, device: t.device, status: "approved" })}>Approve</button>
                      <button className="small danger" onClick={() => act({ type: "moderateText", blockId: view.activePoll!, device: t.device, status: "rejected" })}>Reject</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="stack" style={{ gap: 6 }}>
        <strong className="small">Questions to review ({pending.length})</strong>
        {pending.length === 0 && <span className="small muted">Nothing waiting. New questions appear here first; the room sees them only after you approve.</span>}
        <ul className="queue">
          {pending.map((q) => (
            <li key={q.id}>
              <span>{q.flagged && <span className="flag">FLAGGED</span>} {q.text}</span>
              <div className="row">
                <button className="small" onClick={() => act({ type: "moderateQuestion", questionId: q.id, status: "approved" })}>Approve</button>
                <button className="small danger" onClick={() => act({ type: "moderateQuestion", questionId: q.id, status: "dismissed" })}>Dismiss</button>
                {matchButton(q.id)}
              </div>
            </li>
          ))}
        </ul>
        {approved.length > 0 && <strong className="small">Approved, by votes</strong>}
        <ul className="queue">
          {approved.map((q) => (
            <li key={q.id}>
              <span><span className="votes">▲ {q.votes}</span> {q.text}</span>
              <div className="row">
                {matchButton(q.id)}
                <button className="small" onClick={() => act({ type: "moderateQuestion", questionId: q.id, status: "answered" })}>Answered</button>
              </div>
            </li>
          ))}
        </ul>
        {answered.length > 0 && <span className="small muted">{answered.length} answered</span>}
      </div>
    </section>
  );
}
