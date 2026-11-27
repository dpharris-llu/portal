import "server-only";
/**
 * In-memory sessions with change notification over Server-Sent Events. Works on
 * a single Node server (`next dev`, `next start`, one container), not on
 * serverless hosting with several instances: use the Supabase store there.
 */
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  approveUnflagged, ask, closePoll, hostView, join, moderateQuestion, moderateText, newSession, normalizeCode,
  openPoll, participantView, randomCode, respond, vote, type Session,
} from "./model";
import type { LiveStore, StoreResult } from "./types";

const TTL_MS = 12 * 60 * 60 * 1000;
const NOTIFY_MS = 150;

const fail = (error: string, status = 409) => ({ ok: false as const, error, status });
/** Same statuses as the Supabase store's live_join. */
const joinFail = (error: string) => fail(error, error === "This session has ended." ? 410 : 403);

class MemorySessions {
  sessions = new Map<string, Session>();
  byCode = new Map<string, string>();
  private listeners = new Map<string, Set<() => void>>();
  private pending = new Set<string>();

  create(): Session {
    this.sweep();
    let code = randomCode();
    while (this.byCode.has(code)) code = randomCode();
    const s = newSession(randomUUID(), code, randomBytes(24).toString("base64url"), Date.now());
    this.sessions.set(s.id, s);
    this.byCode.set(code, s.id);
    return s;
  }

  byJoinCode(code: string): Session | undefined {
    const id = this.byCode.get(normalizeCode(code));
    return id ? this.sessions.get(id) : undefined;
  }

  isHost(s: Session, key: string): boolean {
    const a = Buffer.from(s.hostKey);
    const b = Buffer.from(key);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Apply a change and tell subscribers (batched, so a burst of votes is one update). */
  mutate<T>(s: Session, fn: (s: Session) => T): T {
    const out = fn(s);
    if (!this.pending.has(s.id)) {
      this.pending.add(s.id);
      setTimeout(() => {
        this.pending.delete(s.id);
        for (const l of this.listeners.get(s.id) ?? []) l();
      }, NOTIFY_MS);
    }
    return out;
  }

  subscribe(id: string, fn: () => void): () => void {
    if (!this.listeners.has(id)) this.listeners.set(id, new Set());
    this.listeners.get(id)!.add(fn);
    return () => this.listeners.get(id)?.delete(fn);
  }

  private sweep() {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - s.createdAt > TTL_MS) {
        this.sessions.delete(id);
        this.byCode.delete(s.code);
        this.listeners.delete(id);
      }
    }
  }
}

const g = globalThis as unknown as { __lecternAudience?: MemorySessions };
export const memory: MemorySessions = (g.__lecternAudience ??= new MemorySessions());

function lift<T>(r: { ok: true; value: T } | { ok: false; error: string }): StoreResult<T> {
  return r.ok ? r : fail(r.error);
}

export const memoryStore: LiveStore = {
  kind: "memory",
  async create() {
    const s = memory.create();
    return { ok: true, value: { id: s.id, code: s.code, hostKey: s.hostKey } };
  },
  async hostView(id, key) {
    const s = memory.sessions.get(id);
    if (!s) return fail("Session not found.", 404);
    if (!memory.isHost(s, key)) return fail("Not allowed.", 403);
    return { ok: true, value: hostView(s) };
  },
  async host(id, key, a) {
    const s = memory.sessions.get(id);
    if (!s) return fail("Session not found.", 404);
    if (!memory.isHost(s, key)) return fail("Not allowed.", 403);
    return memory.mutate(s, (sess): StoreResult => {
      switch (a.type) {
        case "openPoll":
          openPoll(sess, a.spec);
          return { ok: true, value: undefined };
        case "closePoll":
          closePoll(sess);
          return { ok: true, value: undefined };
        case "moderateQuestion":
          return lift(moderateQuestion(sess, a.questionId, a.status));
        case "moderateText":
          return lift(moderateText(sess, a.blockId, a.device, a.status));
        case "approveUnflagged":
          approveUnflagged(sess, a.blockId);
          return { ok: true, value: undefined };
        case "setLocked":
          sess.locked = a.locked;
          return { ok: true, value: undefined };
        case "setQa":
          sess.qaOpen = a.open;
          return { ok: true, value: undefined };
        case "end":
          closePoll(sess);
          sess.ended = true;
          return { ok: true, value: undefined };
      }
    });
  },
  async participantView(code, device) {
    const s = memory.byJoinCode(code);
    if (!s) return fail("No session with that code.", 404);
    const joined = memory.mutate(s, (sess) => join(sess, device, Date.now()));
    if (!joined.ok) return joinFail(joined.error);
    return { ok: true, value: participantView(s, device) };
  },
  async participant(code, device, a) {
    const s = memory.byJoinCode(code);
    if (!s) return fail("No session with that code.", 404);
    const now = Date.now();
    return memory.mutate(s, (sess): StoreResult<{ id?: string }> => {
      const joined = join(sess, device, now);
      if (!joined.ok) return joinFail(joined.error);
      switch (a.type) {
        case "respond":
          return lift(respond(sess, device, a.blockId, a.answer, now)) as StoreResult<{ id?: string }>;
        case "ask": {
          const r = ask(sess, device, a.text, randomUUID().slice(0, 12), now);
          return r.ok ? { ok: true, value: { id: r.value } } : fail(r.error);
        }
        case "vote":
          return lift(vote(sess, device, a.questionId)) as StoreResult<{ id?: string }>;
      }
    });
  },
};

/** A Server-Sent Events response that re-renders a view on every change (memory store only). */
export function sseResponse(request: Request, sessionId: string, render: () => unknown | null): Response {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const push = () => {
        const view = render();
        if (view === null) {
          send("gone", {});
          cleanup();
          try { controller.close(); } catch {}
        } else send("view", view);
      };
      push();
      const unsub = memory.subscribe(sessionId, push);
      const heartbeat = setInterval(() => send("ping", Date.now()), 20000);
      cleanup = () => {
        unsub();
        clearInterval(heartbeat);
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        try { controller.close(); } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
