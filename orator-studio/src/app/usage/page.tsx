/**
 * Claude usage and cost (spec F-114): this month and every month before, by
 * presentation, task and model, and the latest requests. Estimates at list
 * prices; the Claude Console is the bill.
 */
import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { serverSupabase } from "@/lib/supabase/server";
import { dollars, PRICES_CHECKED } from "@/ai/pricing";
import { report, TASK_LABEL, type Totals, type UsageRow } from "@/ai/usage-report";

export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString("en-US");
const secs = (t: Totals) => (t.requests ? `${(t.latencyMs / t.requests / 1000).toFixed(1)} s` : "-");

function Table({ head, rows }: { head: string; rows: Array<[React.ReactNode, Totals]> }) {
  if (!rows.length) return null;
  return (
    <div className="list-card" style={{ overflowX: "auto" }}>
      <table className="usage-table">
        <thead>
          <tr>
            <th>{head}</th>
            <th>Requests</th>
            <th>Tokens in</th>
            <th>Tokens out</th>
            <th>Avg time</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, t], i) => (
            <tr key={i}>
              <td>{label}</td>
              <td>
                {n(t.requests)}
                {t.failed ? <span className="muted"> ({t.failed} not used)</span> : null}
              </td>
              <td>{n(t.input)}</td>
              <td>
                {n(t.output)}
                {t.thinking ? <span className="muted"> ({n(t.thinking)} thinking)</span> : null}
              </td>
              <td>{secs(t)}</td>
              <td>
                <strong>{dollars(t.cost)}</strong>
                {t.unpriced ? <span className="muted"> + {t.unpriced} unpriced</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function UsagePage() {
  const sb = await serverSupabase();
  let rows: UsageRow[] = [];
  let titles = new Map<string, string>();
  let problem = "";
  if (!sb) problem = "Usage is recorded in the database, and sign-in isn't set up on this server. The server log (Vercel → Logs, search for [ai-usage]) still has a line per request.";
  else {
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) problem = "Sign in to see Claude usage.";
    else {
      const [u, p] = await Promise.all([
        sb.from("ai_usage").select("created_at,presentation_id,task,status,served_model,fell_back,input_tokens,output_tokens,thinking_tokens,cache_read_tokens,cache_write_tokens,cost_usd,latency_ms").order("created_at", { ascending: false }).limit(5000),
        sb.from("presentations").select("id,title"),
      ]);
      if (u.error) problem = /ai_usage/.test(u.error.message) ? "The usage table isn't in the database yet. Run supabase/migrations/0004_ai_usage.sql in the Supabase SQL Editor." : `Usage couldn't be read (${u.error.message}).`;
      rows = (u.data ?? []) as UsageRow[];
      titles = new Map((p.data ?? []).map((r) => [r.id as string, r.title as string]));
    }
  }
  const r = report(rows);
  const budget = Number(process.env.AI_MONTHLY_BUDGET_USD) || null;
  const recent = rows.slice(0, 25);

  return (
    <>
      <TopBar />
      <main className="wide stack" style={{ gap: 24 }}>
        <header className="page-head">
          <div>
            <p className="eyebrow">Claude usage</p>
            <h1>What Claude has cost</h1>
            <p className="lede">
              Every request the server makes to Claude, with its tokens and an estimated cost at Anthropic&apos;s list prices (checked {PRICES_CHECKED}). The bill itself is in the Claude Console under Usage and Cost. Database searches (PubMed, ClinicalTrials.gov, Europe PMC) are free and aren&apos;t listed.
            </p>
          </div>
        </header>

        {problem && <p className="notice">{problem}</p>}

        {!problem && (
          <>
            <div className="usage-stats">
              <div>
                <span>This month</span>
                <strong>{dollars(r.thisMonth.cost)}</strong>
                <em>{n(r.thisMonth.requests)} requests</em>
              </div>
              <div>
                <span>Monthly limit</span>
                <strong>{budget ? `$${budget.toFixed(2)}` : "None set"}</strong>
                <em>{budget ? `${Math.min(100, Math.round((r.thisMonth.cost / budget) * 100))}% used` : "Set AI_MONTHLY_BUDGET_USD to add one"}</em>
              </div>
              <div>
                <span>Average request</span>
                <strong>{dollars(r.thisMonth.requests ? r.thisMonth.cost / r.thisMonth.requests : 0)}</strong>
                <em>{secs(r.thisMonth)} to answer</em>
              </div>
              <div>
                <span>All time</span>
                <strong>{dollars(r.all.cost)}</strong>
                <em>{n(r.all.requests)} requests</em>
              </div>
            </div>
            {budget && r.thisMonth.cost >= budget * 0.8 && (
              <p className="notice">
                {r.thisMonth.cost >= budget ? "The monthly limit has been reached: Claude requests are paused until the 1st." : "Over 80% of this month's limit is used."}
              </p>
            )}
            {r.fallbacks > 0 && <p className="muted">{r.fallbacks} request(s) this month were answered by a fallback model after the first model declined; they are priced at that model&apos;s rates.</p>}

            {!rows.length && <p className="muted">No Claude requests recorded yet. Ask Claude something in Curate, then come back.</p>}

            {r.byPresentation.length > 0 && <h2 className="section-h">By presentation, this month</h2>}
            <Table
              head="Presentation"
              rows={r.byPresentation.map(([id, t]) => [id ? <Link href={`/curate/${id}`}>{titles.get(id) ?? "Deleted presentation"}</Link> : <span className="muted">Not tied to a presentation</span>, t])}
            />
            {r.byTask.length > 0 && <h2 className="section-h">By task, this month</h2>}
            <Table head="Task" rows={r.byTask.map(([k, t]) => [TASK_LABEL[k] ?? k, t])} />
            {r.byModel.length > 0 && <h2 className="section-h">By model, this month</h2>}
            <Table head="Model" rows={r.byModel.map(([k, t]) => [<code key={k}>{k}</code>, t])} />
            {r.byMonth.length > 0 && <h2 className="section-h">By month</h2>}
            <Table head="Month" rows={r.byMonth.map(([k, t]) => [k, t])} />

            {recent.length > 0 && (
              <>
                <h2 className="section-h">Latest requests</h2>
                <div className="list-card" style={{ overflowX: "auto" }}>
                  <table className="usage-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Task</th>
                        <th>Presentation</th>
                        <th>Result</th>
                        <th>Tokens in / out</th>
                        <th>Time</th>
                        <th>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((x, i) => (
                        <tr key={i}>
                          <td>{new Date(x.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                          <td>{TASK_LABEL[x.task] ?? x.task}</td>
                          <td>{x.presentation_id ? titles.get(x.presentation_id) ?? "Deleted" : "-"}</td>
                          <td>
                            {x.status === "ok" ? "Answered" : x.status.replace("_", " ")}
                            {x.fell_back ? " (fallback)" : ""}
                          </td>
                          <td>
                            {n(x.input_tokens + x.cache_read_tokens + x.cache_write_tokens)} / {n(x.output_tokens)}
                          </td>
                          <td>{x.latency_ms ? `${(x.latency_ms / 1000).toFixed(1)} s` : "-"}</td>
                          <td>{dollars(x.cost_usd === null ? null : Number(x.cost_usd))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
