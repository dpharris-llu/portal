import "server-only";
/**
 * Who may use the server routes that spend money (Claude) or fetch URLs.
 * With Supabase configured: signed-in users. Without it: only local
 * development. A deployed server without sign-in (on Vercel, or anywhere with
 * REQUIRE_SIGN_IN=1) refuses, so a public URL can't spend the institution's
 * API key or be used as an open URL fetcher.
 */
import { serverSupabase } from "./supabase/server";

export type Access = { ok: true } | { ok: false; status: 401; error: string };

export function deployed(): boolean {
  return Boolean(process.env.VERCEL) || process.env.REQUIRE_SIGN_IN === "1";
}

export async function serverAccess(): Promise<Access> {
  const supabase = await serverSupabase();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    return data.user ? { ok: true } : { ok: false, status: 401, error: "Sign in first." };
  }
  if (deployed()) return { ok: false, status: 401, error: "Sign-in isn't set up on this server, so this feature is off. Set the Supabase variables to turn it on." };
  return { ok: true };
}
