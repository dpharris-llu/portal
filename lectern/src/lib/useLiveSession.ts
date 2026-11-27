"use client";
/**
 * The presenter's connection to an audience session. Failures here never affect
 * slides or notes (spec 5A, rule 4); the panel shows a status instead.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { HostView } from "@/audience/model";
import type { HostAction } from "@/audience/api";

interface Creds {
  id: string;
  code: string;
  hostKey: string;
}

export type LiveStatus = "off" | "connecting" | "live" | "reconnecting" | "error";

const key = (deckId: string) => `lectern-live-${deckId}`;

export function useLiveSession(deckId: string) {
  const [creds, setCreds] = useState<Creds | null>(null);
  const [view, setView] = useState<HostView | null>(null);
  const [status, setStatus] = useState<LiveStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const credsRef = useRef<Creds | null>(null);
  credsRef.current = creds;

  // Resume a session after a presenter reload.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key(deckId));
      if (raw) setCreds(JSON.parse(raw));
    } catch {}
  }, [deckId]);

  useEffect(() => {
    if (!creds) {
      setStatus("off");
      setView(null);
      return;
    }
    setStatus("connecting");
    const es = new EventSource(`/api/live/sessions/${creds.id}/stream?key=${encodeURIComponent(creds.hostKey)}`);
    es.addEventListener("view", (e) => {
      setView(JSON.parse((e as MessageEvent).data));
      setStatus("live");
    });
    es.addEventListener("gone", () => {
      es.close();
      setCreds(null);
      try { sessionStorage.removeItem(key(deckId)); } catch {}
    });
    es.onerror = () => {
      // EventSource retries by itself; a closed stream means the session is gone (e.g. server restart).
      if (es.readyState === EventSource.CLOSED) {
        setStatus("error");
        setError("Lost the audience session. Start a new one if you need it.");
        setCreds(null);
        try { sessionStorage.removeItem(key(deckId)); } catch {}
      } else setStatus("reconnecting");
    };
    return () => es.close();
  }, [creds, deckId]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/live/sessions", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not start a session.");
      const c: Creds = { id: json.id, code: json.code, hostKey: json.hostKey };
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
      else setError(null);
    } catch {
      setError("Could not reach the server. Slides still work.");
    }
  }, []);

  const end = useCallback(async () => {
    await act({ type: "end" });
    setCreds(null);
    try { sessionStorage.removeItem(key(deckId)); } catch {}
  }, [act, deckId]);

  return { creds, view, status, error, start, end, act };
}
