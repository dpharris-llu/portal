"use client";
/**
 * The presenter's connection to an audience session. Failures here never affect
 * slides or notes (spec 5A, rule 4); the panel shows a status instead.
 *
 * Two transports:
 * - "sse" (local mode): the server streams the host view.
 * - "realtime" (Supabase): the server pings a private channel when anything
 *   changes; this browser refetches the host view and relays the public room
 *   view to phones, at most a few times a second.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { HostView } from "@/audience/model";
import type { HostAction } from "@/audience/api";
import { browserSupabase } from "./supabase/client";

interface Creds {
  id: string;
  code: string;
  hostKey: string;
  transport: "sse" | "realtime";
}

export type LiveStatus = "off" | "connecting" | "live" | "reconnecting" | "error";

const key = (deckId: string) => `lectern-live-${deckId}`;
const ROOM_MIN_INTERVAL_MS = 400;

export function useLiveSession(deckId: string) {
  const [creds, setCreds] = useState<Creds | null>(null);
  const [view, setView] = useState<HostView | null>(null);
  const [status, setStatus] = useState<LiveStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const credsRef = useRef<Creds | null>(null);
  credsRef.current = creds;
  const refresh = useRef<() => void>(() => {});

  const forget = useCallback(() => {
    setCreds(null);
    try { sessionStorage.removeItem(key(deckId)); } catch {}
  }, [deckId]);

  // Resume a session after a presenter reload.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key(deckId));
      if (raw) setCreds({ transport: "sse", ...JSON.parse(raw) });
    } catch {}
  }, [deckId]);

  // Local mode: Server-Sent Events.
  useEffect(() => {
    if (!creds || creds.transport !== "sse") return;
    setStatus("connecting");
    const es = new EventSource(`/api/live/sessions/${creds.id}/stream?key=${encodeURIComponent(creds.hostKey)}`);
    es.addEventListener("view", (e) => {
      setView(JSON.parse((e as MessageEvent).data));
      setStatus("live");
    });
    es.addEventListener("gone", () => {
      es.close();
      forget();
    });
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setStatus("error");
        setError("Lost the audience session. Start a new one if you need it.");
        forget();
      } else setStatus("reconnecting");
    };
    refresh.current = () => {};
    return () => es.close();
  }, [creds, forget]);

  // Supabase mode: Realtime ping in, refetch, relay room view out.
  useEffect(() => {
    if (!creds || creds.transport !== "realtime") return;
    const sb = browserSupabase();
    if (!sb) {
      setStatus("error");
      setError("Supabase is not configured in this browser.");
      return;
    }
    let stopped = false;
    let inFlight = false;
    let again = false;
    let lastRoom = "";
    let lastRoomAt = 0;
    let roomTimer: ReturnType<typeof setTimeout> | null = null;
    let hostLive = false;
    setStatus("connecting");

    const room = sb.channel(`live-room:${creds.code}`, { config: { private: true, broadcast: { self: false } } });

    const publishRoom = (v: HostView) => {
      const json = JSON.stringify(v.room);
      if (json === lastRoom) return;
      const wait = Math.max(0, lastRoomAt + ROOM_MIN_INTERVAL_MS - Date.now());
      if (roomTimer) clearTimeout(roomTimer);
      roomTimer = setTimeout(async () => {
        roomTimer = null;
        const r = await room.send({ type: "broadcast", event: "room", payload: v.room });
        if (r === "ok") {
          lastRoom = json;
          lastRoomAt = Date.now();
        }
      }, wait);
    };

    const fetchView = async () => {
      if (inFlight) {
        again = true;
        return;
      }
      inFlight = true;
      try {
        const c = credsRef.current;
        if (!c) return;
        const res = await fetch(`/api/live/sessions/${c.id}?key=${encodeURIComponent(c.hostKey)}`, { cache: "no-store" });
        if (res.status === 404 || res.status === 403) {
          forget();
          setError("The audience session is gone. Start a new one if you need it.");
          return;
        }
        if (!res.ok) throw new Error();
        const v: HostView = await res.json();
        if (stopped) return;
        setView(v);
        publishRoom(v);
        if (hostLive) setStatus("live");
      } catch {
        if (!stopped) setStatus("reconnecting");
      } finally {
        inFlight = false;
        if (again && !stopped) {
          again = false;
          void fetchView();
        }
      }
    };
    refresh.current = () => void fetchView();

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onChanged = () => {
      if (debounce) return;
      debounce = setTimeout(() => {
        debounce = null;
        void fetchView();
      }, 120);
    };

    let host: ReturnType<typeof sb.channel> | null = null;
    (async () => {
      await sb.realtime.setAuth();
      if (stopped) return;
      host = sb
        .channel(`live-host:${creds.id}`, { config: { private: true } })
        .on("broadcast", { event: "changed" }, onChanged)
        .subscribe((s) => {
          hostLive = s === "SUBSCRIBED";
          setStatus(hostLive ? "live" : s === "CLOSED" ? "reconnecting" : "reconnecting");
          if (hostLive) void fetchView();
        });
      room.subscribe((s) => {
        // Resend the current room view once connected, for phones that joined meanwhile.
        if (s === "SUBSCRIBED") lastRoom = "";
      });
      void fetchView();
    })();

    // Safety net if a ping is missed: refetch now and then (often while Realtime is down).
    const poll = setInterval(() => void fetchView(), 4000);
    const slow = setInterval(() => {
      if (!hostLive) void fetchView();
    }, 2000);

    return () => {
      stopped = true;
      clearInterval(poll);
      clearInterval(slow);
      if (debounce) clearTimeout(debounce);
      if (roomTimer) clearTimeout(roomTimer);
      if (host) void sb.removeChannel(host);
      void sb.removeChannel(room);
    };
  }, [creds, forget]);

  useEffect(() => {
    if (!creds) {
      setStatus((s) => (s === "error" ? s : "off"));
      setView(null);
    }
  }, [creds]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/live/sessions", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not start a session.");
      const c: Creds = { id: json.id, code: json.code, hostKey: json.hostKey, transport: json.transport === "realtime" ? "realtime" : "sse" };
      try { sessionStorage.setItem(key(deckId), JSON.stringify(c)); } catch {}
      setCreds(c);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Could not reach the server. Slides still work.");
    }
  }, [deckId]);

  const act = useCallback(async (action: HostAction) => {
    const c = credsRef.current;
    if (!c) return;
    try {
      const res = await fetch(`/api/live/sessions/${c.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: c.hostKey, action }),
      });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "That did not work.");
      else {
        setError(null);
        refresh.current(); // don't wait for the ping to show our own change
      }
    } catch {
      setError("Could not reach the server. Slides still work.");
    }
  }, []);

  const end = useCallback(async () => {
    await act({ type: "end" });
    // Give the relay a moment to tell phones the session ended.
    await new Promise((r) => setTimeout(r, 600));
    forget();
  }, [act, forget]);

  return { creds, view, status, error, start, end, act };
}
