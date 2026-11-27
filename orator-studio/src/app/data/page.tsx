"use client";
/**
 * Start from a URL (F-014): fetch JSON, XML or CSV from a data URL (or upload
 * or paste a response), map fields to rows, confirm them, and draft a deck
 * whose every number says which field it came from and when it was fetched.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { parseStructured, type Table } from "@/sources/structured";
import { applyMapping, defaultCombine, defaultGrouping, type Combine, type Grouping, type Mapped } from "@/sources/aggregate";
import { draftFromSource } from "@/documents/build";
import { useAnalysis } from "@/documents/useAnalysis";
import { applyOp, makeOp, type OpBody, type Operation } from "@/model/ops";
import { emptyDeck } from "@/model/factory";
import { newId } from "@/model/ids";
import type { Author, DataSource, SourceSeries } from "@/model/types";
import { currentAuthorId, getRepo } from "@/lib/repo";
import { putAsset } from "@/lib/assets";

interface Loaded {
  text: string;
  contentType: string;
  /** Empty for pasted or uploaded data, which cannot be refreshed. */
  url: string;
  fetchedAt: string;
  sha256: string;
  bytes: number;
  from: string;
}

interface FieldChoice {
  include: boolean;
  label: string;
  combine: Combine;
  confirmed: boolean;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

const pretty = (label: string) => {
  const t = label.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const fmt = (v: number | null) => (v === null ? "-" : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));
const GROUPINGS: Grouping[] = ["none", "week", "month", "quarter", "year"];
const COMBINES: Combine[] = ["mean", "sum", "min", "max", "last"];
const COMBINE_LABEL: Record<Combine, string> = { mean: "average", sum: "total", min: "lowest", max: "highest", last: "last value" };

export default function DataUrlPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [format, setFormat] = useState<"json" | "xml" | "csv">("json");
  const [tableId, setTableId] = useState("");
  const [periodKey, setPeriodKey] = useState("");
  const [grouping, setGrouping] = useState<Grouping>("none");
  const [fields, setFields] = useState<Record<string, FieldChoice>>({});
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  function take(l: Loaded) {
    try {
      const parsed = parseStructured(l.text, l.contentType);
      if (!parsed.tables.length) throw new Error("No table of numbers was found in this data.");
      setLoaded(l);
      setFormat(parsed.format);
      setTables(parsed.tables);
      choose(parsed.tables[0]);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function choose(t: Table) {
    setTableId(t.id);
    const period = t.columns.find((c) => c.type === "date") ?? t.columns.find((c) => c.type === "text") ?? t.columns[0];
    setPeriodKey(period.key);
    setGrouping(period.type === "date" ? defaultGrouping(period.values.filter((v): v is string => typeof v === "string")) : "none");
    setFields(
      Object.fromEntries(
        t.columns.filter((c) => c.type === "number" && c.key !== period.key).map((c) => [c.key, { include: true, label: pretty(c.label), combine: defaultCombine(c.key), confirmed: false }]),
      ),
    );
  }

  async function fetchUrl() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sources/fetch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: url.trim() }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "The URL couldn't be fetched.");
      take({ text: json.text, contentType: json.contentType, url: json.finalUrl, fetchedAt: json.fetchedAt, sha256: json.sha256, bytes: json.bytes, from: new URL(json.finalUrl).host });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadText(text: string, from: string, contentType = "") {
    take({ text, contentType, url: "", fetchedAt: new Date().toISOString(), sha256: await sha256(text), bytes: new TextEncoder().encode(text).length, from });
  }

  const table = tables.find((t) => t.id === tableId) ?? null;
  const periodCol = table?.columns.find((c) => c.key === periodKey);
  const included = Object.entries(fields).filter(([, f]) => f.include);
  const mapping = table
    ? { tableId: table.id, periodKey, grouping: periodCol?.type === "date" ? grouping : ("none" as Grouping), values: included.map(([key, f]) => ({ key, label: f.label, combine: f.combine })) }
    : null;
  const mapped: Mapped | null = useMemo(() => {
    if (!table || !mapping || !mapping.values.length) return null;
    try {
      return applyMapping(table, mapping);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, JSON.stringify(mapping)]);
  const tooMany = mapped && mapped.periods.length > 60;

  function buildSource(now: string, by: string): DataSource | null {
    if (!loaded || !mapped || !mapping) return null;
    const confirmedKeys = mapped.series.filter((s) => fields[s.key]?.confirmed);
    if (!confirmedKeys.length) return null;
    const host = loaded.url ? new URL(loaded.url).host : loaded.from;
    return {
      id: newId("src"),
      name: name.trim() || `${host}, ${mapped.periods[0]} to ${mapped.periods[mapped.periods.length - 1]}`,
      kind: "url",
      createdAt: now,
      origin: {
        url: loaded.url,
        fetchedAt: loaded.fetchedAt,
        sha256: loaded.sha256,
        contentType: loaded.contentType,
        format,
        mapping: { ...mapping, values: mapping.values.filter((v) => fields[v.key]?.confirmed) },
      },
      documents: mapped.periods.map((p) => ({ id: `p-${p}`, name: host, period: p, pages: 0 })),
      series: confirmedKeys.map(
        (s): SourceSeries => ({
          id: "ser-" + s.key.replace(/[^a-zA-Z0-9]+/g, "-"),
          label: s.label,
          unit: "number",
          figures: s.figures.map((f) => ({ value: f.value, raw: fmt(f.value), path: f.path })),
          confirmedAt: now,
          confirmedBy: by,
        }),
      ),
    };
  }

  const preview = buildSource("", "");
  const { goal, panel, finalize } = useAnalysis(preview, "Only the mapped figures are sent; the full response stays here.");

  async function createDeck() {
    setBusy(true);
    try {
      const repo = getRepo();
      const me: Author = { kind: "human", id: await currentAuthorId() };
      const now = new Date().toISOString();
      const base = buildSource(now, me.id)!;
      // Keep the response itself as the snapshot the figures came from.
      const snapshotAssetId = newId("snap");
      await putAsset(snapshotAssetId, new Blob([loaded!.text], { type: loaded!.contentType || "text/plain" }));
      base.origin!.snapshotAssetId = snapshotAssetId;
      const { source, draft } = finalize(base);
      const bodies: OpBody[] = [
        { kind: "deck.setMeta", patch: { title: source.name, goal, timeLimitMin: Math.max(5, draft.narrative.length * 2) } },
        { kind: "source.put", source },
        ...draft.narrative.map((slide, index) => ({ kind: "slide.insert" as const, slide, section: "narrative" as const, index })),
        ...draft.backup.map((slide, index) => ({ kind: "slide.insert" as const, slide, section: "backup" as const, index })),
      ];
      let deck = emptyDeck({}, await repo.tenantId());
      const log: Operation[] = bodies.map((b) => makeOp(b, me, "Created from a data URL"));
      for (const op of log) deck = applyOp(deck, op);
      await repo.save(deck, log, true);
      router.push(`/decks/${deck.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const setField = (key: string, patch: Partial<FieldChoice>) => setFields((f) => ({ ...f, [key]: { ...f[key], ...patch } }));
  const confirmedCount = mapped ? mapped.series.filter((s) => fields[s.key]?.confirmed).length : 0;

  return (
    <>
      <TopBar />
      <main className="wide stack">
        <h1 style={{ margin: 0 }}>Start from a URL</h1>
        <p className="muted" style={{ margin: 0 }}>
          Add a data URL that returns JSON, XML or CSV, such as a weather, finance or reporting API. Map its fields to rows, confirm them, and
          OratorStudio drafts a deck in which every number says which field it came from and when it was fetched.
        </p>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label style={{ flex: 1, minWidth: 260 }}>
            Data URL
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://archive-api.open-meteo.com/v1/archive?latitude=34.05&longitude=-117.26&start_date=2026-01-01&end_date=2026-10-31&daily=temperature_2m_max,precipitation_sum" />
          </label>
          <button className="primary" onClick={fetchUrl} disabled={loading || !url.trim()}>{loading ? "Fetching…" : "Fetch"}</button>
        </div>
        <details>
          <summary>Or upload or paste a response</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <label>
              File (JSON, XML or CSV)
              <input
                type="file"
                accept=".json,.xml,.csv,application/json,application/xml,text/xml,text/csv"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) await loadText(await f.text(), f.name, f.type);
                }}
              />
            </label>
            <label>
              Pasted response
              <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder='{"daily": {"time": [...], "temperature_2m_max": [...]}}' />
            </label>
            <div><button onClick={() => loadText(paste, "pasted data")} disabled={!paste.trim()}>Use pasted data</button></div>
            <p className="small muted" style={{ margin: 0 }}>Uploaded or pasted data works the same, but can't be refreshed later.</p>
          </div>
        </details>
        {error && <p role="alert" className="error">{error}</p>}

        {loaded && table && (
          <section className="stack" aria-labelledby="map-h">
            <p className="small muted" style={{ margin: 0 }} role="status">
              {loaded.url ? `Fetched from ${new URL(loaded.url).host}` : `From ${loaded.from}`} · {format.toUpperCase()} · {Math.max(1, Math.round(loaded.bytes / 1024))} KB · {table.rows} rows ·{" "}
              {new Date(loaded.fetchedAt).toLocaleString()}
            </p>
            <h2 id="map-h" style={{ margin: 0, fontSize: 18 }}>Map the fields</h2>
            <div className="row">
              {tables.length > 1 && (
                <label>
                  Table
                  <select value={tableId} onChange={(e) => choose(tables.find((t) => t.id === e.target.value)!)}>
                    {tables.map((t) => <option key={t.id} value={t.id}>{t.label} ({t.rows} rows)</option>)}
                  </select>
                </label>
              )}
              <label>
                Periods come from
                <select value={periodKey} onChange={(e) => setPeriodKey(e.target.value)}>
                  {table.columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </label>
              {periodCol?.type === "date" && (
                <label>
                  Group dates by
                  <select value={grouping} onChange={(e) => setGrouping(e.target.value as Grouping)}>
                    {GROUPINGS.map((g) => <option key={g} value={g}>{g === "none" ? "no grouping" : g}</option>)}
                  </select>
                </label>
              )}
            </div>
            <ul className="findings">
              {Object.entries(fields).map(([key, f]) => {
                const col = table.columns.find((c) => c.key === key)!;
                return (
                  <li key={key} className="row">
                    <label className="inline">
                      <input type="checkbox" checked={f.include} onChange={(e) => setField(key, { include: e.target.checked, confirmed: false })} aria-label={`Use ${col.label}`} />
                    </label>
                    <code className="small" style={{ minWidth: 0, overflowWrap: "anywhere" }}>{col.path}</code>
                    <input aria-label={`Row label for ${col.path}`} value={f.label} onChange={(e) => setField(key, { label: e.target.value, confirmed: false })} style={{ width: "16em" }} />
                    {periodCol?.type === "date" && grouping !== "none" && (
                      <select aria-label={`How to combine ${col.path} within a ${grouping}`} value={f.combine} onChange={(e) => setField(key, { combine: e.target.value as Combine, confirmed: false })} style={{ width: "auto" }}>
                        {COMBINES.map((c) => <option key={c} value={c}>{COMBINE_LABEL[c]} per {grouping}</option>)}
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
            {tooMany && <p className="small notice">{mapped!.periods.length} periods is a lot for one chart. Group the dates to make the deck readable.</p>}

            {mapped && (
              <>
                <h2 style={{ margin: 0, fontSize: 18 }}>Check and confirm</h2>
                <div className="grid-wrap">
                  <table className="fig-grid">
                    <thead>
                      <tr>
                        <th scope="col">Confirm · label</th>
                        {mapped.periods.map((p) => <th key={p} scope="col">{p}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {mapped.series.map((s) => (
                        <tr key={s.key} className={fields[s.key]?.confirmed ? "confirmed" : undefined}>
                          <th scope="row">
                            <div className="row-head">
                              <input type="checkbox" checked={Boolean(fields[s.key]?.confirmed)} onChange={(e) => setField(s.key, { confirmed: e.target.checked })} aria-label={`Confirm ${s.label}`} />
                              <span style={{ minWidth: "12em" }}>{s.label}</span>
                            </div>
                          </th>
                          {s.figures.map((f, i) => (
                            <td key={i} title={f.path} style={{ textAlign: "right" }}>
                              {fmt(f.value)}
                              <span className="cell-src">{grouping !== "none" && periodCol?.type === "date" ? `${f.count} values` : f.path.split(".").pop()}</span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        {panel}

        {mapped && (
          <section className="row create-bar">
            <label style={{ flex: 1, minWidth: 220 }}>
              Deck name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={preview?.name ?? "Figures from a data URL"} />
            </label>
            <button className="primary" disabled={busy || confirmedCount === 0} onClick={createDeck}>
              {busy ? "Creating…" : `Draft a deck from ${confirmedCount} confirmed ${confirmedCount === 1 ? "row" : "rows"}`}
            </button>
          </section>
        )}
      </main>
    </>
  );
}
