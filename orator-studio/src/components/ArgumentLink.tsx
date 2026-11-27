"use client";
/**
 * In the deck editor: which argument the slides were drafted from, and, when the
 * argument has changed since, which slides that affects (F-003).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Deck } from "@/model/types";
import type { OpBody } from "@/model/ops";
import { getArguments, type StoredArgument } from "@/lib/argumentRepo";
import { argumentTitle, changesSince } from "@/model/argument";

export function ArgumentLink({ deck, commit, onSelect }: { deck: Deck; commit: (op: OpBody, reason: string) => void; onSelect: (slideId: string) => void }) {
  const [stored, setStored] = useState<StoredArgument | null>(null);
  const id = deck.meta.argumentId;
  useEffect(() => {
    if (id) getArguments().load(id).then(setStored);
  }, [id]);
  if (!id || !stored) return null;
  const arg = stored.argument;
  const since = deck.meta.argumentVersion ?? 0;
  const order = [...deck.narrative, ...deck.backup];
  const number = (sid: string) => order.indexOf(sid) + 1;
  const changed = arg.version > since ? changesSince(stored.log, since) : null;
  const affected = changed ? order.filter((sid) => deck.slides[sid].pointId && changed.points.has(deck.slides[sid].pointId!)) : [];
  const inDeck = new Set(order.map((sid) => deck.slides[sid].pointId).filter(Boolean));
  const added = changed ? arg.points.filter((p) => changed.points.has(p.id) && !inDeck.has(p.id)).length : 0;

  return (
    <div className={`linked-banner${changed ? " changed" : ""}`} role="status">
      <span>
        Drafted from the argument <Link href={`/research/${arg.id}`}>{argumentTitle(arg)}</Link>.
      </span>
      {changed && (
        <>
          <span>
            <strong>It has changed since.</strong>{" "}
            {affected.length > 0 && (
              <>
                Slides to review:{" "}
                {affected.map((sid) => (
                  <button key={sid} className="small slide-ref" onClick={() => onSelect(sid)} aria-label={`Go to slide ${number(sid)}`}>
                    Slide {number(sid)}
                  </button>
                ))}{" "}
              </>
            )}
            {added > 0 && `${added} new point${added === 1 ? "" : "s"} not in the deck. `}
            {changed.framing && "The thesis, recommendation or next steps changed. "}
            {!affected.length && !added && !changed.framing && "Points were removed or reordered. "}
          </span>
          <button className="small" onClick={() => commit({ kind: "deck.setMeta", patch: { argumentVersion: arg.version } }, "Reviewed argument changes")}>Mark as reviewed</button>
        </>
      )}
    </div>
  );
}
