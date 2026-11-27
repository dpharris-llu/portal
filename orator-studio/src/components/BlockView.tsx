"use client";
import type { Block, ChartBlock, ImageBlock, PollBlock } from "@/model/types";
import { useLive } from "./LiveContext";
import type { Theme } from "@/theme/types";
import { chartSeriesColors, primary } from "@/theme/rules";
import { useAssetUrl } from "@/lib/assets";

export function BlockView({ block, theme }: { block: Block; theme: Theme }) {
  switch (block.type) {
    case "text":
      return <p className="b-text">{block.text}</p>;
    case "bullets":
      return (
        <ul className="b-bullets">
          {block.items.map((item, i) => (
            <li key={i} style={block.levels?.[i] ? { marginLeft: `${block.levels[i] * 1.2}em`, fontSize: "0.85em" } : undefined}>
              {item}
            </li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <figure className="b-quote" style={{ borderColor: primary(theme).hex }}>
          <blockquote>{block.text}</blockquote>
          {block.attribution && <figcaption>{block.attribution}</figcaption>}
        </figure>
      );
    case "image":
      return <ImageView block={block} />;
    case "table":
      return (
        <table className="b-table">
          {block.caption && <caption>{block.caption}</caption>}
          <thead>
            <tr style={{ borderColor: primary(theme).hex }}>
              {block.header.map((h, i) => (
                <th key={i} scope="col">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (c === 0 ? <th key={c} scope="row">{cell}</th> : <td key={c}>{cell}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "chart":
      return <Chart block={block} theme={theme} />;
    case "poll":
      return <PollView block={block} theme={theme} />;
  }
}

/**
 * A poll on a slide (A-03). Before results exist it shows the question and
 * options; while live, counts render as a chart block, and approved free text
 * as a list or word cloud.
 */
function PollView({ block, theme }: { block: PollBlock; theme: Theme }) {
  const live = useLive();
  const r = live.results[block.id];
  const open = live.activePoll === block.id;
  const accent = primary(theme).hex;
  const status = (
    <p className="b-poll-status">
      {open ? "Poll open" : r ? "Poll closed" : "Poll"}
      {r ? ` · ${r.total} ${r.total === 1 ? "response" : "responses"}` : ""}
      {r?.kind === "counts" && r.average !== undefined && r.total > 0 ? ` · average ${r.average}` : ""}
      {open && live.join ? ` · join at ${live.join.host}/join, code ${live.join.code}` : ""}
    </p>
  );
  const head = <p className="b-poll-q">{block.question || "Poll question"}</p>;

  if (!r || r.total === 0) {
    return (
      <div className="b-poll">
        {head}
        {(block.poll === "choice" || block.poll === "ranking") && (
          <ol className="b-poll-options">
            {block.options.map((o, i) => <li key={i}>{o}</li>)}
          </ol>
        )}
        {block.poll === "rating" && <p>Rate 1 to {block.scale ?? 5}</p>}
        {status}
      </div>
    );
  }
  if (r.kind === "counts" || r.kind === "ranking") {
    const chart: ChartBlock = {
      id: block.id,
      type: "chart",
      chart: "bar",
      labels: r.labels,
      series: [{ name: r.kind === "ranking" ? "Ranking points" : "Responses", values: r.kind === "ranking" ? r.scores : r.counts }],
      alt: `${block.question}: ${r.labels.map((l, i) => `${l} ${r.kind === "ranking" ? r.scores[i] : r.counts[i]}`).join(", ")}`,
    };
    return (
      <div className="b-poll">
        {head}
        <div className="b-poll-chart"><Chart block={chart} theme={theme} /></div>
        {status}
      </div>
    );
  }
  if (r.kind === "texts") {
    return (
      <div className="b-poll">
        {head}
        <ul className="b-poll-texts">{r.items.slice(-6).map((t, i) => <li key={i} style={{ borderColor: accent }}>{t}</li>)}</ul>
        {status}
      </div>
    );
  }
  const max = Math.max(1, ...r.words.map((w) => w.count));
  const colors = chartSeriesColors(theme, 6).filter((c) => !c.needsOutline);
  return (
    <div className="b-poll">
      {head}
      <p className="b-cloud" aria-label={`Word cloud: ${r.words.map((w) => `${w.word} ${w.count}`).join(", ")}`}>
        {r.words.map((w, i) => (
          <span key={w.word} style={{ fontSize: `${0.7 + (w.count / max) * 1.6}em`, color: colors[i % colors.length].color.hex }}>
            {w.word}
          </span>
        ))}
      </p>
      {status}
    </div>
  );
}

/** Thousands separators; decimals only when the value has them. */
export function fmt(v: number): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(v) ? 0 : 2 });
}

/** Axis label size that keeps the longest word inside its group. */
function labelSize(labels: string[], groupW: number): number {
  const longest = Math.max(1, ...labels.flatMap((l) => l.split(/\s+/).map((w) => w.length)));
  return Math.max(12, Math.min(22, (groupW * 0.92) / (longest * 0.56)));
}

/** Split a label into at most two lines that fit the group width. */
function wrapLabel(label: string, groupW: number): string[] {
  const words = label.split(/\s+/);
  const perLine = Math.max(4, Math.floor((groupW * 0.92) / (labelSize([label], groupW) * 0.56)));
  if (label.length <= perLine || words.length === 1) return [label];
  let first = "";
  let i = 0;
  while (i < words.length && (first + " " + words[i]).trim().length <= perLine) first = (first + " " + words[i++]).trim();
  if (!first) first = words[i++];
  const rest = words.slice(i).join(" ");
  return [first, rest.length > perLine ? rest.slice(0, perLine - 1) + "…" : rest];
}

function ImageView({ block }: { block: ImageBlock }) {
  const { url, missing } = useAssetUrl(block.src);
  if (!block.src) return <div className="b-empty">Image: add a URL</div>;
  if (missing) return <div className="b-empty">Image not on this device</div>;
  return (
    <figure className="b-image">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt={block.alt} />}
      {block.attribution && <figcaption>{block.attribution}</figcaption>}
    </figure>
  );
}

/**
 * Minimal SVG chart. Series colors follow theme rule 3 (strong colors first,
 * outlines on light ones) and every bar carries a direct label, so color is
 * never the only carrier of meaning (rule 6).
 */
function Chart({ block, theme }: { block: ChartBlock; theme: Theme }) {
  const W = 800;
  const H = 440;
  // One series needs no legend: the claim and the axis say what it is.
  const legend = block.series.length > 1;
  const pad = { l: 20, r: 20, t: legend ? 44 : 16, b: 50 };
  const colors = chartSeriesColors(theme, block.series.length);
  // Headroom so the tallest value label stays inside the plot; negative values hang below zero.
  const all = block.series.flatMap((s) => s.values);
  const max = Math.max(1, ...all) * 1.12;
  const min = Math.min(0, ...all) * 1.12;
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const groupW = plotW / Math.max(1, block.labels.length);
  const barW = (groupW * 0.75) / Math.max(1, block.series.length);
  const y = (v: number) => pad.t + plotH - ((v - min) / (max - min)) * plotH;
  const zero = y(0);
  // Value labels shrink so neighbors don't run into each other.
  const valueText = (v: number): string => (block.unit === "currency" ? (v < 0 ? "-$" : "$") + fmt(Math.abs(v)) : block.unit === "percent" ? `${valueText(v)}%` : fmt(v));
  const widest = Math.max(1, ...block.series.flatMap((s) => s.values.map((v) => valueText(v).length)));
  const slot = block.chart === "line" ? groupW : barW;
  const valueSize = Math.max(11, Math.min(20, (slot * 0.95) / (widest * 0.55)));

  return (
    <figure className="b-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={block.alt || "Chart"} preserveAspectRatio="xMidYMid meet">
        <line x1={pad.l} x2={W - pad.r} y1={zero} y2={zero} stroke={theme.text} strokeWidth={2} />
        {block.labels.map((label, li) => {
          const lines = wrapLabel(label, groupW);
          return (
            <text key={li} x={pad.l + groupW * li + groupW / 2} y={H - (lines.length > 1 ? 30 : 18)} textAnchor="middle" fontSize={labelSize(block.labels, groupW)} fill={theme.text}>
              {lines.map((line, i) => (
                <tspan key={i} x={pad.l + groupW * li + groupW / 2} dy={i === 0 ? 0 : "1.1em"}>{line}</tspan>
              ))}
            </text>
          );
        })}
        {block.series.map((s, si) => {
          const { color, needsOutline } = colors[si];
          const stroke = needsOutline ? theme.text : "none";
          if (block.chart === "line") {
            const pts = s.values.map((v, i) => `${pad.l + groupW * i + groupW / 2},${y(v)}`).join(" ");
            return (
              <g key={si}>
                <polyline points={pts} fill="none" stroke={color.hex} strokeWidth={5} />
                {s.values.map((v, i) => (
                  <g key={i}>
                    <circle cx={pad.l + groupW * i + groupW / 2} cy={y(v)} r={8} fill={color.hex} stroke={stroke} />
                    <text x={pad.l + groupW * i + groupW / 2} y={y(v) - 14} textAnchor="middle" fontSize={valueSize} fill={theme.text}>
                      {valueText(v)}
                    </text>
                  </g>
                ))}
              </g>
            );
          }
          return (
            <g key={si}>
              {s.values.map((v, i) => {
                const x = pad.l + groupW * i + groupW * 0.125 + barW * si;
                return (
                  <g key={i}>
                    <rect x={x} y={Math.min(y(v), zero)} width={barW - 4} height={Math.abs(zero - y(v))} fill={color.hex} stroke={stroke} strokeWidth={2} />
                    <text x={x + (barW - 4) / 2} y={v < 0 ? y(v) + valueSize + 4 : y(v) - 8} textAnchor="middle" fontSize={valueSize} fill={theme.text}>
                      {valueText(v)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
        {legend && block.series.map((s, si) => (
          <g key={`k${si}`} transform={`translate(${pad.l + si * 260}, 8)`}>
            <rect width={22} height={22} fill={colors[si].color.hex} stroke={colors[si].needsOutline ? theme.text : "none"} />
            <text x={30} y={18} fontSize={20} fill={theme.text}>
              {s.name}
            </text>
          </g>
        ))}
      </svg>
      {block.source && <figcaption className="b-source">Source: {block.source}</figcaption>}
    </figure>
  );
}
