"use client";
import type { Block, ChartBlock, ImageBlock } from "@/model/types";
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
  }
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
  const pad = { l: 20, r: 20, t: 40, b: 50 };
  const colors = chartSeriesColors(theme, block.series.length);
  const max = Math.max(1, ...block.series.flatMap((s) => s.values));
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const groupW = plotW / Math.max(1, block.labels.length);
  const barW = (groupW * 0.75) / Math.max(1, block.series.length);
  const y = (v: number) => pad.t + plotH - (v / max) * plotH;

  return (
    <figure className="b-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={block.alt || "Chart"} preserveAspectRatio="xMidYMid meet">
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + plotH} y2={pad.t + plotH} stroke={theme.text} strokeWidth={2} />
        {block.labels.map((label, li) => (
          <text key={li} x={pad.l + groupW * li + groupW / 2} y={H - 18} textAnchor="middle" fontSize={22} fill={theme.text}>
            {label}
          </text>
        ))}
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
                    <text x={pad.l + groupW * i + groupW / 2} y={y(v) - 14} textAnchor="middle" fontSize={20} fill={theme.text}>
                      {v}
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
                    <rect x={x} y={y(v)} width={barW - 4} height={pad.t + plotH - y(v)} fill={color.hex} stroke={stroke} strokeWidth={2} />
                    <text x={x + (barW - 4) / 2} y={y(v) - 8} textAnchor="middle" fontSize={20} fill={theme.text}>
                      {v}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
        {block.series.map((s, si) => (
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
