"use client";
/** The participant's phone page (A-01, A-02, A-04): answer the open poll, ask and upvote questions. */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { mergeRoom, type Answer, type ParticipantView, type RoomView } from "@/audience/model";
import { browserSupabase } from "@/lib/supabase/client";
import { Wordmark } from "@/components/Wordmark";

function deviceId(): string {
  try {
    let id = localStorage.getItem("lectern-device");
    if (!id) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("lectern-device", id);
    }
    return id;
  } catch {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  }
}

const mineKey = (code: string) => `lectern-mine-${code.toUpperCase()}`;

function loadMine(code: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(mineKey(code)) ?? "[]"));
  } catch {
    return new Set();
  }
}

export default function ParticipantPage() {
  const { code } = useParams<{ code: string }>();
  const [device, setDevice] = useState<string | null>(null);
  const [view, setView] = useState<ParticipantView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tab, setTab] = useState<"poll" | "qa">("poll");
  const [msg, setMsg] = useState<string | null>(null);
  const mine = useRef<Set<string>>(new Set());
  const viewRef = useRef<ParticipantView | null>(null);
  viewRef.current = view;
  const refetch = useRef<(delayMs?: number) => void>(() => {});

  useEffect(() => {
    setDevice(deviceId());
    mine.current = loadMine(code);
  }, [code]);

  useEffect(() => {
    if (!device) return;
    let stopped = false;
    let es: EventSource | null = null;
    let cleanupRealtime = () => {};
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async (): Promise<"sse" | "realtime" | null> => {
      const res = await fetch(`/api/live/join/${code}?device=${device}`, { cache: "no-store" }).catch(() => null);
      if (stopped) return null;
      if (!res) {
        setProblem("Could not reach the presentation.");
        return null;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProblem(json.error ?? "Could not join.");
        return null;
      }
      setView(json.view);
      setProblem(null);
      return json.transport;
    };

    // Spread refetches out so a room of phones does not hit the server at once.
    refetch.current = (delayMs = 0) => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void load();
      }, delayMs + Math.random() * 1200);
    };

    (async () => {
      const transport = await load();
      if (!transport || stopped) return;
      if (transport === "sse") {
        es = new EventSource(`/api/live/join/${code}/stream?device=${device}`);
        es.addEventListener("view", (e) => setView(JSON.parse((e as MessageEvent).data)));
        es.addEventListener("gone", () => {
          es?.close();
          setProblem("This session has ended.");
        });
        es.onerror = () => {
          if (es?.readyState === EventSource.CLOSED) setProblem("Lost the connection. Reload to try again.");
        };
        return;
      }
      const sb = browserSupabase();
      if (!sb) return;
      await sb.realtime.setAuth();
      const ch = sb
        .channel(`live-room:${code.toUpperCase()}`, { config: { private: true } })
        .on("broadcast", { event: "room" }, ({ payload }) => {
          const prev = viewRef.current;
          if (!prev) return;
          const merged = mergeRoom(prev, payload as RoomView, mine.current);
          if (merged) setView(merged);
          else refetch.current();
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") refetch.current(); // catch up on anything missed while connecting
        });
      // Safety net for missed broadcasts.
      const slow = setInterval(() => refetch.current(), 20000);
      cleanupRealtime = () => {
        clearInterval(slow);
        void sb.removeChannel(ch);
      };
    })();

    return () => {
      stopped = true;
      es?.close();
      cleanupRealtime();
      if (timer) clearTimeout(timer);
    };
  }, [code, device]);

  async function send(action: { type: string; [k: string]: unknown }): Promise<boolean> {
    const res = await fetch(`/api/live/join/${code}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device, action }),
    }).catch(() => null);
    if (!res) {
      setMsg("Could not reach the presentation.");
      return false;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(json.error ?? "That did not work.");
      return false;
    }
    setMsg(null);
    // Show our own change at once; broadcasts carry everyone else's.
    if (action.type === "respond") setView((v) => (v && v.poll ? { ...v, poll: { ...v.poll, responded: true } } : v));
    if (action.type === "vote") {
      setView((v) =>
        v && {
          ...v,
          questions: v.questions.map((q) => (q.id === action.questionId ? { ...q, voted: !q.voted, votes: q.votes + (q.voted ? -1 : 1) } : q)),
        },
      );
    }
    if (action.type === "ask" && json.id) {
      mine.current.add(json.id);
      try { localStorage.setItem(mineKey(code), JSON.stringify([...mine.current])); } catch {}
      setView((v) => v && { ...v, myPending: v.myPending + 1 });
    }
    return true;
  }

  if (problem) {
    return (
      <main className="phone">
        <Wordmark size={22} />
        <p role="alert">{problem}</p>
        <Link href="/join">Enter a different code</Link>
      </main>
    );
  }
  if (!view) return <main className="phone"><p role="status">Joining…</p></main>;
  if (view.ended) return <main className="phone"><Wordmark size={22} /><p>This session has ended. Thank you.</p></main>;

  return (
    <main className="phone">
      <div className="row">
        <Wordmark size={20} />
        <span className="spacer" />
        <span className="small muted">Code {view.code}</span>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "poll"} onClick={() => setTab("poll")}>Poll{view.poll && !view.poll.responded ? " •" : ""}</button>
        <button role="tab" aria-selected={tab === "qa"} onClick={() => setTab("qa")}>Questions ({view.questions.length})</button>
      </div>
      {msg && <p role="alert" className="error">{msg}</p>}
      {tab === "poll" ? (
        <PollCard view={view} send={send} />
      ) : (
        <QaCard view={view} send={send} />
      )}
    </main>
  );
}

function PollCard({ view, send }: { view: ParticipantView; send: (a: { type: string; [k: string]: unknown }) => Promise<boolean> }) {
  const poll = view.poll;
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [order, setOrder] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setChoice(null);
    setText("");
    setOrder(poll ? poll.options.map((_, i) => i) : []);
  }, [poll?.blockId, poll?.kind, poll?.options.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!poll) return <section className="card"><p>No poll is open right now. Keep this page open; the next poll appears here.</p></section>;
  if (poll.responded) return <section className="card"><p className="b-poll-q">{poll.question}</p><p role="status">Response recorded. Thank you.</p></section>;

  async function submit(answer: Answer) {
    setBusy(true);
    await send({ type: "respond", blockId: poll!.blockId, answer });
    setBusy(false);
  }

  return (
    <section className="card" aria-labelledby="poll-q">
      <p id="poll-q" className="b-poll-q">{poll.question}</p>
      {poll.kind === "choice" && (
        <>
          <div className="choices" role="radiogroup" aria-labelledby="poll-q">
            {poll.options.map((o, i) => (
              <button key={i} role="radio" aria-checked={choice === i} aria-pressed={choice === i} onClick={() => setChoice(i)}>{o}</button>
            ))}
          </div>
          <button className="primary" disabled={choice === null || busy} onClick={() => submit({ kind: "choice", option: choice! })}>Submit</button>
        </>
      )}
      {poll.kind === "rating" && (
        <>
          <div className="scale" role="radiogroup" aria-labelledby="poll-q">
            {Array.from({ length: poll.scale ?? 5 }, (_, i) => i + 1).map((v) => (
              <button key={v} role="radio" aria-checked={choice === v} aria-pressed={choice === v} onClick={() => setChoice(v)}>{v}</button>
            ))}
          </div>
          <p className="small muted">1 is lowest, {poll.scale ?? 5} is highest.</p>
          <button className="primary" disabled={choice === null || busy} onClick={() => submit({ kind: "rating", value: choice! })}>Submit</button>
        </>
      )}
      {poll.kind === "ranking" && (
        <>
          <ol className="queue" aria-label="Your ranking, top first">
            {order.map((opt, place) => (
              <li key={opt} className="row">
                <span style={{ flex: 1 }}>{place + 1}. {poll.options[opt]}</span>
                <button aria-label={`Move ${poll.options[opt]} up`} disabled={place === 0} onClick={() => setOrder((o) => { const n = [...o]; [n[place - 1], n[place]] = [n[place], n[place - 1]]; return n; })}>↑</button>
                <button aria-label={`Move ${poll.options[opt]} down`} disabled={place === order.length - 1} onClick={() => setOrder((o) => { const n = [...o]; [n[place + 1], n[place]] = [n[place], n[place + 1]]; return n; })}>↓</button>
              </li>
            ))}
          </ol>
          <button className="primary" disabled={busy} onClick={() => submit({ kind: "ranking", order })}>Submit ranking</button>
        </>
      )}
      {(poll.kind === "text" || poll.kind === "wordcloud") && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); if (text.trim()) submit({ kind: "text", text }); }}>
          <label>
            {poll.kind === "wordcloud" ? "One word or short phrase" : "Your answer"}
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={poll.kind === "wordcloud" ? 40 : 280} />
          </label>
          <button className="primary" disabled={!text.trim() || busy}>Submit</button>
          <p className="small muted">The presenter reviews answers before they appear on screen.</p>
        </form>
      )}
    </section>
  );
}

function QaCard({ view, send }: { view: ParticipantView; send: (a: { type: string; [k: string]: unknown }) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <>
      {view.qaOpen ? (
        <form
          className="card"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await send({ type: "ask", text })) {
              setText("");
              setSent(true);
            }
          }}
        >
          <label>
            Ask a question
            <textarea value={text} onChange={(e) => { setText(e.target.value); setSent(false); }} maxLength={280} rows={3} />
          </label>
          <button className="primary" disabled={text.trim().length < 3}>Send</button>
          {(sent || view.myPending > 0) && (
            <p className="small" role="status">
              {view.myPending > 0 ? `${view.myPending} of your questions ${view.myPending === 1 ? "is" : "are"} waiting for the presenter to approve.` : "Sent."}
            </p>
          )}
        </form>
      ) : (
        <p className="card">Questions are closed right now.</p>
      )}
      <section className="card" aria-label="Questions from the room">
        {view.questions.length === 0 && <p className="muted">No questions yet.</p>}
        <ul className="queue">
          {view.questions.map((q) => (
            <li key={q.id} className="row">
              <span style={{ flex: 1 }}>
                {q.text}
                {q.mine && <span className="muted small"> (yours)</span>}
                {q.answered && <span className="muted small"> · answered</span>}
              </span>
              <button
                aria-pressed={q.voted}
                disabled={q.mine || q.answered}
                onClick={() => send({ type: "vote", questionId: q.id })}
                aria-label={`${q.voted ? "Remove vote from" : "Upvote"}: ${q.text}. ${q.votes} votes.`}
              >
                ▲ {q.votes}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
