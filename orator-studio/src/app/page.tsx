"use client";
/** Home: the five modules (spec 3) and recent work: presentations, topics and slide decks. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { ModeBanner } from "@/components/ModeBanner";
import { Icon } from "@/components/Icon";
import { MODULES } from "@/components/ModuleNav";
import { getRepo } from "@/lib/repo";
import { knowledge } from "@/knowledge/client";

const BLURB: Record<string, string> = {
  discover: "Explore an idea and find evidence in trusted databases, or add your own. What you keep becomes your Body of Knowledge.",
  research: "Your Topic Library: on each topic, observe what the facts show and make your assertions.",
  build: "Presentations for a purpose and an audience, from your topics and assertions; then the slides.",
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

type Recent = { kind: "presentation" | "topic" | "deck"; href: string; title: string; updatedAt: string };
const LABEL: Record<Recent["kind"], string> = { presentation: "Presentation", topic: "Topic", deck: "Slides" };

export default function Home() {
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const [hello, setHello] = useState("Welcome");
  useEffect(() => {
    setHello(greeting());
    const k = knowledge();
    Promise.all([k.listPresentations().catch(() => []), k.listTopics().catch(() => []), getRepo().list().catch(() => [])]).then(([p, t, d]) =>
      setRecent(
        [
          ...p.map((x) => ({ kind: "presentation" as const, href: `/build/p/${x.id}`, title: x.title, updatedAt: x.updated_at })),
          ...t.map((x) => ({ kind: "topic" as const, href: `/curate/topics/${x.id}`, title: x.name, updatedAt: x.updated_at })),
          ...d.map((x) => ({ kind: "deck" as const, href: `/decks/${x.id}`, title: x.title, updatedAt: x.updatedAt })),
        ]
          .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))
          .slice(0, 8),
      ),
    );
  }, []);

  return (
    <>
      <TopBar />
      <ModeBanner />
      <main className="wide stack" style={{ gap: 40 }}>
        <header className="page-head">
          <div>
            <p className="eyebrow">Ideas first. Slides follow.</p>
            <h1>{hello}</h1>
            <p className="lede">Discover the evidence, curate your topics and assertions, and build presentations from them.</p>
          </div>
          <Link href="/build" className="button primary" style={{ minHeight: 44, padding: "0 20px", fontSize: 15 }}>
            <Icon name="plus" size={18} /> New presentation
          </Link>
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
            <p className="muted">Nothing yet. Start in Discover if you&apos;re exploring, or in Build if you know what you want to say.</p>
          ) : (
            <div className="list-card">
              {recent.map((r) => (
                <Link key={r.kind + r.href} href={r.href} className="list-row">
                  <span className={r.kind === "deck" ? "pill" : "pill navy"}>{LABEL[r.kind]}</span>
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
