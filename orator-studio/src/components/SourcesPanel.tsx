"use client";
/** The deck's sources, with refresh for data URL sources (F-014). */
import { useState } from "react";
import type { Author, DataSource, Deck } from "@/model/types";
import type { OpBody } from "@/model/ops";
import { remap, rebindOps, type Refresh } from "@/sources/refresh";
import { putAsset } from "@/lib/assets";
import { newId } from "@/model/ids";

export function SourcesPanel({ deck, me, commit }: { deck: Deck; me: Author; commit: (ops: OpBody[], reason: string) => void }) {
  const sources = Object.values(deck.sources ?? {});
  const [state, setState] = useState<Record<string, { busy?: boolean; error?: string; refresh?: Refresh; text?: string; type?: string }>>({});
  if (!sources.length) return null;

  const set = (id: string, v: (typeof state)[string]) => setState((s) => ({ ...s, [id]: v }));

  async function refresh(src: DataSource) {
    set(src.id, { busy: true });
    try {
      const res = await fetch("/api/sources/fetch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: src.origin!.url }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "The URL couldn't be fetched.");
      const r = remap(src, json, me.id);
      set(src.id, { refresh: r, text: json.text, type: json.contentType });
    } catch (e) {
      set(src.id, { error: e instanceof Error ? e.message : String(e) });
    }
  }

  async function apply(src: DataSource) {
    const st = state[src.id];
    if (!st?.refresh || !st.text) return;
    const snapshotAssetId = newId("snap");
    await putAsset(snapshotAssetId, new Blob([st.text], { type: st.type || "text/plain" })).catch(() => undefined);
    const next = { ...st.refresh.next, origin: { ...st.refresh.next.origin!, snapshotAssetId } };
    commit([{ kind: "source.put", source: next }, ...rebindOps(deck, next)], `Refreshed ${src.name}`);
    set(src.id, {});
  }

  return (
    <section>
      <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Sources</h2>
      <ul className="issues">
        {sources.map((src) => {
          const st = state[src.id] ?? {};
          return (
            <li key={src.id} className="info">
              <strong>{src.name}</strong>
              <div className="small muted">
                {src.kind === "url"
                  ? src.origin?.url
                    ? `Data URL · fetched ${src.origin.fetchedAt.slice(0, 16).replace("T", " ")} UTC`
                    : "Uploaded or pasted data · can't be refreshed"
                  : `${src.documents.length} documents`}{" "}
                · {src.series.length} {src.series.length === 1 ? "row" : "rows"}
              </div>
              {src.kind === "url" && src.origin?.url && !st.refresh && (
                <button className="small" onClick={() => refresh(src)} disabled={st.busy} style={{ marginTop: 4 }}>
                  {st.busy ? "Fetching…" : "Refresh from source"}
                </button>
              )}
              {st.error && <p className="small error" role="alert">{st.error}</p>}
              {st.refresh && (
                <div className="stack" style={{ gap: 4, marginTop: 4 }} role="status">
                  {st.refresh.same ? (
                    <span className="small">Nothing changed since the last fetch.</span>
                  ) : st.refresh.changes.length ? (
                    <ul className="small" style={{ margin: 0, paddingLeft: 16 }}>{st.refresh.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
                  ) : (
                    <span className="small">The response changed, but none of the mapped figures did.</span>
                  )}
                  <div className="row">
                    {!st.refresh.same && <button className="small primary" onClick={() => apply(src)}>Update the charts</button>}
                    <button className="small" onClick={() => set(src.id, {})}>{st.refresh.same ? "Close" : "Cancel"}</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
