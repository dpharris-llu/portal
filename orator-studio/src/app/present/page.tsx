"use client";
/** Orator Present (spec 1A, section 5). */
import { TopBar } from "@/components/TopBar";
import { ModeBanner } from "@/components/ModeBanner";
import { DeckList } from "@/components/DeckList";
import Link from "next/link";

export default function PresentHome() {
  return (
    <>
      <TopBar />
      <ModeBanner />
      <main className="wide stack">
        <h1 style={{ margin: 0 }}>Orator Present</h1>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          <li>The presenter view shows your notes, the next slide and a timer. The audience sees only the slide.</li>
          <li>During questions, press Ctrl+K (Cmd+K on a Mac) to search every slide, including backups. A match shows on your screen first; one key sends it to the room, and one more returns you to where you were.</li>
          <li>Once a deck has been opened, it presents with no network.</li>
        </ul>
        <h2 style={{ margin: "8px 0 0", fontSize: 18 }}>Choose a deck to present</h2>
        <DeckList action="present" empty={<>No decks yet. <Link href="/build">Make one in Build.</Link></>} />
      </main>
    </>
  );
}
