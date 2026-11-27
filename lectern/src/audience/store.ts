import "server-only";
/**
 * In-memory session store with change notification. It works on any single
 * Node server (`next dev`, `next start`, one container). It does NOT work on
 * serverless hosting with several instances: there, sessions must move to
 * Postgres with Supabase Realtime (spec 9). The API routes only use this
 * interface, so that swap does not touch them.
 */
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { newSession, randomCode, type Session } from "./model";

const TTL_MS = 12 * 60 * 60 * 1000;
const NOTIFY_MS = 150;

class MemoryStore {
  private sessions = new Map<string, Session>();
  private byCode = new Map<string, string>();
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

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  byJoinCode(code: string): Session | undefined {
    const id = this.byCode.get(code);
    return id ? this.sessions.get(id) : undefined;
  }

  checkHost(s: Session, key: string): boolean {
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

const g = globalThis as unknown as { __lecternAudience?: MemoryStore };
export const store: MemoryStore = (g.__lecternAudience ??= new MemoryStore());

/** A Server-Sent Events response that re-renders a view on every change. */
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
      const unsub = store.subscribe(sessionId, push);
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
