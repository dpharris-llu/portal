"use client";
/** The participant's phone page (A-01, A-02, A-04): answer the open poll, ask and upvote questions. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Answer, ParticipantView } from "@/audience/model";
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

export default function ParticipantPage() {
  const { code } = useParams<{ code: string }>();
  const [device, setDevice] = useState<string | null>(null);
  const [view, setView] = useState<ParticipantView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tab, setTab] = useState<"poll" | "qa">("poll");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => setDevice(deviceId()), []);

  useEffect(() => {
    if (!device) return;
    let es: EventSource | null = null;
    let stopped = false;
    // Check the code first so a bad code gets a clear message instead of endless retries.
    fetch(`/api/live/join/${code}/stream?device=${device}`, { method: "GET" })
      .then(async (res) => {
        if (!res.ok) {
          setProblem((await res.json().catch(() => ({}))).error ?? "Could not join.");
          return;
        }
        res.body?.cancel();
        if (stopped) return;
        es = new EventSource(`/api/live/join/${code}/stream?device=${device}`);
        es.addEventListener("view", (e) => {
          setView(JSON.parse((e as MessageEvent).data));
          setProblem(null);
        });
        es.addEventListener("gone", () => {
          es?.close();
          setProblem("This session has ended.");
        });
        es.onerror = () => {
          if (es?.readyState === EventSource.CLOSED) setProblem("Lost the connection. Reload to try again.");
        };
      })
      .catch(() => setProblem("Could not reach the presentation."));
    return () => {
      stopped = true;
      es?.close();
    };
  }, [code, device]);

  async function send(action: unknown): Promise<boolean> {
    const res = await fetch(`/api/live/join/${code}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device, action }),
    }).catch(() => null);
    if (!res) {
      setMsg("Could not reach the presentation.");
      return false;
    }
    if (!res.ok) {
      setMsg((await res.json().catch(() => ({}))).error ?? "That did not work.");
      return false;
    }
    setMsg(null);
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

function PollCard({ view, send }: { view: ParticipantView; send: (a: unknown) => Promise<boolean> }) {
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

function QaCard({ view, send }: { view: ParticipantView; send: (a: unknown) => Promise<boolean> }) {
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
