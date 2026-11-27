"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./config";

let client: SupabaseClient | null | undefined;

/** Browser client, or null in local mode (no Supabase configured). */
export function browserSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const cfg = supabaseConfig();
  client = cfg ? createBrowserClient(cfg.url, cfg.anonKey) : null;
  return client;
}
