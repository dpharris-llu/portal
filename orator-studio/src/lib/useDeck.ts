"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Author, Deck } from "@/model/types";
import type { OpBody } from "@/model/ops";
import { commit as commitOps, initState, redo as redoOps, undo as undoOps, type EditorState } from "@/model/history";
import { currentAuthorId, getRepo } from "./repo";

export type SaveStatus = "saved" | "saving" | "error";

/** Load a deck, apply edits as operations, and autosave (spec 11: no work lost). */
export function useDeck(id: string) {
  const [state, setState] = useState<EditorState | null>(null);
  const [missing, setMissing] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [me, setMe] = useState<Author>({ kind: "human", id: "local-user" });
  const savedCount = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    currentAuthorId().then((uid) => live && setMe({ kind: "human", id: uid }));
    getRepo()
      .load(id)
      .then((stored) => {
        if (!live) return;
        if (!stored) return setMissing(true);
        savedCount.current = stored.log.length;
        setState(initState(stored.deck, stored.log));
      });
    return () => {
      live = false;
    };
  }, [id]);

  const latest = useRef<EditorState | null>(null);
  latest.current = state;

  // Write whatever has not been saved yet. The local copy is written synchronously,
  // so this is safe to call while the page is being hidden or closed.
  const saveNow = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const s = latest.current;
    if (!s || s.log.length === savedCount.current) return;
    const newOps = s.log.slice(savedCount.current);
    savedCount.current = s.log.length;
    try {
      await getRepo().save(s.deck, newOps);
      setStatus("saved");
    } catch {
      // The local copy was written before the cloud call failed.
      setStatus("error");
    }
  }, []);

  // Debounced autosave (spec 11: no work lost on crash or disconnect).
  useEffect(() => {
    if (!state || state.log.length === savedCount.current) return;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(saveNow, 600);
  }, [state, saveNow]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void saveNow();
    };
    window.addEventListener("pagehide", saveNow);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", saveNow);
      document.removeEventListener("visibilitychange", onHide);
      void saveNow();
    };
  }, [saveNow]);

  const commit = useCallback(
    (bodies: OpBody | OpBody[], reason?: string, author?: Author) =>
      setState((s) => {
        if (!s) return s;
        try {
          return commitOps(s, bodies, author ?? me, reason);
        } catch (e) {
          console.error("Edit rejected", e);
          return s;
        }
      }),
    [me],
  );
  const undo = useCallback(() => setState((s) => (s ? undoOps(s, me) : s)), [me]);
  const redo = useCallback(() => setState((s) => (s ? redoOps(s, me) : s)), [me]);

  const deck: Deck | null = state?.deck ?? null;
  return {
    deck,
    log: state?.log ?? [],
    canUndo: Boolean(state?.undoStack.length),
    canRedo: Boolean(state?.redoStack.length),
    commit,
    undo,
    redo,
    status,
    missing,
    me,
  };
}
