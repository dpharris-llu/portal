"use client";
/** The knowledge repository for the browser: Supabase when signed in is set up, otherwise local mode. */
import { browserSupabase } from "@/lib/supabase/client";
import { localBackend, supabaseBackend } from "./backend";
import { repo, type Repo } from "./repo";

let cached: Repo | null = null;
export function knowledge(): Repo {
  if (cached) return cached;
  const sb = browserSupabase();
  cached = repo(sb ? supabaseBackend(sb) : localBackend());
  return cached;
}
