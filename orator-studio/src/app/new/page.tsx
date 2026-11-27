"use client";
/**
 * F-001 and F-002: start from goal, audience, time and takeaway; the AI proposes
 * an outline; the author edits, reorders and approves it before slides exist.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import type { OutlineNode } from "@/ai/outline";
import type { Author, Intent } from "@/model/types";
import { applyOp, makeOp, type OpBody, type Operation } from "@/model/ops";
import { bulletsBlock, emptyDeck, newSlide } from "@/model/factory";
import { currentAuthorId, getRepo } from "@/lib/repo";

export default function NewDeck() {
  const router = useRouter();
  const [form, setForm] = useState({ title: "", goal: "", audience: "", timeLimitMin: 20, takeaway: "" });
  const [outline, setOutline] = useState<OutlineNode[] | null>(null);
  const [source, setSource] = useState<"claude" | "template">("template");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function propose(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/outline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not draft an outline.");
      setOutline(json.outline.nodes);
      setSource(json.source);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function update(i: number, patch: Partial<OutlineNode>) {
    setOutline((o) => o!.map((n, j) => (j === i ? { ...n, ...patch } : n)));
  }
  function move(i: number, d: number) {
    setOutline((o) => {
      const list = [...o!];
      const j = i + d;
      if (j < 0 || j >= list.length) return list;
      [list[i], list[j]] = [list[j], list[i]];
      return list;
    });
  }

  async function approve() {
    if (!outline) return;
    setBusy(true);
    const repo = getRepo();
    const tenantId = await repo.tenantId();
    const me: Author = { kind: "human", id: await currentAuthorId() };
    const ai: Author = source === "claude" ? { kind: "ai", id: "outline", via: "claude" } : { kind: "human", id: me.id };
    const at = new Date().toISOString();

    let deck = emptyDeck({}, tenantId);
    const meta: OpBody = { kind: "deck.setMeta", patch: { ...form, title: form.title || form.goal.slice(0, 60) || "Untitled deck" } };
    const inserts: OpBody[] = outline.map((n, index) => {
      const points = n.points.map((p) => p.trim()).filter(Boolean);
      const slide = newSlide(n.claim.trim(), n.intent, points.length ? [bulletsBlock(points)] : []);
      if (source === "claude") slide.blocks.forEach((b) => (b.provenance = { author: ai, at }));
      return { kind: "slide.insert", slide, section: "narrative", index };
    });
    const log: Operation[] = [
      makeOp(meta, me, "Created deck"),
      ...inserts.map((op) => makeOp(op, ai, source === "claude" ? "AI drafted slides from approved outline" : "Slides from outline")),
    ];
    for (const op of log) deck = applyOp(deck, op);
    await repo.save(deck, log, true);
    router.push(`/decks/${deck.id}`);
  }

  return (
    <>
      <TopBar />
      <main className="narrow stack">
        <h1>New deck</h1>
        <form onSubmit={propose} className="stack">
          <label>
            Goal: what should happen because of this talk?
            <textarea required value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="Get approval to pilot the new advising model in two schools" />
          </label>
          <label>
            Audience
            <input value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} placeholder="Deans' council" />
          </label>
          <div className="row">
            <label style={{ flex: 1 }}>
              Time limit (minutes)
              <input type="number" min={1} max={240} value={form.timeLimitMin} onChange={(e) => setForm({ ...form, timeLimitMin: Number(e.target.value) || 1 })} />
            </label>
            <label style={{ flex: 3 }}>
              Title (optional)
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
          </div>
          <label>
            The one key takeaway
            <input value={form.takeaway} onChange={(e) => setForm({ ...form, takeaway: e.target.value })} />
          </label>
          <div className="row">
            <button className="primary" disabled={busy}>{busy && !outline ? "Drafting…" : outline ? "Draft again" : "Propose an outline"}</button>
            {error && <span role="alert" className="error">{error}</span>}
          </div>
        </form>

        {outline && (
          <section className="stack" aria-labelledby="outline-h">
            <div className="row">
              <h2 id="outline-h" style={{ margin: 0 }}>Proposed outline</h2>
              <span className={source === "claude" ? "ai-flag" : "muted small"}>
                {source === "claude" ? "AI proposal" : "Template (no AI key configured)"}
              </span>
            </div>
            <p className="muted small">Edit, reorder or remove anything. No slides exist until you approve.</p>
            <ol className="outline">
              {outline.map((n, i) => (
                <li key={i}>
                  <div className="row">
                    <strong>{i + 1}.</strong>
                    <input aria-label={`Claim ${i + 1}`} value={n.claim} onChange={(e) => update(i, { claim: e.target.value })} style={{ flex: 1, width: "auto" }} />
                    <select aria-label={`Intent ${i + 1}`} value={n.intent} onChange={(e) => update(i, { intent: e.target.value as Intent })} style={{ width: "auto" }}>
                      <option value="inform">inform</option>
                      <option value="persuade">persuade</option>
                      <option value="decide">decide</option>
                    </select>
                  </div>
                  <textarea
                    aria-label={`Evidence points for slide ${i + 1}, one per line`}
                    value={n.points.join("\n")}
                    onChange={(e) => update(i, { points: e.target.value.split("\n") })}
                  />
                  <div className="row">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0}>Move up</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === outline.length - 1}>Move down</button>
                    <button type="button" className="danger" onClick={() => setOutline(outline.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                </li>
              ))}
            </ol>
            <div className="row">
              <button type="button" onClick={() => setOutline([...outline, { claim: "", intent: "inform", points: [] }])}>Add a slide</button>
              <span className="spacer" />
              <button type="button" className="primary" onClick={approve} disabled={busy || outline.length === 0}>
                Approve and generate slides
              </button>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
