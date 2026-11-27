"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Author } from "@/model/types";
import { applyArgOp, invertArgOp, makeArgOp, type ArgOp, type ArgOpBody, type Argument } from "@/model/argument";
import { getArguments } from "./argumentRepo";
import { currentAuthorId } from "./repo";

/** Load an argument, apply changes as operations, save them, and undo the author's own changes. */
export function useArgument(id: string) {
  const [argument, setArgument] = useState<Argument | null>(null);
  const [log, setLog] = useState<ArgOp[]>([]);
  const [missing, setMissing] = useState(false);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [me, setMe] = useState<Author>({ kind: "human", id: "local-user" });
  const undoStack = useRef<ArgOpBody[][]>([]);
  const current = useRef<Argument | null>(null);

  useEffect(() => {
    let live = true;
    currentAuthorId().then((uid) => live && setMe({ kind: "human", id: uid }));
    getArguments()
      .load(id)
      .then((s) => {
        if (!live) return;
        if (!s) setMissing(true);
        else {
          current.current = s.argument;
          setArgument(s.argument);
          setLog(s.log);
        }
      });
    return () => {
      live = false;
    };
  }, [id]);

  const apply = useCallback(
    async (bodies: ArgOpBody[], reason: string, author: Author = me, record = true) => {
      let arg = current.current;
      if (!arg || !bodies.length) return;
      const ops: ArgOp[] = [];
      const inverses: ArgOpBody[] = [];
      for (const body of bodies) {
        inverses.unshift(invertArgOp(arg, body));
        const op = makeArgOp(body, author, reason);
        arg = applyArgOp(arg, op);
        ops.push(op);
      }
      if (record) undoStack.current.push(inverses);
      current.current = arg;
      setArgument(arg);
      setLog((l) => [...l, ...ops]);
      setStatus("saving");
      try {
        await getArguments().save(arg, ops);
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    },
    [me],
  );

  const undo = useCallback(() => {
    const inv = undoStack.current.pop();
    if (inv) apply(inv, "Undo", me, false);
  }, [apply, me]);

  return { argument, log, missing, status, me, apply, undo, canUndo: undoStack.current.length > 0 };
}
