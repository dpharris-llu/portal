"use client";
/**
 * Presentation storage (F-016, F-025): the presentation and its curation (the
 * app's Argument object), in the `presentations` table with its operation log in
 * `presentation_ops`. This browser in local mode; Supabase plus a local copy in cloud mode.
 */
import type { Argument, ArgOp } from "@/model/argument";
import { argumentTitle } from "@/model/argument";
import { browserSupabase } from "./supabase/client";
import { getRepo } from "./repo";

export interface StoredArgument {
  argument: Argument;
  log: ArgOp[];
}

export interface ArgumentSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ArgumentRepo {
  list(): Promise<ArgumentSummary[]>;
  load(id: string): Promise<StoredArgument | null>;
  save(argument: Argument, newOps: ArgOp[], isNew?: boolean): Promise<void>;
  remove(id: string): Promise<void>;
}

const INDEX_KEY = "orator:arguments";
const argKey = (id: string) => `orator:argument:${id}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const localArguments: ArgumentRepo = {
  async list() {
    return readJson<ArgumentSummary[]>(INDEX_KEY, []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async load(id) {
    return readJson<StoredArgument | null>(argKey(id), null);
  },
  async save(argument, newOps) {
    const prev = readJson<StoredArgument | null>(argKey(argument.id), null);
    localStorage.setItem(argKey(argument.id), JSON.stringify({ argument, log: [...(prev?.log ?? []), ...newOps] }));
    const index = readJson<ArgumentSummary[]>(INDEX_KEY, []).filter((a) => a.id !== argument.id);
    index.push({ id: argument.id, title: argumentTitle(argument), updatedAt: new Date().toISOString() });
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  },
  async remove(id) {
    localStorage.removeItem(argKey(id));
    localStorage.setItem(INDEX_KEY, JSON.stringify(readJson<ArgumentSummary[]>(INDEX_KEY, []).filter((a) => a.id !== id)));
  },
};

function cloudArguments(): ArgumentRepo {
  const sb = browserSupabase()!;
  return {
    async list() {
      const { data, error } = await sb.from("presentations").select("id,title,updated_at").order("updated_at", { ascending: false });
      if (error) return localArguments.list();
      return data.map((d) => ({ id: d.id as string, title: d.title as string, updatedAt: d.updated_at as string }));
    },
    async load(id) {
      const { data, error } = await sb.from("presentations").select("curation").eq("id", id).maybeSingle();
      if (error || !data) return localArguments.load(id);
      const ops = await sb.from("presentation_ops").select("op").eq("presentation_id", id).order("seq");
      const stored: StoredArgument = { argument: data.curation as Argument, log: (ops.data ?? []).map((r) => r.op as ArgOp) };
      localStorage.setItem(argKey(id), JSON.stringify(stored));
      return stored;
    },
    async save(argument, newOps, isNew = false) {
      await localArguments.save(argument, newOps);
      const { data: auth } = await sb.auth.getUser();
      const row = { id: argument.id, tenant_id: argument.tenantId, title: argumentTitle(argument), topic: argument.topic ?? "", curation: argument, version: argument.version, updated_at: new Date().toISOString() };
      const res = isNew ? await sb.from("presentations").insert({ ...row, created_by: auth.user?.id }) : await sb.from("presentations").update(row).eq("id", argument.id);
      if (res.error) throw res.error;
      if (newOps.length) {
        const ins = await sb.from("presentation_ops").insert(
          newOps.map((op) => ({ id: op.id, presentation_id: argument.id, tenant_id: argument.tenantId, author_kind: op.author.kind, author_id: op.author.id, reason: op.reason ?? null, op })),
        );
        if (ins.error) throw ins.error;
      }
    },
    async remove(id) {
      await localArguments.remove(id);
      const { error } = await sb.from("presentations").delete().eq("id", id);
      if (error) throw error;
    },
  };
}

let repo: ArgumentRepo | null = null;
export function getArguments(): ArgumentRepo {
  if (!repo) repo = getRepo().mode === "cloud" ? cloudArguments() : localArguments;
  return repo;
}
