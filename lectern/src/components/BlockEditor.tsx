"use client";
/** Structured editing for one block: authors edit meaning, never position (principle 1). */
import type { Block } from "@/model/types";

export function BlockEditor({
  block,
  onChange,
  onRemove,
  onMove,
  index,
  count,
}: {
  block: Block;
  onChange: (b: Block) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
  index: number;
  count: number;
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
          aria-label="Bullets, one per line"
          rows={Math.max(3, block.items.length + 1)}
          value={block.items.join("\n")}
          onChange={(e) => set({ items: e.target.value.split("\n") })}
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
          <input aria-label="Image URL" placeholder="https://…" value={block.src} onChange={(e) => set({ src: e.target.value })} />
          <input aria-label="Alt text" placeholder="Alt text (required)" value={block.alt} onChange={(e) => set({ alt: e.target.value })} />
          <input aria-label="Attribution" placeholder="Attribution / rights" value={block.attribution ?? ""} onChange={(e) => set({ attribution: e.target.value })} />
        </>
      )}
      {block.type === "table" && (
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
      {block.type === "chart" && (
        <>
          <div className="row">
            <select aria-label="Chart type" value={block.chart} onChange={(e) => set({ chart: e.target.value as "bar" | "line" })} style={{ width: "auto" }}>
              <option value="bar">Bar</option>
              <option value="line">Line</option>
            </select>
          </div>
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
          <p className="muted small">First line: labels. Then one series per line, as <code>Name: 1, 2, 3</code>.</p>
          <input aria-label="Alt text" placeholder="What the chart shows (required)" value={block.alt} onChange={(e) => set({ alt: e.target.value })} />
          <input aria-label="Source" placeholder="Source of these figures" value={block.source ?? ""} onChange={(e) => set({ source: e.target.value })} />
        </>
      )}
    </section>
  );
}
