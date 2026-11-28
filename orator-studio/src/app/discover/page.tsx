"use client";
/**
 * Orator Discover (spec 3): explore an idea, find evidence, add your own, and
 * the Body of Knowledge they go into: your sources and the facts drawn from
 * them, reused by every topic and presentation.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { knowledge } from "@/knowledge/client";
import type { Fact, Source, SourceKind } from "@/knowledge/types";
import { FindEvidence, keptKey } from "@/discover/FindEvidence";
import { ExploreIdea } from "@/discover/ExploreIdea";
import { AddYourOwn } from "@/discover/AddYourOwn";
import { refreshScripture } from "@/discover/refresh";
import { KIND_LABEL } from "@/discover/labels";

type Tab = "find" | "explore" | "own";
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;


export default function DiscoverPage() {
  const k = knowledge();
  const [tab, setTab] = useState<Tab>("find");
  const [start, setStart] = useState("");
  const [sources, setSources] = useState<Source[] | null>(null);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [filter, setFilter] = useState("");
  const [kind, setKind] = useState<SourceKind | "all">("all");
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const s = await k.listSources("all");
      setSources(s);
      setFacts(await k.factsOf(s.map((x) => x.id)));
      return s;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return [];
    }
  }, [k]);

  useEffect(() => {
    load().then((s) =>
      refreshScripture(k, s).then((n) => {
        if (n) load();
      }),
    );
  }, [k, load]);

  const kept = useMemo(() => new Set((sources ?? []).filter((s) => s.status === "active").flatMap(keptKey)), [sources]);
  const factCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of facts) if (f.status === "active") m.set(f.source_id, (m.get(f.source_id) ?? 0) + 1);
    return m;
  }, [facts]);
  const shown = (sources ?? [])
    .filter((s) => (showDiscarded ? s.status === "discarded" : s.status === "active"))
    .filter((s) => kind === "all" || s.kind === kind)
    .filter((s) => !filter.trim() || `${s.title} ${s.citation} ${s.annotation}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const kinds = [...new Set((sources ?? []).filter((s) => s.status === "active").map((s) => s.kind))];
  const onKept = () => void load();

  return (
    <>
      <TopBar />
      <main className="wide stack" style={{ gap: 24 }}>
        <header className="page-head">
          <div>
            <p className="eyebrow">Orator Discover</p>
            <h1>What&apos;s out there?</h1>
            <p className="lede">Explore an idea, find evidence in trusted databases, or add your own. What you keep becomes your Body of Knowledge: sources and the facts drawn from them, ready for any topic.</p>
          </div>
        </header>

        <div className="discover-tabs" role="tablist" aria-label="Ways to discover">
          {([["find", "Find evidence"], ["explore", "Explore an idea"], ["own", "Add your own"]] as [Tab, string][]).map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "primary" : ""} onClick={() => setTab(t)}>{label}</button>
          ))}
        </div>
        <div className="discover-panel">
          {tab === "find" && <FindEvidence start={start} kept={kept} onKept={onKept} />}
          {tab === "explore" && <ExploreIdea onSearch={(w) => { setStart(w); setTab("find"); }} />}
          {tab === "own" && <AddYourOwn sources={sources ?? []} onKept={onKept} />}
        </div>

        <section className="stack" style={{ gap: 12 }} aria-labelledby="bok-h">
          <div className="row" style={{ alignItems: "baseline" }}>
            <h2 id="bok-h" className="section-h" style={{ flex: 1 }}>Your Body of Knowledge</h2>
            <span className="small muted">{plural((sources ?? []).filter((s) => s.status === "active").length, "source")} · {plural(facts.filter((f) => f.status === "active").length, "fact")}</span>
          </div>
          {error && <p className="notice" role="alert">{error}</p>}
          <div className="row">
            <input aria-label="Filter sources" placeholder="Filter by words" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ flex: "1 1 220px" }} />
            <select aria-label="Kind of source" value={kind} onChange={(e) => setKind(e.target.value as SourceKind | "all")} style={{ width: "auto" }}>
              <option value="all">All kinds</option>
              {kinds.map((x) => <option key={x} value={x}>{KIND_LABEL[x]}</option>)}
            </select>
            <label className="inline small"><input type="checkbox" checked={showDiscarded} onChange={(e) => setShowDiscarded(e.target.checked)} /> Discarded</label>
          </div>
          {sources === null ? (
            <p className="small muted">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="small muted">{sources.length ? "Nothing matches." : "Nothing kept yet. Find evidence above, or add your own."}</p>
          ) : (
            <div className="list-card">
              {shown.map((s) => (
                <Link key={s.id} href={`/discover/sources/${s.id}`} className="list-row">
                  <span className="title">{s.title}</span>
                  <span className="meta">{[KIND_LABEL[s.kind], s.year, s.origin === "discovered" ? "discovered" : s.origin === "copied" ? "copied" : s.origin === "ingested" ? "ingested" : "yours", `${factCount.get(s.id) ?? 0} fact${factCount.get(s.id) === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</span>
                  {s.access === "abstract" && <span className="pill">Abstract only</span>}
                  {s.is_public && <span className="pill navy">Public</span>}
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
