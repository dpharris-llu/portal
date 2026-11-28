import "server-only";
/**
 * Records every Claude request the server makes: who, which presentation,
 * which task, which model answered, the tokens and the estimated cost
 * (spec F-114). Rows go to the ai_usage table, written with the service key so
 * nobody can edit their own record; each line is also written to the server
 * log, so the numbers survive even without a database.
 *
 * Recording never stops the author's work: a failure here is logged and
 * ignored.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { supabaseConfig } from "@/lib/supabase/config";
import { serverSupabase } from "@/lib/supabase/server";
import type { UsageSummary } from "./pricing";

export type UsageRecord = {
  task: string;
  status: "ok" | "refused" | "too_long" | "unreadable" | "error";
  latencyMs: number;
  requestId?: string | null;
  summary?: UsageSummary | null;
  error?: string;
};

let admin: SupabaseClient | null | undefined;
function adminClient(): SupabaseClient | null {
  if (admin !== undefined) return admin;
  const cfg = supabaseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  admin = cfg && key ? createClient(cfg.url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return admin;
}

/** The signed-in user and their tenant, if sign-in is set up. */
async function who(): Promise<{ userId: string; tenantId: string | null } | null> {
  const supabase = await serverSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const db = adminClient();
  if (!db) return { userId: data.user.id, tenantId: null };
  const { data: m } = await db.from("memberships").select("tenant_id").eq("user_id", data.user.id).order("created_at").limit(1).maybeSingle();
  return { userId: data.user.id, tenantId: (m?.tenant_id as string | undefined) ?? null };
}

/** The presentation the request is for, sent by the page as a header. */
async function presentationId(): Promise<string | null> {
  try {
    const id = (await headers()).get("x-presentation-id");
    return id && /^[\w-]{1,80}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export async function recordUsage(r: UsageRecord): Promise<void> {
  try {
    const [person, presentation] = await Promise.all([who().catch(() => null), presentationId()]);
    const s = r.summary;
    const row = {
      tenant_id: person?.tenantId ?? null,
      user_id: person?.userId ?? null,
      presentation_id: presentation,
      task: r.task,
      status: r.status,
      requested_model: s?.requestedModel ?? null,
      served_model: s?.servedModel ?? null,
      fell_back: s?.fellBack ?? false,
      input_tokens: s?.input ?? 0,
      output_tokens: s?.output ?? 0,
      thinking_tokens: s?.thinking ?? null,
      cache_read_tokens: s?.cacheRead ?? 0,
      cache_write_tokens: s?.cacheWrite ?? 0,
      cost_usd: s?.costUsd ?? null,
      attempts: s?.attempts ?? [],
      latency_ms: Math.round(r.latencyMs),
      request_id: r.requestId ?? null,
      error: r.error?.slice(0, 300) ?? null,
    };
    // One line per request in the server log (Vercel → Logs), whatever else happens.
    console.info("[ai-usage]", JSON.stringify({ ...row, attempts: undefined }));
    const db = adminClient();
    if (!db || !row.tenant_id) return;
    const { error } = await db.from("ai_usage").insert(row);
    if (error) console.error("[ai-usage] not saved:", error.message);
  } catch (e) {
    console.error("[ai-usage] not recorded:", e);
  }
}

/**
 * The monthly spending limit (AI_MONTHLY_BUDGET_USD), per tenant. Returns a
 * reason to refuse when this month's estimated cost has reached it, else null.
 * With no limit set, or no database to count from, nothing is refused.
 */
export async function overBudget(): Promise<string | null> {
  const limit = Number(process.env.AI_MONTHLY_BUDGET_USD);
  if (!limit || limit <= 0) return null;
  try {
    const db = adminClient();
    const person = await who();
    if (!db || !person?.tenantId) return null;
    const spent = await monthCost(db, person.tenantId);
    if (spent >= limit) {
      return `This month's Claude budget ($${limit.toFixed(2)}) has been used ($${spent.toFixed(2)} so far). It resets on the 1st, or an administrator can raise AI_MONTHLY_BUDGET_USD.`;
    }
  } catch (e) {
    console.error("[ai-usage] budget check failed:", e);
  }
  return null;
}

async function monthCost(db: SupabaseClient, tenantId: string): Promise<number> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data, error } = await db.from("ai_usage").select("cost_usd").eq("tenant_id", tenantId).gte("created_at", start);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((n, r) => n + Number(r.cost_usd ?? 0), 0);
}
