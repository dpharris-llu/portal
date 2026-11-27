"use client";
/** Orator Research: arguments, and the ways to start one (spec 1A). */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { ModeBanner } from "@/components/ModeBanner";
import { getArguments, type ArgumentSummary } from "@/lib/argumentRepo";
import { emptyArgument } from "@/model/argument";
import { getRepo } from "@/lib/repo";

export default function ResearchHome() {
  const router = useRouter();
  const [args, setArgs] = useState<ArgumentSummary[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const refresh = () => getArguments().list().then(setArgs);
  useEffect(() => {
    refresh();
  }, []);

  async function blank() {
    const arg = emptyArgument(await getRepo().tenantId());
    await getArguments().save(arg, [], true);
    router.push(`/research/${arg.id}`);
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
      <main className="wide stack">
        <h1 style={{ margin: 0 }}>Orator Research</h1>
        <p className="muted" style={{ margin: 0 }}>Work out what is true and what to argue. The result is an argument you can build slides from, or share as a brief.</p>
        <div className="start-grid">
          <button className="start-card" onClick={blank}>
            <strong>Organize your thoughts</strong>
            <span className="small">Write your purpose and points, put them in order, and attach evidence as you find it. No sources needed to start.</span>
          </button>
          <Link href="/documents" className="start-card">
            <strong>Start from documents</strong>
            <span className="small">Monthly reports or statements as PDFs. Figures are lined up across them for you to confirm.</span>
          </Link>
          <Link href="/data" className="start-card">
            <strong>Start from a data URL</strong>
            <span className="small">An API or file returning JSON, XML or CSV, kept as a dated snapshot.</span>
          </Link>
          <Link href="/evidence" className="start-card">
            <strong>Start from research papers</strong>
            <span className="small">Claude reads each paper for findings with quotes and pages, checked against the PDF.</span>
          </Link>
        </div>
        <h2 style={{ margin: "8px 0 0", fontSize: 18 }}>Your arguments</h2>
        {args === null ? (
          <p className="muted">Loading…</p>
        ) : args.length === 0 ? (
          <p className="muted">No arguments yet.</p>
        ) : (
          <ul className="deck-list">
            {args.map((a) => (
              <li key={a.id}>
                <Link href={`/research/${a.id}`}><strong>{a.title}</strong></Link>
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
