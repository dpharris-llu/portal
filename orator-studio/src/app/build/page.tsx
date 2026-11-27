"use client";
/** Orator Build: decks, and the ways to start one (spec 1A). */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { ModeBanner } from "@/components/ModeBanner";
import { DeckList, useOpenSample } from "@/components/DeckList";
import { getArguments, type ArgumentSummary } from "@/lib/argumentRepo";

export default function BuildHome() {
  const router = useRouter();
  const openSample = useOpenSample();
  const [args, setArgs] = useState<ArgumentSummary[] | null>(null);
  const [pick, setPick] = useState("");
  useEffect(() => {
    getArguments().list().then((a) => {
      setArgs(a);
      if (a[0]) setPick(a[0].id);
    });
  }, []);

  return (
    <>
      <TopBar />
      <ModeBanner />
      <main className="wide stack">
        <h1 style={{ margin: 0 }}>Orator Build</h1>
        <p className="muted" style={{ margin: 0 }}>Turn an argument into slides that fit your time. Layout follows the content.</p>
        <div className="start-grid">
          <div className="start-card" style={{ cursor: "default" }}>
            <strong>From an argument</strong>
            {args === null ? (
              <span className="small muted">Loading…</span>
            ) : args.length === 0 ? (
              <span className="small">No arguments yet. <Link href="/research">Organize your thoughts in Research first.</Link></span>
            ) : (
              <>
                <label className="small">
                  Argument
                  <select value={pick} onChange={(e) => setPick(e.target.value)}>
                    {args.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                </label>
                <button className="primary" onClick={() => router.push(`/build/${pick}`)}>Draft slides</button>
              </>
            )}
          </div>
          <Link href="/import" className="start-card">
            <strong>Import a PowerPoint deck</strong>
            <span className="small">Text, images, tables and notes convert; anything else is kept as an image, with a report.</span>
          </Link>
          <button className="start-card" onClick={() => openSample((h) => router.push(h))}>
            <strong>Open the demo deck</strong>
            <span className="small">A sample deck to try the editor, checks and presenting.</span>
          </button>
        </div>
        <h2 style={{ margin: "8px 0 0", fontSize: 18 }}>Your decks</h2>
        <DeckList action="edit" allowDelete empty="No decks yet." />
      </main>
    </>
  );
}
