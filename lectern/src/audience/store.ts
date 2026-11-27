import "server-only";
import { supabaseConfig } from "@/lib/supabase/config";
import { memoryStore } from "./store-memory";
import { supabaseStore } from "./store-supabase";
import type { LiveStore } from "./types";

let cached: LiveStore | null = null;

/**
 * Supabase when the app is configured for it (it needs the service role key on
 * the server); otherwise the in-memory store for local mode.
 */
export function getStore(): LiveStore {
  if (cached) return cached;
  const cfg = supabaseConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (cfg && !serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. Audience sessions need it when Supabase is configured.");
  }
  cached = cfg && serviceKey ? supabaseStore(cfg.url, serviceKey) : memoryStore;
  return cached;
}
