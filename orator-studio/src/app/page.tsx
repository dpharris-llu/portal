"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getRepo, type DeckSummary } from "@/lib/repo";
import { sampleDeckOps } from "@/model/sample";
import { applyOp, makeOp } from "@/model/ops";
import { currentAuthorId } from "@/lib/repo";
import { browserSupabase } from "@/lib/supabase/client";
import { TopBar } from "@/components/TopBar";
import { DEMO } from "@/lib/demo";

export default function Home() {
  const router = useRouter();
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function refresh() {
    setDecks(await getRepo().list());
  }
  useEffect(() => {
    refresh();
  }, []);

  async function openSample() {
    const repo = getRepo();
    const { deck: empty, ops } = sampleDeckOps();
    const me = { kind: "human" as const, id: await currentAuthorId() };
    const log = ops.map((op) => makeOp(op, me, "Created demo deck"));
    const deck = log.reduce(applyOp, { ...empty, tenantId: await repo.tenantId() });
    await repo.save(deck, log, true);
    router.push(`/decks/${deck.id}`);
  }

  async function remove(d: DeckSummary) {
    // Two clicks instead of confirm(), which some embedded viewers block.
    if (confirming !== d.id) return setConfirming(d.id);
    setConfirming(null);
    await getRepo().remove(d.id);
    refresh();
  }

  return (
    <>
      <TopBar />
      {DEMO ? (
        <div className="banner" role="status">
          Demo: everything runs in this browser, and decks are saved only here. Audience polls and Q&amp;A from phones need the full app.
        </div>
      ) : (
        !browserSupabase() && (
          <div className="banner" role="status">
            Local mode: decks are saved in this browser only. Set the Supabase variables in <code>.env.local</code> to sign in and sync.
          </div>
        )
      )}
      <main className="narrow stack">
        <div className="row">
          <h1 style={{ margin: 0 }}>Your decks</h1>
          <span className="spacer" />
          <button onClick={openSample}>Open demo deck</button>
          <Link href="/import"><button>Import PPTX</button></Link>
          <Link href="/new"><button className="primary">New deck</button></Link>
        </div>
        {decks === null ? (
          <p className="muted">Loading…</p>
        ) : decks.length === 0 ? (
          <p className="muted">No decks yet. Start a new deck from a goal, or open the demo deck.</p>
        ) : (
          <ul className="deck-list">
            {decks.map((d) => (
              <li key={d.id}>
                <Link href={`/decks/${d.id}`}><strong>{d.title}</strong></Link>
                <span className="muted small">{new Date(d.updatedAt).toLocaleString()}</span>
                <span className="spacer" />
                <Link href={`/decks/${d.id}/present`}>Present</Link>
                <button className={confirming === d.id ? "danger" : "ghost danger"} onClick={() => remove(d)} onBlur={() => setConfirming(null)} aria-label={confirming === d.id ? `Confirm: delete ${d.title} for good` : `Delete ${d.title}`}>
                  {confirming === d.id ? "Confirm delete" : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
