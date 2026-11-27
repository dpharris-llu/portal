"use client";
/** Home: the four modules (spec 1A) and recent work. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { ModeBanner } from "@/components/ModeBanner";
import { DeckList } from "@/components/DeckList";
import { getArguments, type ArgumentSummary } from "@/lib/argumentRepo";

export default function Home() {
  const [args, setArgs] = useState<ArgumentSummary[] | null>(null);
  useEffect(() => {
    getArguments().list().then(setArgs);
  }, []);

  return (
    <>
      <TopBar />
      <ModeBanner />
      <main className="wide stack">
        <h1 style={{ margin: 0 }}>Build your case, then present it</h1>
        <div className="module-grid">
          <section className="module-card" aria-labelledby="m-research">
            <h2 id="m-research">Orator Research</h2>
            <p>Work out what is true and what to argue. Organize your thoughts, or start from documents, data or research papers. Every number and quote is checked against its source.</p>
            <div className="actions"><Link href="/research"><button className="primary">Open Research</button></Link></div>
          </section>
          <section className="module-card" aria-labelledby="m-build">
            <h2 id="m-build">Orator Build</h2>
            <p>Turn an argument into slides that fit your time, or import a PowerPoint deck and keep going.</p>
            <div className="actions"><Link href="/build"><button>Open Build</button></Link></div>
          </section>
          <section className="module-card" aria-labelledby="m-present">
            <h2 id="m-present">Orator Present</h2>
            <p>Present with a private presenter view, jump to any slide by search during questions, and export to PowerPoint or PDF.</p>
            <div className="actions"><Link href="/present"><button>Open Present</button></Link></div>
          </section>
          <section className="module-card" aria-labelledby="m-engage">
            <h2 id="m-engage">Orator Engage</h2>
            <p>Let the room join from their phones for live polls and moderated questions, each linked to the slide that answers it.</p>
            <div className="actions"><Link href="/engage"><button>Open Engage</button></Link></div>
          </section>
        </div>

        <div className="row" style={{ alignItems: "flex-start", gap: 24 }}>
          <section className="stack" style={{ flex: 1, minWidth: 280 }} aria-labelledby="recent-args">
            <h2 id="recent-args" style={{ margin: 0, fontSize: 18 }}>Recent arguments</h2>
            {args === null ? (
              <p className="muted">Loading…</p>
            ) : args.length === 0 ? (
              <p className="muted">None yet. <Link href="/research">Start one in Research.</Link></p>
            ) : (
              <ul className="deck-list">
                {args.slice(0, 5).map((a) => (
                  <li key={a.id}>
                    <Link href={`/research/${a.id}`}><strong>{a.title}</strong></Link>
                    <span className="muted small">{new Date(a.updatedAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="stack" style={{ flex: 1, minWidth: 280 }} aria-labelledby="recent-decks">
            <h2 id="recent-decks" style={{ margin: 0, fontSize: 18 }}>Recent decks</h2>
            <DeckList action="edit" limit={5} empty={<>None yet. <Link href="/build">Start one in Build.</Link></>} />
          </section>
        </div>
      </main>
    </>
  );
}
