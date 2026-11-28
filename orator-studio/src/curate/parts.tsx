"use client";
/**
 * Pieces of a topic page: short fact references (F1, F2…), the fact picker,
 * and the assertion composer. An assertion is always typed by a person, in
 * their own words (F-133); facts are linked to it as supporting, qualifying
 * or contradicting.
 */
import { useEffect, useMemo, useState } from "react";
import type { Fact, LinkRole, Source } from "@/knowledge/types";
import { knowledge } from "@/knowledge/client";
import { words } from "@/knowledge/logic";

export const ROLES: LinkRole[] = ["supports", "qualifies", "contradicts"];
export const ROLE_LABEL: Record<LinkRole, string> = { supports: "Supports", qualifies: "Qualifies", contradicts: "Contradicts" };

/** Short, stable-for-this-page references for facts: F1, F2… in source order. */
export function factRefs(facts: Fact[]): Map<string, string> {
  return new Map(facts.map((f, i) => [f.id, `F${i + 1}`]));
}

export function FactLine({ f, refId, source }: { f: Fact; refId?: string; source?: Source }) {
  const where = f.page ? (source?.page_labels?.[String(f.page)] ?? `p. ${f.page}`) : "";
  return (
    <span className="stack" style={{ gap: 2 }}>
      <span>
        {refId && <span className="id-chip">{refId}</span>} {f.text}
        {f.status === "discarded" && <span className="pill warn" style={{ marginLeft: 6 }}>Discarded</span>}
      </span>
      <span className="small muted">
        {source ? source.short || source.title : ""}
        {where ? `, ${where}` : ""}
        {f.checked ? " · checked" : " · unchecked"}
      </span>
    </span>
  );
}

/**
 * Choose facts: from this topic's sources first, or from anywhere in your Body
 * of Knowledge (choosing one links its source to the topic when it is cited).
 */
export function FactPicker({ topicFacts, topicSources, chosen, onChange, refs }: { topicFacts: Fact[]; topicSources: Source[]; chosen: Map<string, LinkRole>; onChange: (m: Map<string, LinkRole>) => void; refs: Map<string, string> }) {
  const [wide, setWide] = useState(false);
  const [all, setAll] = useState<{ facts: Fact[]; sources: Source[] } | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!wide || all) return;
    (async () => {
      const k = knowledge();
      const sources = await k.listSources("active");
      setAll({ sources, facts: (await k.factsOf(sources.map((s) => s.id))).filter((f) => f.status === "active") });
    })().catch(() => setAll({ facts: [], sources: [] }));
  }, [wide, all]);

  const pool = wide && all ? all : { facts: topicFacts.filter((f) => f.status === "active"), sources: topicSources };
  const srcOf = useMemo(() => new Map(pool.sources.map((s) => [s.id, s])), [pool.sources]);
  const want = words(q);
  const shown = pool.facts.filter((f) => !want.length || want.every((w) => words(`${f.text} ${srcOf.get(f.source_id)?.title ?? ""}`).some((x) => x.startsWith(w)))).slice(0, 80);
  const set = (id: string, role: LinkRole | null) => {
    const m = new Map(chosen);
    if (role) m.set(id, role);
    else m.delete(id);
    onChange(m);
  };

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ alignItems: "center" }}>
        <input aria-label="Find facts" placeholder="Find facts by words" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 200px" }} />
        <label className="inline small"><input type="checkbox" checked={wide} onChange={(e) => setWide(e.target.checked)} /> Search my whole Body of Knowledge</label>
      </div>
      {wide && !all && <p className="small muted">Loading your Body of Knowledge…</p>}
      {shown.length === 0 && <p className="small muted">{pool.facts.length ? "No fact matches." : "No facts here yet. Link sources to this topic, or search your whole Body of Knowledge."}</p>}
      <ul className="fact-list">
        {shown.map((f) => {
          const role = chosen.get(f.id);
          return (
            <li key={f.id} className={role ? "chosen" : undefined}>
              <input type="checkbox" aria-label="Use this fact" checked={Boolean(role)} onChange={(e) => set(f.id, e.target.checked ? "supports" : null)} style={{ marginTop: 3 }} />
              <span style={{ flex: 1 }}><FactLine f={f} refId={refs.get(f.id)} source={srcOf.get(f.source_id)} /></span>
              {role && (
                <select aria-label="How it bears on the assertion" value={role} onChange={(e) => set(f.id, e.target.value as LinkRole)} style={{ width: "auto", minHeight: 32, fontSize: 13 }}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Write an assertion. From an observation, the question is "Do you agree? How
 * would you say this?" and the facts it cited start chosen; the text is always
 * the author's own: there is nothing to accept.
 */
export function AssertionComposer({
  heading,
  prompt,
  startFacts,
  topicFacts,
  topicSources,
  refs,
  onSave,
  onCancel,
}: {
  heading: string;
  prompt?: string;
  startFacts?: string[];
  topicFacts: Fact[];
  topicSources: Source[];
  refs: Map<string, string>;
  onSave: (text: string, links: { fact_id: string; role: LinkRole }[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [chosen, setChosen] = useState<Map<string, LinkRole>>(new Map((startFacts ?? []).map((id) => [id, "supports" as LinkRole])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="add-box stack" style={{ gap: 10 }}>
      <strong>{heading}</strong>
      {prompt && <p className="small" style={{ margin: 0 }}>{prompt}</p>}
      <label>
        Your assertion, in your own words
        <textarea className="serif-input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="What do you hold the evidence to show?" />
      </label>
      <details open={chosen.size > 0 || (startFacts?.length ?? 0) === 0}>
        <summary className="small">The facts it rests on ({chosen.size}; none means unsupported, to investigate)</summary>
        <div style={{ marginTop: 8 }}>
          <FactPicker topicFacts={topicFacts} topicSources={topicSources} chosen={chosen} onChange={setChosen} refs={refs} />
        </div>
      </details>
      {error && <p className="small error" role="alert">{error}</p>}
      <div className="row">
        <button
          className="small primary"
          disabled={busy || text.trim().length < 3}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onSave(text.trim(), [...chosen].map(([fact_id, role]) => ({ fact_id, role })));
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setBusy(false);
            }
          }}
        >
          Make this assertion
        </button>
        <button className="small ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
