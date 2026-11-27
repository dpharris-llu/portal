"use client";
/**
 * Draft slides from an argument (F-003): set the time limit, choose which points
 * go in the talk (the rest become backup slides), and draft.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { getArguments, type StoredArgument } from "@/lib/argumentRepo";
import { argumentTitle, isSupported } from "@/model/argument";
import { draftFromArgument, MINUTES_PER_SLIDE, slidesFor } from "@/build/fromArgument";
import { applyOp, makeOp, type OpBody, type Operation } from "@/model/ops";
import { emptyDeck } from "@/model/factory";
import type { Author } from "@/model/types";
import { currentAuthorId, getRepo } from "@/lib/repo";

export default function DraftFromArgument() {
  const { argumentId } = useParams<{ argumentId: string }>();
  const router = useRouter();
  const [stored, setStored] = useState<StoredArgument | null | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(20);
  const [out, setOut] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getArguments().load(argumentId).then((s) => {
      setStored(s);
      if (s) setTitle(argumentTitle(s.argument));
    });
  }, [argumentId]);

  if (stored === null) return <main className="narrow"><p>This argument was not found. <Link href="/build">Back to Build</Link></p></main>;
  if (!stored) return <main className="narrow muted">Loading…</main>;
  const arg = stored.argument;
  const include = (id: string) => !out.has(id);
  const draft = draftFromArgument(arg, (p) => include(p.id));
  const fits = slidesFor(minutes);
  const over = draft.narrative.length > fits;

  async function create() {
    setBusy(true);
    setError("");
    try {
      const repo = getRepo();
      const me: Author = { kind: "human", id: await currentAuthorId() };
      const bodies: OpBody[] = [
        {
          kind: "deck.setMeta",
          patch: { title: title.trim() || argumentTitle(arg), goal: arg.purpose, audience: arg.audience, takeaway: arg.takeaway || arg.thesis, timeLimitMin: minutes, argumentId: arg.id, argumentVersion: arg.version },
        },
        ...draft.narrative.map((slide, index) => ({ kind: "slide.insert" as const, slide, section: "narrative" as const, index })),
        ...draft.backup.map((slide, index) => ({ kind: "slide.insert" as const, slide, section: "backup" as const, index })),
      ];
      let deck = emptyDeck({}, await repo.tenantId());
      const log: Operation[] = bodies.map((b) => makeOp(b, me, "Drafted from an argument"));
      for (const op of log) deck = applyOp(deck, op);
      await repo.save(deck, log, true);
      router.push(`/decks/${deck.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar />
      <main className="narrow stack">
        <h1 style={{ margin: 0 }}>Draft slides</h1>
        <p className="muted" style={{ margin: 0 }}>
          From the argument <Link href={`/research/${arg.id}`}>{argumentTitle(arg)}</Link>. The argument stays in Research; changes there will show here as slides to review.
        </p>
        <div className="row">
          <label style={{ flex: 3, minWidth: 220 }}>
            Deck title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label style={{ flex: 1, minWidth: 140 }}>
            Time limit (minutes)
            <input type="number" min={1} max={240} value={minutes} onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))} />
          </label>
        </div>
        {arg.points.length === 0 ? (
          <p className="notice small">This argument has no points yet. <Link href={`/research/${arg.id}`}>Add them in Research</Link>, or draft a title slide and build from there.</p>
        ) : (
          <section className="stack" aria-labelledby="pts-h">
            <h2 id="pts-h" style={{ margin: 0, fontSize: 18 }}>Points in the talk</h2>
            <p className="small muted" style={{ margin: 0 }}>Points you leave out become backup slides, ready if someone asks.</p>
            <ul className="findings">
              {arg.points.map((p, i) => (
                <li key={p.id}>
                  <label className="inline">
                    <input
                      type="checkbox"
                      checked={include(p.id)}
                      onChange={(e) =>
                        setOut((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.delete(p.id);
                          else n.add(p.id);
                          return n;
                        })
                      }
                      aria-label={`In the talk: ${p.text}`}
                    />
                    <span>
                      {i + 1}. <strong>{p.text || "Untitled point"}</strong>{" "}
                      {isSupported(p) ? <span className="chip">{p.evidence.length} evidence</span> : <span className="chip warn">Unsupported</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className={over ? "notice small" : "small"} role="status">
          {draft.narrative.length} slides in the talk{draft.backup.length ? ` and ${draft.backup.length} in backup` : ""}: about {draft.narrative.length * MINUTES_PER_SLIDE} minutes at {MINUTES_PER_SLIDE} minutes a slide.
          {over ? ` That's more than ${minutes} minutes allows (about ${fits} slides). Leave some points out of the talk, or raise the limit.` : ""}
        </p>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="row">
          <span className="spacer" />
          <button className="primary" onClick={create} disabled={busy}>{busy ? "Drafting…" : "Draft slides"}</button>
        </div>
      </main>
    </>
  );
}
