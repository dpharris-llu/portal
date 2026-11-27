import "server-only";
/**
 * Sessions in Postgres (supabase/migrations/0002_live.sql), called with the
 * service role from the server only. After each change the presenter is pinged
 * on a private Realtime channel; the presenter's browser then relays the public
 * room view to phones (see src/lib/useLiveSession.ts).
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkAnswer, cleanQuestion, cleanSpec, hostView, LIMITS, normalizeCode, participantView, randomCode, type PollSpec } from "./model";
import { isFlagged } from "./filter";
import { sessionFromSnapshot, type Snapshot } from "./snapshot";
import type { LiveStore, StoreResult } from "./types";

const fail = (error: string, status = 409) => ({ ok: false as const, error, status });
const hash = (key: string) => createHash("sha256").update(key).digest("hex");

export function supabaseStore(url: string, serviceKey: string): LiveStore {
  const sb: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as T;
  }

  /** Tell the presenter something changed. Runs after the response is sent. */
  function ping(sessionId: string) {
    const send = async () => {
      const ch = sb.channel(`live-host:${sessionId}`, { config: { private: true } });
      try {
        const r = await ch.httpSend("changed", {});
        if (!r.success) console.error("Realtime ping failed", r.status, r.error);
      } catch (e) {
        console.error("Realtime ping failed", e);
      } finally {
        await sb.removeChannel(ch);
      }
    };
    try {
      after(send); // inside a request: run once the response is sent
    } catch {
      void send(); // outside a request (tests, scripts)
    }
  }

  async function authorize(id: string, key: string): Promise<StoreResult> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("Session not found.", 404);
    const rows = await rpc<{ host_key_hash: string }[]>("live_meta", { p_session: id });
    if (!rows.length) return fail("Session not found.", 404);
    const a = Buffer.from(rows[0].host_key_hash);
    const b = Buffer.from(hash(key));
    return a.length === b.length && timingSafeEqual(a, b) ? { ok: true, value: undefined } : fail("Not allowed.", 403);
  }

  async function snapshot(id: string) {
    const snap = await rpc<Snapshot | null>("live_snapshot", { p_session: id });
    return snap ? sessionFromSnapshot(snap) : null;
  }

  async function joinCode(code: string, device: string): Promise<StoreResult<string>> {
    const res = await rpc<{ session_id?: string; error?: string; status?: number }>("live_join", {
      p_code: normalizeCode(code),
      p_device: device,
      p_max: LIMITS.maxDevices,
    });
    return res.session_id ? { ok: true, value: res.session_id } : fail(res.error ?? "Could not join.", res.status ?? 409);
  }

  const done = (error: string | null, sessionId: string): StoreResult => {
    if (error) return fail(error);
    ping(sessionId);
    return { ok: true, value: undefined };
  };

  return {
    kind: "supabase",
    async create(hostUser) {
      if (!hostUser) return fail("Sign in to start an audience session.", 401);
      const hostKey = randomBytes(24).toString("base64url");
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode();
        const { data, error } = await sb.rpc("live_create", { p_code: code, p_host_user: hostUser, p_key_hash: hash(hostKey) });
        if (!error) return { ok: true, value: { id: data as string, code, hostKey } };
        if (error.code !== "23505") throw new Error(`live_create: ${error.message}`); // retry only on duplicate code
      }
      return fail("Could not create a session code. Try again.", 503);
    },

    async hostView(id, key) {
      const auth = await authorize(id, key);
      if (!auth.ok) return auth;
      const s = await snapshot(id);
      return s ? { ok: true, value: hostView(s) } : fail("Session not found.", 404);
    },

    async host(id, key, a) {
      const auth = await authorize(id, key);
      if (!auth.ok) return auth;
      switch (a.type) {
        case "openPoll":
          await rpc("live_open_poll", { p_session: id, p_spec: cleanSpec(a.spec) });
          return done(null, id);
        case "closePoll":
          await rpc("live_close_poll", { p_session: id });
          return done(null, id);
        case "moderateQuestion":
          return done(await rpc<string | null>("live_moderate_question", { p_session: id, p_question: a.questionId, p_status: a.status }), id);
        case "moderateText":
          return done(await rpc<string | null>("live_moderate_text", { p_session: id, p_block: a.blockId, p_device: a.device, p_status: a.status }), id);
        case "approveUnflagged":
          await rpc("live_approve_unflagged", { p_session: id, p_block: a.blockId });
          return done(null, id);
        case "setLocked":
          await rpc("live_set", { p_session: id, p_locked: a.locked });
          return done(null, id);
        case "setQa":
          await rpc("live_set", { p_session: id, p_qa_open: a.open });
          return done(null, id);
        case "end":
          await rpc("live_set", { p_session: id, p_ended: true });
          return done(null, id);
      }
    },

    async participantView(code, device) {
      const joined = await joinCode(code, device);
      if (!joined.ok) return joined;
      const s = await snapshot(joined.value);
      return s ? { ok: true, value: participantView(s, device) } : fail("No session with that code.", 404);
    },

    async participant(code, device, a) {
      const joined = await joinCode(code, device);
      if (!joined.ok) return joined;
      const id = joined.value;
      switch (a.type) {
        case "respond": {
          const spec = await rpc<PollSpec | null>("live_active_poll", { p_session: id });
          if (!spec || spec.blockId !== a.blockId) return fail("This poll is closed.");
          const checked = checkAnswer(spec, a.answer);
          if (!checked.ok) return fail(checked.error);
          const isText = checked.value.kind === "text";
          const err = await rpc<string | null>("live_respond", {
            p_session: id,
            p_device: device,
            p_block: a.blockId,
            p_answer: checked.value,
            p_is_text: isText,
            p_flagged: isText && isFlagged((checked.value as { text: string }).text),
            p_interval_ms: LIMITS.submitIntervalMs,
          });
          return done(err, id) as StoreResult<{ id?: string }>;
        }
        case "ask": {
          const text = cleanQuestion(a.text);
          if (!text.ok) return fail(text.error);
          const qid = randomUUID().slice(0, 12);
          const err = await rpc<string | null>("live_ask", {
            p_session: id,
            p_device: device,
            p_id: qid,
            p_text: text.value,
            p_flagged: isFlagged(text.value),
            p_interval_ms: LIMITS.askIntervalMs,
          });
          if (err) return fail(err);
          ping(id);
          return { ok: true, value: { id: qid } };
        }
        case "vote":
          return done(await rpc<string | null>("live_vote", { p_session: id, p_device: device, p_question: a.questionId }), id) as StoreResult<{ id?: string }>;
      }
    },
  };
}
