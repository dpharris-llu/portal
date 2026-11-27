"use client";
/** Orator Engage (spec 1A, section 5A). */
import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { ModeBanner } from "@/components/ModeBanner";
import { DeckList } from "@/components/DeckList";
import { DEMO } from "@/lib/demo";

export default function EngageHome() {
  return (
    <>
      <TopBar />
      <ModeBanner />
      <main className="wide stack" style={{ gap: 28 }}>
        <header className="page-head"><div><p className="eyebrow">Orator Engage</p><h1>Involve the room</h1></div></header>
        <p className="lede">The room joins from their phones, with no account, for live polls and questions. Nothing a phone sends shows to the room until you approve it, and your slides keep working if the connection drops.</p>
        {DEMO && <p className="notice small">Phones need a server to connect to, so live sessions are off in this demo. Poll slides still show their questions.</p>}
        <div className="start-grid">
          <div className="start-card" style={{ cursor: "default" }}>
            <strong>Run a live session</strong>
            <span className="small">Open a deck in Present and choose <em>Start audience session</em>. Show the join screen with its QR code, then run polls and take moderated questions; each question links to the slide that answers it.</span>
          </div>
          <Link href="/join" className="start-card">
            <strong>Join a session</strong>
            <span className="small">For audience members: enter the code shown on screen.</span>
          </Link>
          <div className="start-card" style={{ cursor: "default" }}>
            <strong>Add a poll</strong>
            <span className="small">In Build, add a poll block to any slide. Results show on the slide live.</span>
          </div>
        </div>
        <h2 className="section-h">Present with a live audience</h2>
        <DeckList action="present" empty={<>No decks yet. <Link href="/build">Make one in Build.</Link></>} />
      </main>
    </>
  );
}
