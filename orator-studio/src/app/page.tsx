"use client";
/** Home: the four modules (spec 3) and recent work, in the spec Appendix C design. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { ModeBanner } from "@/components/ModeBanner";
import { Icon } from "@/components/Icon";
import { MODULES } from "@/components/ModuleNav";
import { getArguments, type ArgumentSummary } from "@/lib/argumentRepo";
import { getRepo, type DeckSummary } from "@/lib/repo";
import { emptyArgument } from "@/model/argument";

const BLURB: Record<string, string> = {
  research: "Discover what is known, curate the evidence and hone your message. Every fact traceable to its source.",
  build: "Turn your outline into slides that fit your time, or import a PowerPoint deck.",
  present: "A private presenter view, and search to any slide during questions.",
  engage: "Live polls and moderated questions from phones, linked to your slides.",
};

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function when(iso: string) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Recent = { kind: "argument" | "deck"; id: string; title: string; updatedAt: string };

export default function Home() {
  const router = useRouter();
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const [hello, setHello] = useState("Welcome");
  useEffect(() => {
    setHello(greeting());
    Promise.all([getArguments().list(), getRepo().list()]).then(([a, d]: [ArgumentSummary[], DeckSummary[]]) =>
      setRecent(
        [...a.map((x) => ({ kind: "argument" as const, ...x })), ...d.map((x) => ({ kind: "deck" as const, ...x }))]
          .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))
          .slice(0, 6),
      ),
    );
  }, []);

  async function newArgument() {
    const arg = emptyArgument(await getRepo().tenantId());
    await getArguments().save(arg, [], true);
    router.push(`/curate/${arg.id}`);
  }

  return (
    <>
      <TopBar />
      <ModeBanner />
      <main className="wide stack" style={{ gap: 40 }}>
        <header className="page-head">
          <div>
            <p className="eyebrow">Ideas first. Slides follow.</p>
            <h1>{hello}</h1>
            <p className="lede">Pick up a presentation, or start a new one.</p>
          </div>
          <button className="primary" style={{ minHeight: 44, padding: "0 20px", fontSize: 15 }} onClick={newArgument}>
            <Icon name="plus" size={18} /> New presentation
          </button>
        </header>

        <section className="module-grid" aria-label="Modules">
          {MODULES.map((m) => (
            <Link key={m.key} href={m.href} className="module-card">
              <span className="icon-tile"><Icon name={m.key} /></span>
              <h2>{m.name}</h2>
              <p>{BLURB[m.key]}</p>
            </Link>
          ))}
        </section>

        <section className="stack" style={{ gap: 12 }} aria-labelledby="recent-h">
          <h2 id="recent-h" className="section-h">Continue where you left off</h2>
          {recent === null ? (
            <p className="muted">Loading…</p>
          ) : recent.length === 0 ? (
            <p className="muted">Nothing yet. Start a presentation in Curate, or open the demo deck from Build.</p>
          ) : (
            <div className="list-card">
              {recent.map((r) => (
                <Link key={r.kind + r.id} href={r.kind === "argument" ? `/curate/${r.id}` : `/decks/${r.id}`} className="list-row">
                  <span className={r.kind === "argument" ? "pill navy" : "pill"}>{r.kind === "argument" ? "Presentation" : "Slides"}</span>
                  <span className="title">{r.title}</span>
                  <span className="meta">Edited {when(r.updatedAt)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
