import "server-only";
/**
 * Invitations and administrators (F-126). Everything here runs on the server
 * with the service key, after checking that the caller is an administrator.
 * Supabase sign-ups are off, so an invitation is the only way in: it creates
 * the person's account (and, through the database trigger, their own private
 * space); they then sign in with an emailed sign-in link like anyone else.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/supabase/config";
import { serverSupabase } from "@/lib/supabase/server";

export class PeopleError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

let admin: SupabaseClient | null | undefined;
export function serviceClient(): SupabaseClient {
  if (admin === undefined) {
    const cfg = supabaseConfig();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    admin = cfg && key ? createClient(cfg.url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  }
  if (!admin) throw new PeopleError("Sign-in isn't set up on this server (Supabase variables).", 501);
  return admin;
}

/** The signed-in person, and whether they are an administrator. */
export async function whoAmI(): Promise<{ user: User; admin: boolean } | null> {
  const sb = await serverSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const { data: row } = await serviceClient().from("app_admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  return { user: data.user, admin: Boolean(row) };
}

export async function requireAdmin(): Promise<User> {
  const me = await whoAmI();
  if (!me) throw new PeopleError("Sign in first.", 401);
  if (!me.admin) throw new PeopleError("Only administrators can manage people.", 403);
  return me.user;
}

export const normalEmail = (e: string) => e.trim().toLowerCase();
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

async function allUsers(db: SupabaseClient): Promise<User[]> {
  const out: User[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new PeopleError(`Couldn't list people (${error.message}).`, 502);
    out.push(...data.users);
    if (data.users.length < 200) break;
  }
  return out;
}

export type Person = {
  id: string;
  email: string;
  admin: boolean;
  invitedAt: string | null;
  invitedBy: string | null;
  lastSignIn: string | null;
  blocked: boolean;
  claudeThisMonth: number;
};

export async function listPeople(): Promise<Person[]> {
  const db = serviceClient();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [users, admins, invites, usage] = await Promise.all([
    allUsers(db),
    db.from("app_admins").select("user_id"),
    db.from("invitations").select("email,user_id,invited_by,created_at").order("created_at", { ascending: false }),
    db.from("ai_usage").select("user_id,cost_usd").gte("created_at", monthStart),
  ]);
  const adminIds = new Set((admins.data ?? []).map((r) => r.user_id as string));
  const emailOf = new Map(users.map((u) => [u.id, u.email ?? ""]));
  const cost = new Map<string, number>();
  for (const r of usage.data ?? []) if (r.user_id) cost.set(r.user_id as string, (cost.get(r.user_id as string) ?? 0) + Number(r.cost_usd ?? 0));
  return users
    .map((u) => {
      const inv = (invites.data ?? []).find((i) => i.user_id === u.id || normalEmail(String(i.email)) === normalEmail(u.email ?? ""));
      return {
        id: u.id,
        email: u.email ?? "",
        admin: adminIds.has(u.id),
        invitedAt: (inv?.created_at as string) ?? null,
        invitedBy: inv?.invited_by ? (emailOf.get(inv.invited_by as string) ?? null) : null,
        lastSignIn: u.last_sign_in_at ?? null,
        blocked: Boolean(u.banned_until && new Date(u.banned_until).getTime() > Date.now()),
        claudeThisMonth: cost.get(u.id) ?? 0,
      };
    })
    .sort((a, b) => (b.invitedAt ?? b.lastSignIn ?? "").localeCompare(a.invitedAt ?? a.lastSignIn ?? ""));
}

/** Invite someone: create their account (their own space comes with it) and record who invited them. */
export async function invite(emailIn: string, by: User, note?: string): Promise<{ email: string; existing: boolean }> {
  const email = normalEmail(emailIn);
  if (!validEmail(email)) throw new PeopleError("That isn't a valid email address.");
  const db = serviceClient();
  const existing = (await allUsers(db)).find((u) => normalEmail(u.email ?? "") === email);
  let userId = existing?.id;
  if (!existing) {
    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user) throw new PeopleError(`Couldn't create the account (${error?.message ?? "unknown error"}).`, 502);
    userId = data.user.id;
  }
  const { error } = await db.from("invitations").insert({ email, user_id: userId, invited_by: by.id, ...(note ? { note: note.slice(0, 300) } : {}) });
  if (error) throw new PeopleError(`The account exists, but the invitation wasn't recorded (${error.message}). Run supabase/migrations/0005_invites.sql.`, 502);
  return { email, existing: Boolean(existing) };
}

/** Block or restore someone's access. Their presentations stay; blocking is reversible. */
export async function setBlocked(userId: string, blocked: boolean, by: User): Promise<void> {
  if (userId === by.id) throw new PeopleError("You can't block yourself.");
  const { error } = await serviceClient().auth.admin.updateUserById(userId, { ban_duration: blocked ? "876000h" : "none" });
  if (error) throw new PeopleError(`Couldn't change access (${error.message}).`, 502);
}

export async function setAdmin(userId: string, makeAdmin: boolean, by: User): Promise<void> {
  const db = serviceClient();
  if (!makeAdmin && userId === by.id) throw new PeopleError("You can't remove yourself as an administrator. Ask another administrator.");
  const { error } = makeAdmin ? await db.from("app_admins").upsert({ user_id: userId, added_by: by.id }) : await db.from("app_admins").delete().eq("user_id", userId);
  if (error) throw new PeopleError(`Couldn't change the administrator list (${error.message}).`, 502);
}
