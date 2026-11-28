/**
 * Where the knowledge model is stored. One small interface over the tables,
 * with two backends: Supabase (the live site; access rules and triggers run in
 * the database, 0006_knowledge.sql) and local (the browser, for local mode and
 * tests; it applies the same defaults and imitates the same triggers, so both
 * behave alike for one person).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { KEYS, type TableName, type Tables } from "./types";

/** Match rows: a value matches equal; an array matches any of its values. */
export type Filter<T> = { [K in keyof T]?: T[K] | T[K][] };

export interface Backend {
  readonly local: boolean;
  userId(): Promise<string>;
  select<T extends TableName>(table: T, filter?: Filter<Tables[T]>): Promise<Tables[T][]>;
  insert<T extends TableName>(table: T, rows: Partial<Tables[T]>[]): Promise<Tables[T][]>;
  update<T extends TableName>(table: T, filter: Filter<Tables[T]>, patch: Partial<Tables[T]>): Promise<Tables[T][]>;
  remove<T extends TableName>(table: T, filter: Filter<Tables[T]>): Promise<void>;
}

export class StoreError extends Error {}

// ---------------- Supabase ----------------

export function supabaseBackend(sb: SupabaseClient): Backend {
  const apply = <Q extends { eq: (c: string, v: unknown) => Q; in: (c: string, v: unknown[]) => Q; is: (c: string, v: null) => Q }>(q: Q, filter?: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(filter ?? {})) {
      if (Array.isArray(v)) q = q.in(k, v);
      else if (v === null) q = q.is(k, null);
      else if (v !== undefined) q = q.eq(k, v);
    }
    return q;
  };
  const fail = (table: string, e: { message: string } | null) => {
    if (e) throw new StoreError(`${table}: ${e.message}`);
  };
  return {
    local: false,
    async userId() {
      const { data } = await sb.auth.getUser();
      if (!data.user) throw new StoreError("Sign in first.");
      return data.user.id;
    },
    async select(table, filter) {
      // An empty "any of" list matches nothing; skip the round trip.
      if (Object.values(filter ?? {}).some((v) => Array.isArray(v) && v.length === 0)) return [];
      const { data, error } = await apply(sb.from(table).select("*") as never, filter as Record<string, unknown>);
      fail(table, error);
      return (data ?? []) as never;
    },
    async insert(table, rows) {
      if (!rows.length) return [];
      const { data, error } = await sb.from(table).insert(rows as never).select("*");
      fail(table, error);
      return (data ?? []) as never;
    },
    async update(table, filter, patch) {
      const q = apply(sb.from(table).update(patch as never) as never, filter as Record<string, unknown>) as unknown as { select: (c: string) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };
      const { data, error } = await q.select("*");
      fail(table, error);
      return (data ?? []) as never;
    },
    async remove(table, filter) {
      const { error } = await apply(sb.from(table).delete() as never, filter as Record<string, unknown>);
      fail(table, error);
    },
  };
}

// ---------------- Local (browser storage, or memory in tests) ----------------

type Row = Record<string, unknown>;
type KV = { get(k: string): string | null; set(k: string, v: string): void };

const memory = (): KV => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
};
const browser = (): KV => ({
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // Storage full or blocked: the change stays in memory for this page only.
    }
  },
});

const now = () => new Date().toISOString();
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));

/** The database's column defaults (0006), applied to local inserts. */
function defaults(table: TableName, user: string): Row {
  const t = now();
  const base: Record<TableName, Row> = {
    sources: { id: uuid(), owner_id: user, citation: "", short: "", url: null, year: null, design: null, sample: null, origin: "yours", access: null, ids: {}, page_labels: {}, annotation: "", annotation_by: null, is_public: false, copied_from: null, fetched_at: null, status: "active", discard_reason: null, created_at: t, updated_at: t },
    facts: { id: uuid(), owner_id: user, kind: "finding", quote: null, page: null, checked: false, status: "active", discard_reason: null, created_at: t, updated_at: t },
    topics: { id: uuid(), owner_id: user, description: "", keywords: [], created_at: t, updated_at: t },
    topic_relations: {},
    topic_sources: { note: "", linked_by: "author", created_at: t },
    observations: { id: uuid(), author_id: user, general_knowledge: null, fact_ids: [], question: null, problems: [], created_at: t },
    assertions: { id: uuid(), author_id: user, origin: "typed", observation_id: null, own_fact_id: null, builds_on: null, still_held: true, created_at: t, updated_at: t },
    assertion_facts: { role: "supports", note: "", created_at: t },
    presentations: { id: uuid(), owner_id: user, title: "Untitled presentation", purpose: "", audience: "", minutes: null, created_at: t, updated_at: t },
    presentation_topics: {},
    presentation_assertions: {},
    members: { added_by: user, created_at: t },
    comments: { id: uuid(), author_id: user, resolved: false, created_at: t },
    review_flags: { id: uuid(), cause_type: null, cause_id: null, created_at: t, resolved_at: null },
    search_runs: { id: uuid(), owner_id: user, topic_id: null, created_at: t },
  };
  return base[table];
}

const matches = (row: Row, filter?: Row) =>
  Object.entries(filter ?? {}).every(([k, v]) => (v === undefined ? true : Array.isArray(v) ? v.includes(row[k]) : row[k] === v));

export function localBackend(opts: { store?: "browser" | "memory"; user?: string } = {}): Backend {
  const kv = opts.store === "memory" ? memory() : browser();
  const user = opts.user ?? "local-user";
  const key = (t: TableName) => `orator-knowledge:${t}`;
  const read = (t: TableName): Row[] => {
    try {
      return JSON.parse(kv.get(key(t)) ?? "[]");
    } catch {
      return [];
    }
  };
  const write = (t: TableName, rows: Row[]) => kv.set(key(t), JSON.stringify(rows));
  const sameKey = (t: TableName, a: Row, b: Row) => (KEYS[t] as string[]).every((k) => a[k] === b[k]);

  // The database's triggers (0006), imitated for one person.
  const flag = (factIds: string[], reason: string, causeType: "fact" | "source", cause: string) => {
    const links = read("assertion_facts").filter((l) => factIds.includes(l.fact_id as string));
    const assertionIds = [...new Set(links.map((l) => l.assertion_id as string))];
    const presIds = [...new Set(read("presentation_assertions").filter((p) => assertionIds.includes(p.assertion_id as string)).map((p) => p.presentation_id as string))];
    const flags = read("review_flags");
    for (const id of assertionIds) flags.push({ ...defaults("review_flags", user), object_type: "assertion", object_id: id, reason, cause_type: causeType, cause_id: cause });
    for (const id of presIds) flags.push({ ...defaults("review_flags", user), object_type: "presentation", object_id: id, reason, cause_type: causeType, cause_id: cause });
    write("review_flags", flags);
  };
  const afterUpdate = (t: TableName, before: Row, after: Row) => {
    if (t === "facts") {
      if (after.status === "discarded" && before.status !== "discarded") flag([after.id as string], `A fact it relies on was discarded: ${after.discard_reason ?? ""}`, "fact", after.id as string);
      else if (after.text !== before.text || after.quote !== before.quote) flag([after.id as string], "A fact it relies on changed.", "fact", after.id as string);
    }
    if (t === "sources" && after.status === "discarded" && before.status !== "discarded") {
      flag(read("facts").filter((f) => f.source_id === after.id).map((f) => f.id as string), `A source it relies on was discarded: ${after.discard_reason ?? ""}`, "source", after.id as string);
    }
    if (t === "assertions" && (after.text !== before.text || after.still_held !== before.still_held)) {
      const flags = read("review_flags");
      for (const p of read("presentation_assertions").filter((x) => x.assertion_id === after.id)) flags.push({ ...defaults("review_flags", user), object_type: "presentation", object_id: p.presentation_id, reason: "An assertion it uses was revised.", cause_type: "assertion", cause_id: after.id });
      write("review_flags", flags);
    }
  };
  const afterInsert = (t: TableName, row: Row) => {
    if (t === "assertion_facts") {
      const a = read("assertions").find((x) => x.id === row.assertion_id);
      const f = read("facts").find((x) => x.id === row.fact_id);
      if (a && f) {
        const links = read("topic_sources");
        if (!links.some((l) => l.topic_id === a.topic_id && l.source_id === f.source_id)) {
          links.push({ ...defaults("topic_sources", user), topic_id: a.topic_id, source_id: f.source_id, linked_by: "auto" });
          write("topic_sources", links);
        }
      }
    }
  };

  return {
    local: true,
    async userId() {
      return user;
    },
    async select(table, filter) {
      return read(table).filter((r) => matches(r, filter as Row)) as never;
    },
    async insert(table, rows) {
      const all = read(table);
      const out: Row[] = [];
      for (const r of rows) {
        const row = { ...defaults(table, user), ...(r as Row) };
        if (all.some((x) => sameKey(table, x, row))) throw new StoreError(`${table}: already exists`);
        all.push(row);
        out.push(row);
      }
      write(table, all);
      for (const row of out) afterInsert(table, row);
      return out as never;
    },
    async update(table, filter, patch) {
      const all = read(table);
      const changed: [Row, Row][] = [];
      const next = all.map((r) => {
        if (!matches(r, filter as Row)) return r;
        const after = { ...r, ...(patch as Row), ...("updated_at" in r ? { updated_at: now() } : {}) };
        changed.push([r, after]);
        return after;
      });
      write(table, next);
      for (const [b, a] of changed) afterUpdate(table, b, a);
      return changed.map(([, a]) => a) as never;
    },
    async remove(table, filter) {
      write(table, read(table).filter((r) => !matches(r, filter as Row)));
      // Cascades the database would do, for the links that matter here.
      if (table === "assertions") {
        const gone = new Set(read("assertions").map((a) => a.id));
        write("assertion_facts", read("assertion_facts").filter((l) => gone.has(l.assertion_id)));
        write("presentation_assertions", read("presentation_assertions").filter((l) => gone.has(l.assertion_id)));
      }
      if (table === "topics") {
        const live = new Set(read("topics").map((t) => t.id));
        for (const t of ["topic_sources", "observations", "assertions", "presentation_topics", "presentation_assertions"] as TableName[]) write(t, read(t).filter((r) => live.has(r.topic_id)));
      }
    },
  };
}
