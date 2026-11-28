"use client";
/** Orator Research: arguments, and the ways to start one (spec 3). */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { ModeBanner } from "@/components/ModeBanner";
import { getArguments, type ArgumentSummary } from "@/lib/argumentRepo";
import { emptyArgument } from "@/model/argument";
import { getRepo } from "@/lib/repo";
import { Icon } from "@/components/Icon";

export default function ResearchHome() {
  const router = useRouter();
  const [args, setArgs] = useState<ArgumentSummary[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const refresh = () => getArguments().list().then(setArgs);
  useEffect(() => {
    refresh();
  }, []);

  const [topic, setTopic] = useState("");
  async function blank() {
    // The topic is saved as the first operation, so it has history like any edit.
    const { applyArgOp, makeArgOp } = await import("@/model/argument");
    const { currentAuthorId } = await import("@/lib/repo");
    let arg = emptyArgument(await getRepo().tenantId());
    const ops = topic.trim() ? [makeArgOp({ kind: "arg.set", patch: { topic: topic.trim() } }, { kind: "human", id: await currentAuthorId() }, "Started a presentation")] : [];
    for (const op of ops) arg = applyArgOp(arg, op);
    await getArguments().save(arg, ops, true);
    router.push(`/curate/${arg.id}`);
  }

  async function remove(a: ArgumentSummary) {
    if (confirming !== a.id) return setConfirming(a.id);
    setConfirming(null);
    await getArguments().remove(a.id);
    refresh();
  }

  return (
    <>
      <TopBar />
      <ModeBanner />
      <main className="wide stack" style={{ gap: 28 }}>
        <header className="page-head">
          <div>
            <p className="eyebrow">Orator Curate</p>
            <h1>What is your presentation about?</h1>
            <p className="lede">Start from a topic. Discover what has been published, add what you already know, keep what matters, and hone your message. The outline becomes your slides, or a written brief.</p>
          </div>
        </header>
        <div className="start-grid">
          <form
            className="start-card new-presentation"
            onSubmit={(e) => {
              e.preventDefault();
              blank();
            }}
          >
            <span className="icon-tile"><Icon name="thought" /></span>
            <strong>New presentation</strong>
            <label className="small">
              Topic
              <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="For example: walking programs for type 2 diabetes" />
            </label>
            <button className="primary small" style={{ alignSelf: "flex-start" }}>Start</button>
            <span className="small muted">Then discover the latest evidence, add your own, and choose your message and points.</span>
          </form>
          <Link href="/documents" className="start-card">
            <span className="icon-tile"><Icon name="doc" /></span>
            <strong>Start from documents</strong>
            <span className="small">Monthly reports or statements as PDFs. Figures are lined up across them for you to confirm.</span>
          </Link>
          <Link href="/data" className="start-card">
            <span className="icon-tile"><Icon name="link" /></span>
            <strong>Start from a data URL</strong>
            <span className="small">An API or file returning JSON, XML or CSV, kept as a dated snapshot.</span>
          </Link>
          <Link href="/evidence" className="start-card">
            <span className="icon-tile"><Icon name="paper" /></span>
            <strong>Start from research papers</strong>
            <span className="small">Claude reads each paper for findings with quotes and pages, checked against the PDF.</span>
          </Link>
        </div>
        <h2 className="section-h">Your presentations</h2>
        {args === null ? (
          <p className="muted">Loading…</p>
        ) : args.length === 0 ? (
          <p className="muted">No presentations yet.</p>
        ) : (
          <ul className="deck-list">
            {args.map((a) => (
              <li key={a.id}>
                <Link href={`/curate/${a.id}`}><strong>{a.title}</strong></Link>
                <span className="muted small">{new Date(a.updatedAt).toLocaleString()}</span>
                <span className="spacer" />
                <Link href={`/build/${a.id}`}>Build slides</Link>
                <button className={confirming === a.id ? "danger" : "ghost danger"} onClick={() => remove(a)} onBlur={() => setConfirming(null)} aria-label={confirming === a.id ? `Confirm: delete ${a.title} for good` : `Delete ${a.title}`}>
                  {confirming === a.id ? "Confirm delete" : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
