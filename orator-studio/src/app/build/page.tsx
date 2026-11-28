"use client";
/** Orator Build: decks, and the ways to start one (spec 1A). */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { ModeBanner } from "@/components/ModeBanner";
import { DeckList, useOpenSample } from "@/components/DeckList";
import { getArguments, type ArgumentSummary } from "@/lib/argumentRepo";
import { Icon } from "@/components/Icon";

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
      <main className="wide stack" style={{ gap: 28 }}>
        <header className="page-head">
          <div>
            <p className="eyebrow">Orator Build</p>
            <h1>Turn the outline into slides</h1>
            <p className="lede">Slides that fit your time. Layout follows the content.</p>
          </div>
        </header>
        <div className="start-grid">
          <div className="start-card" style={{ cursor: "default" }}>
            <span className="icon-tile"><Icon name="research" /></span>
            <strong>From a presentation</strong>
            {args === null ? (
              <span className="small muted">Loading…</span>
            ) : args.length === 0 ? (
              <span className="small">No presentations yet. <Link href="/curate">Start one in Curate.</Link></span>
            ) : (
              <>
                <label className="small">
                  Presentation
                  <select value={pick} onChange={(e) => setPick(e.target.value)}>
                    {args.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                </label>
                <button className="primary" onClick={() => router.push(`/build/${pick}`)}>Draft slides</button>
              </>
            )}
          </div>
          <Link href="/import" className="start-card">
            <span className="icon-tile"><Icon name="upload" /></span>
            <strong>Import a PowerPoint deck</strong>
            <span className="small">Text, images, tables and notes convert; anything else is kept as an image, with a report.</span>
          </Link>
          <button className="start-card" onClick={() => openSample((h) => router.push(h))}>
            <span className="icon-tile"><Icon name="build" /></span>
            <strong>Open the demo deck</strong>
            <span className="small">A sample deck to try the editor, checks and presenting.</span>
          </button>
        </div>
        <h2 className="section-h">Your decks</h2>
        <DeckList action="edit" allowDelete empty="No decks yet." />
      </main>
    </>
  );
}
