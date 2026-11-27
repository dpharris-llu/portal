/**
 * Runs one scenario through both stores and requires the same results.
 * The Supabase half needs a local stack (`npx supabase start`) and:
 *   SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_SERVICE_KEY=<service role key> npm test
 * Without those variables it is skipped.
 */
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { memoryStore } from "./store-memory";
import { supabaseStore } from "./store-supabase";
import type { LiveStore } from "./types";
import type { HostView } from "./model";

const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_SERVICE_KEY;

const dev = (n: number) => `parity-device-${String(n).padStart(4, "0")}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function scenario(store: LiveStore, hostUser: string | null) {
  const log: unknown[] = [];
  const c = await store.create(hostUser);
  if (!c.ok) throw new Error(c.error);
  const { id, code, hostKey } = c.value;
  const host = async (a: Parameters<LiveStore["host"]>[2]) => (await store.host(id, hostKey, a)).ok;
  const act = async (d: number, a: Parameters<LiveStore["participant"]>[2]) => {
    const r = await store.participant(code.toLowerCase(), dev(d), a);
    return r.ok ? { ok: true, hasId: Boolean(r.value?.id) } : { ok: false, error: r.error, status: r.status };
  };

  for (let d = 0; d < 4; d++) log.push((await store.participantView(code, dev(d))).ok);
  log.push(await store.hostView(id, "wrong-key").then((r) => (r.ok ? "ok" : r.status)));

  // Multiple choice: one response per device, closed polls refuse.
  log.push(await act(0, { type: "respond", blockId: "p1", answer: { kind: "choice", option: 0 } }));
  await host({ type: "openPoll", spec: { blockId: "p1", kind: "choice", question: "Best time?", options: ["Morning", "Noon", "Evening"] } });
  log.push(await act(0, { type: "respond", blockId: "p1", answer: { kind: "choice", option: 2 } }));
  log.push(await act(1, { type: "respond", blockId: "p1", answer: { kind: "choice", option: 2 } }));
  log.push(await act(2, { type: "respond", blockId: "p1", answer: { kind: "choice", option: 9 } }));
  await sleep(1100);
  log.push(await act(0, { type: "respond", blockId: "p1", answer: { kind: "choice", option: 1 } }));
  log.push(await act(2, { type: "respond", blockId: "p1", answer: { kind: "choice", option: 1 } }));
  log.push(await act(3, { type: "respond", blockId: "other", answer: { kind: "choice", option: 1 } }));

  // Word cloud with moderation.
  await sleep(1100);
  await host({ type: "openPoll", spec: { blockId: "w", kind: "wordcloud", question: "One word?", options: [] } });
  log.push(await act(0, { type: "respond", blockId: "w", answer: { kind: "text", text: "  Clarity " } }));
  log.push(await act(1, { type: "respond", blockId: "w", answer: { kind: "text", text: "clarity" } }));
  log.push(await act(2, { type: "respond", blockId: "w", answer: { kind: "text", text: "sh1t" } }));
  log.push(await act(3, { type: "respond", blockId: "p1", answer: { kind: "choice", option: 0 } }));
  await host({ type: "approveUnflagged", blockId: "w" });
  await host({ type: "moderateText", blockId: "w", device: dev(2), status: "rejected" });

  // Reopen the first poll: responses kept.
  await host({ type: "openPoll", spec: { blockId: "p1", kind: "choice", question: "Best time?", options: ["Morning", "Noon", "Evening"] } });

  // Questions: rate limit, moderation, votes, own-question rule.
  const q1 = await store.participant(code, dev(0), { type: "ask", text: "What does the pilot cost?" });
  log.push(q1.ok);
  log.push(await act(0, { type: "ask", text: "Another one" }));
  log.push(await act(1, { type: "ask", text: "this is f*ck" }));
  log.push(await act(2, { type: "ask", text: "x" }));
  const qid = q1.ok ? q1.value?.id ?? "" : "";
  log.push(await act(1, { type: "vote", questionId: qid }));
  await host({ type: "moderateQuestion", questionId: qid, status: "approved" });
  log.push(await act(1, { type: "vote", questionId: qid }));
  log.push(await act(2, { type: "vote", questionId: qid }));
  log.push(await act(2, { type: "vote", questionId: qid }));
  log.push(await act(0, { type: "vote", questionId: qid }));

  // Lock the room.
  await host({ type: "setLocked", locked: true });
  log.push((await store.participantView(code, dev(9))).ok);
  log.push((await store.participantView(code, dev(0))).ok);
  await host({ type: "setLocked", locked: false });
  await host({ type: "setQa", open: false });
  log.push(await act(3, { type: "ask", text: "Closed?" }));

  const hv = await store.hostView(id, hostKey);
  if (!hv.ok) throw new Error(hv.error);
  const pv = await store.participantView(code, dev(0));
  if (!pv.ok) throw new Error(pv.error);

  await host({ type: "end" });
  log.push(await act(1, { type: "respond", blockId: "p1", answer: { kind: "choice", option: 0 } }));
  log.push((await store.participantView(code, dev(1))).ok);
  return { log, host: normalize(hv.value), phone: { ...pv.value, code: "", questions: pv.value.questions.map((q) => ({ ...q, id: "" })) } };
}

/** Drop values that legitimately differ between runs (ids, codes, times, device order). */
function normalize(v: HostView) {
  return {
    ...v,
    id: "",
    code: "",
    room: { ...v.room, code: "", questions: v.room.questions.map((q) => ({ ...q, id: "" })) },
    questions: v.questions.map((q) => ({ ...q, id: "", at: 0 })),
    pendingTexts: [...v.pendingTexts].sort((a, b) => a.device.localeCompare(b.device)),
  };
}

describe.skipIf(!url || !key)("live stores (memory vs Supabase)", () => {
  it("behave the same", async () => {
    const admin = createClient(url!, key!, { auth: { persistSession: false } });
    const email = `parity-${Date.now()}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    try {
      const [mem, db] = await Promise.all([scenario(memoryStore, null), scenario(supabaseStore(url!, key!), data.user.id)]);
      expect(db.log).toEqual(mem.log);
      expect(db.host).toEqual(mem.host);
      expect(db.phone).toEqual(mem.phone);
      // Spot-check the expected outcome, not just agreement.
      expect(mem.host.results.p1).toEqual({ kind: "counts", labels: ["Morning", "Noon", "Evening"], counts: [0, 1, 2], total: 3 });
      expect(mem.host.results.w).toEqual({ kind: "words", words: [{ word: "clarity", count: 2 }], total: 3 });
      expect(mem.host.questions).toMatchObject([{ status: "approved", votes: 1 }, { status: "pending", flagged: true }]);
    } finally {
      await admin.auth.admin.deleteUser(data.user.id);
    }
  }, 30000);
});
