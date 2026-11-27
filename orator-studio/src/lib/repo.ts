"use client";
/**
 * Deck storage. Local mode keeps decks in this browser. Cloud mode writes to
 * Supabase and also keeps a local copy, so a deck that was opened once can
 * still be presented with no network (spec 8, reliability).
 */
import type { Deck } from "@/model/types";
import type { Operation } from "@/model/ops";
import { LOCAL_TENANT } from "@/model/factory";
import { browserSupabase } from "./supabase/client";

export interface StoredDeck {
  deck: Deck;
  log: Operation[];
}

export interface DeckSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface DeckRepo {
  mode: "local" | "cloud";
  tenantId(): Promise<string>;
  list(): Promise<DeckSummary[]>;
  load(id: string): Promise<StoredDeck | null>;
  /** Persist the new snapshot and the operations made since the last save. */
  save(deck: Deck, newOps: Operation[], isNew?: boolean): Promise<void>;
  remove(id: string): Promise<void>;
}

const INDEX_KEY = "lectern:index";
const deckKey = (id: string) => `lectern:deck:${id}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const localRepo: DeckRepo = {
  mode: "local",
  async tenantId() {
    return LOCAL_TENANT;
  },
  async list() {
    return readJson<DeckSummary[]>(INDEX_KEY, []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async load(id) {
    return readJson<StoredDeck | null>(deckKey(id), null);
  },
  async save(deck, newOps) {
    const prev = readJson<StoredDeck | null>(deckKey(deck.id), null);
    const stored: StoredDeck = { deck, log: [...(prev?.log ?? []), ...newOps] };
    localStorage.setItem(deckKey(deck.id), JSON.stringify(stored));
    const index = readJson<DeckSummary[]>(INDEX_KEY, []).filter((d) => d.id !== deck.id);
    index.push({ id: deck.id, title: deck.meta.title, updatedAt: new Date().toISOString() });
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  },
  async remove(id) {
    localStorage.removeItem(deckKey(id));
    localStorage.setItem(INDEX_KEY, JSON.stringify(readJson<DeckSummary[]>(INDEX_KEY, []).filter((d) => d.id !== id)));
  },
};

function cloudRepo(): DeckRepo {
  const sb = browserSupabase()!;
  let tenant: string | null = null;

  return {
    mode: "cloud",
    async tenantId() {
      if (tenant) return tenant;
      const { data, error } = await sb.from("memberships").select("tenant_id").limit(1).single();
      if (error) throw error;
      tenant = data.tenant_id as string;
      return tenant;
    },
    async list() {
      const { data, error } = await sb.from("decks").select("id,title,updated_at").order("updated_at", { ascending: false });
      if (error) return localRepo.list();
      return data.map((d) => ({ id: d.id as string, title: d.title as string, updatedAt: d.updated_at as string }));
    },
    async load(id) {
      const { data, error } = await sb.from("decks").select("snapshot").eq("id", id).maybeSingle();
      if (error || !data) return localRepo.load(id);
      const ops = await sb.from("deck_ops").select("op").eq("deck_id", id).order("seq");
      const stored: StoredDeck = { deck: data.snapshot as Deck, log: (ops.data ?? []).map((r) => r.op as Operation) };
      localStorage.setItem(deckKey(id), JSON.stringify(stored));
      return stored;
    },
    async save(deck, newOps, isNew = false) {
      await localRepo.save(deck, newOps);
      const { data: auth } = await sb.auth.getUser();
      const row = {
        id: deck.id,
        tenant_id: deck.tenantId,
        title: deck.meta.title,
        snapshot: deck,
        version: deck.version,
        updated_at: new Date().toISOString(),
      };
      const res = isNew
        ? await sb.from("decks").insert({ ...row, created_by: auth.user?.id })
        : await sb.from("decks").update(row).eq("id", deck.id);
      if (res.error) throw res.error;
      if (newOps.length) {
        const ins = await sb.from("deck_ops").insert(
          newOps.map((op) => ({
            id: op.id,
            deck_id: deck.id,
            tenant_id: deck.tenantId,
            author_kind: op.author.kind,
            author_id: op.author.id,
            reason: op.reason ?? null,
            op,
          })),
        );
        if (ins.error) throw ins.error;
      }
    },
    async remove(id) {
      await localRepo.remove(id);
      const { error } = await sb.from("decks").delete().eq("id", id);
      if (error) throw error;
    },
  };
}

let repo: DeckRepo | null = null;
export function getRepo(): DeckRepo {
  if (!repo) repo = browserSupabase() ? cloudRepo() : localRepo;
  return repo;
}

/** The person editing, as an operation author. */
export async function currentAuthorId(): Promise<string> {
  const sb = browserSupabase();
  if (!sb) return "local-user";
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? "anonymous";
}
