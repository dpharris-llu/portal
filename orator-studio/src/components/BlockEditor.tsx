"use client";
/** Structured editing for one block: authors edit meaning, never position (principle 1). */
import type { Binding, Block, DataSource } from "@/model/types";
import { provenanceLines } from "@/documents/build";

/** Where a bound chart's or table's numbers came from, figure by figure (F-102). */
function BoundData({ binding, sources, onUnlink }: { binding: Binding; sources?: Record<string, DataSource>; onUnlink: () => void }) {
  const src = sources?.[binding.sourceId];
  if (!src) return <p className="small error">The figures' source is missing from this deck.</p>;
  return (
    <div className="bound-data">
      <strong>Figures from {src.name}</strong>
      {binding.seriesIds.map((id) => {
        const s = src.series.find((x) => x.id === id);
        if (!s) return null;
        return (
          <div key={id}>
            <span>{s.label}, confirmed {s.confirmedAt.slice(0, 10)}</span>
            <ol>{provenanceLines(src, s).map((l, i) => <li key={i}>{l}</li>)}</ol>
          </div>
        );
      })}
      <div className="row">
        <button className="small" onClick={onUnlink}>Unlink and edit the numbers by hand</button>
      </div>
    </div>
  );
}

export function BlockEditor({
  block,
  onChange,
  onRemove,
  onMove,
  index,
  count,
  sources,
}: {
  block: Block;
  onChange: (b: Block) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
  index: number;
  count: number;
  sources?: Record<string, DataSource>;
}) {
  const strip = (b: Block): Block => ({ ...b, provenance: undefined });
  // Any human edit to AI-written content clears the AI flag on that block.
  const set = (patch: Partial<Block>) => onChange(strip({ ...block, ...patch } as Block));

  return (
    <section className="block-editor" aria-label={`${block.type} block ${index + 1}`}>
      <header>
        <strong>{block.type}</strong>
        {block.provenance?.author.kind === "ai" && <span className="ai-flag" title="Written by AI; edit to take ownership">AI</span>}
        <span className="spacer" />
        <button className="ghost" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move block up">↑</button>
        <button className="ghost" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move block down">↓</button>
        <button className="ghost danger" onClick={onRemove} aria-label="Remove block">Remove</button>
      </header>
      {block.type === "text" && (
        <textarea aria-label="Text" value={block.text} onChange={(e) => set({ text: e.target.value })} />
      )}
      {block.type === "bullets" && (
        <textarea
          aria-label="Bullets, one per line; indent with two spaces per level"
          rows={Math.max(3, block.items.length + 1)}
          value={block.items.map((item, i) => "  ".repeat(block.levels?.[i] ?? 0) + item).join("\n")}
          onChange={(e) => {
            const lines = e.target.value.split("\n");
            const levels = lines.map((l) => Math.min(4, Math.floor((l.length - l.trimStart().length) / 2)));
            set({ items: lines.map((l) => l.trimStart()), levels: levels.some((x) => x > 0) ? levels : undefined });
          }}
        />
      )}
      {block.type === "quote" && (
        <>
          <textarea aria-label="Quote" value={block.text} onChange={(e) => set({ text: e.target.value })} />
          <input aria-label="Attribution" placeholder="Attribution" value={block.attribution ?? ""} onChange={(e) => set({ attribution: e.target.value })} />
        </>
      )}
      {block.type === "image" && (
        <>
          {block.src.startsWith("asset:") ? (
            <p className="muted small">Imported image (stored on this device)</p>
          ) : (
            <input aria-label="Image URL" placeholder="https://…" value={block.src} onChange={(e) => set({ src: e.target.value })} />
          )}
          <input aria-label="Alt text" placeholder="Alt text (required)" value={block.alt} onChange={(e) => set({ alt: e.target.value })} />
          <input aria-label="Attribution" placeholder="Attribution / rights" value={block.attribution ?? ""} onChange={(e) => set({ attribution: e.target.value })} />
        </>
      )}
      {block.type === "table" && block.binding && (
        <BoundData binding={block.binding} sources={sources} onUnlink={() => set({ binding: undefined })} />
      )}
      {block.type === "table" && !block.binding && (
        <>
          <textarea
            aria-label="Table, comma separated, first line is the header"
            rows={Math.max(3, block.rows.length + 2)}
            value={[block.header, ...block.rows].map((r) => r.join(", ")).join("\n")}
            onChange={(e) => {
              const lines = e.target.value.split("\n").map((l) => l.split(",").map((c) => c.trim()));
              set({ header: lines[0] ?? [], rows: lines.slice(1) });
            }}
          />
          <input aria-label="Caption" placeholder="Caption" value={block.caption ?? ""} onChange={(e) => set({ caption: e.target.value })} />
        </>
      )}
      {block.type === "poll" && (
        <>
          <select aria-label="Poll type" value={block.poll} onChange={(e) => set({ poll: e.target.value as typeof block.poll })} style={{ width: "auto" }}>
            <option value="choice">Multiple choice</option>
            <option value="rating">Rating scale</option>
            <option value="ranking">Ranking</option>
            <option value="text">Short text</option>
            <option value="wordcloud">Word cloud</option>
          </select>
          <input aria-label="Poll question" placeholder="Question" value={block.question} onChange={(e) => set({ question: e.target.value })} />
          {(block.poll === "choice" || block.poll === "ranking") && (
            <textarea
              aria-label="Options, one per line"
              rows={Math.max(3, block.options.length + 1)}
              value={block.options.join("\n")}
              onChange={(e) => set({ options: e.target.value.split("\n") })}
            />
          )}
          {block.poll === "rating" && (
            <label className="inline">
              Scale 1 to
              <input type="number" min={2} max={10} value={block.scale ?? 5} onChange={(e) => set({ scale: Number(e.target.value) || 5 })} style={{ width: 70 }} />
            </label>
          )}
          <p className="muted small">Open the poll while presenting; results appear on this slide live. Free-text answers need your approval before the room sees them.</p>
        </>
      )}
      {block.type === "chart" && (
        <>
          <div className="row">
            <select aria-label="Chart type" value={block.chart} onChange={(e) => set({ chart: e.target.value as "bar" | "line" })} style={{ width: "auto" }}>
              <option value="bar">Bar</option>
              <option value="line">Line</option>
            </select>
          </div>
          {block.binding ? (
            <BoundData binding={block.binding} sources={sources} onUnlink={() => set({ binding: undefined })} />
          ) : (
          <textarea
            aria-label="Chart data: first line is labels, then one line per series as name: values"
            rows={Math.max(3, block.series.length + 2)}
            value={[block.labels.join(", "), ...block.series.map((s) => `${s.name}: ${s.values.join(", ")}`)].join("\n")}
            onChange={(e) => {
              const [first = "", ...rest] = e.target.value.split("\n");
              set({
                labels: first.split(",").map((x) => x.trim()),
                series: rest.map((line) => {
                  const [name, vals = ""] = line.split(":");
                  return { name: name.trim(), values: vals.split(",").map((v) => Number(v.trim()) || 0) };
                }),
              });
            }}
          />
          )}
          {!block.binding && <p className="muted small">First line: labels. Then one series per line, as <code>Name: 1, 2, 3</code>.</p>}
          <input aria-label="Alt text" placeholder="What the chart shows (required)" value={block.alt} onChange={(e) => set({ alt: e.target.value })} />
          <input aria-label="Source" placeholder="Source of these figures" value={block.source ?? ""} onChange={(e) => set({ source: e.target.value })} />
        </>
      )}
    </section>
  );
}
