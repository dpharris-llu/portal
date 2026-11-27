"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getRepo, type DeckSummary } from "@/lib/repo";

/** The author's decks, with the action that fits the module showing them. */
export function DeckList({ action, empty, allowDelete = false, limit }: { action: "edit" | "present"; empty: React.ReactNode; allowDelete?: boolean; limit?: number }) {
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const refresh = () => getRepo().list().then(setDecks);
  useEffect(() => {
    refresh();
  }, []);

  async function remove(d: DeckSummary) {
    // Two clicks instead of confirm(), which some embedded viewers block.
    if (confirming !== d.id) return setConfirming(d.id);
    setConfirming(null);
    await getRepo().remove(d.id);
    refresh();
  }

  if (decks === null) return <p className="muted">Loading…</p>;
  if (!decks.length) return <p className="muted">{empty}</p>;
  return (
    <ul className="deck-list">
      {decks.slice(0, limit).map((d) => (
        <li key={d.id}>
          <Link href={action === "present" ? `/decks/${d.id}/present` : `/decks/${d.id}`}><strong>{d.title}</strong></Link>
          <span className="muted small">{new Date(d.updatedAt).toLocaleString()}</span>
          <span className="spacer" />
          {action === "edit" ? <Link href={`/decks/${d.id}/present`}>Present</Link> : <Link href={`/decks/${d.id}`}>Edit</Link>}
          {allowDelete && (
            <button className={confirming === d.id ? "danger" : "ghost danger"} onClick={() => remove(d)} onBlur={() => setConfirming(null)} aria-label={confirming === d.id ? `Confirm: delete ${d.title} for good` : `Delete ${d.title}`}>
              {confirming === d.id ? "Confirm delete" : "Delete"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Opens the built-in demo deck. */
export function useOpenSample() {
  return async (push: (href: string) => void) => {
    const { sampleDeckOps } = await import("@/model/sample");
    const { applyOp, makeOp } = await import("@/model/ops");
    const { currentAuthorId } = await import("@/lib/repo");
    const repo = getRepo();
    const { deck: empty, ops } = sampleDeckOps();
    const me = { kind: "human" as const, id: await currentAuthorId() };
    const log = ops.map((op) => makeOp(op, me, "Created demo deck"));
    const deck = log.reduce(applyOp, { ...empty, tenantId: await repo.tenantId() });
    await repo.save(deck, log, true);
    push(`/decks/${deck.id}`);
  };
}
