"use client";
/**
 * Orator Build: presentations (F-136), each with a purpose and an audience,
 * made from a series of topics and their assertions; and the slides drafted
 * from them. Importing a PowerPoint deck and the demo deck are here too.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { DeckList, useOpenSample } from "@/components/DeckList";
import { Icon } from "@/components/Icon";
import { knowledge } from "@/knowledge/client";
import type { Presentation } from "@/knowledge/types";

export default function BuildHome() {
  const k = knowledge();
  const router = useRouter();
  const openSample = useOpenSample();
  const [list, setList] = useState<Presentation[] | null>(null);
  const [flags, setFlags] = useState<Record<string, number>>({});
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [audience, setAudience] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const l = await k.listPresentations();
      setList(l);
      const f = await k.openFlags("presentation", l.map((p) => p.id));
      setFlags(f.reduce<Record<string, number>>((m, x) => ({ ...m, [x.object_id]: (m[x.object_id] ?? 0) + 1 }), {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [k]);
  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const p = await k.createPresentation({ title: title.trim() || "Untitled presentation", purpose: purpose.trim(), audience: audience.trim() });
      router.push(`/build/p/${p.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar />
      <main className="wide stack" style={{ gap: 28 }}>
        <header className="page-head">
          <div>
            <p className="eyebrow">Orator Build</p>
            <h1>What will you say, and to whom?</h1>
            <p className="lede">A presentation has a purpose and an audience. Build it from a series of topics and the assertions that suit them, then draft the slides.</p>
          </div>
        </header>

        <form className="add-box stack" style={{ gap: 10 }} onSubmit={create}>
          <strong>New presentation</strong>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Why weekly rest matters for clinicians" />
          </label>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label style={{ flex: "1 1 260px" }}>
              Purpose
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Persuade the wellness committee to fund protected rest" />
            </label>
            <label style={{ flex: "1 1 220px" }}>
              Audience
              <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Hospital wellness committee" />
            </label>
          </div>
          <div className="row">
            <button className="primary" disabled={busy}>Create presentation</button>
          </div>
        </form>

        <section className="stack" style={{ gap: 12 }}>
          <h2 className="section-h">Your presentations</h2>
          {error && <p className="notice" role="alert">{error}</p>}
          {list === null ? (
            <p className="small muted">Loading…</p>
          ) : list.length === 0 ? (
            <p className="small muted">No presentations yet. Create one above.</p>
          ) : (
            <div className="list-card">
              {list.map((p) => (
                <Link key={p.id} href={`/build/p/${p.id}`} className="list-row">
                  <span className="title">{p.title}</span>
                  <span className="meta">{[p.purpose, p.audience && `for ${p.audience}`].filter(Boolean).join(" · ")}</span>
                  {flags[p.id] ? <span className="pill warn">{flags[p.id]} to review</span> : null}
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="start-grid">
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
        <h2 className="section-h">Your slide decks</h2>
        <DeckList action="edit" allowDelete empty="No decks yet." />
      </main>
    </>
  );
}
