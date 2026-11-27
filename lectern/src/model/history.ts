/**
 * Append-only editing history. Undo does not delete operations: it appends
 * the inverse, so the log stays a complete audit trail (spec 6, guardrail 5).
 */
import type { Author, Deck } from "./types";
import { applyOp, invertOp, makeOp, type OpBody, type Operation } from "./ops";

interface Step {
  opId: string;
  /** Bodies that undo the step, in the order they must be applied. */
  inverse: OpBody[];
  label: string;
}

export interface EditorState {
  deck: Deck;
  log: Operation[];
  undoStack: Step[];
  redoStack: Step[];
}

export function initState(deck: Deck, log: Operation[] = []): EditorState {
  return { deck, log, undoStack: [], redoStack: [] };
}

/** Apply several operation bodies as one undoable step (e.g. "AI drafted 6 slides"). */
export function commit(
  state: EditorState,
  bodies: OpBody | OpBody[],
  author: Author,
  reason?: string,
): EditorState {
  const list = Array.isArray(bodies) ? bodies : [bodies];
  if (list.length === 0) return state;
  let deck = state.deck;
  const ops: Operation[] = [];
  const inverses: OpBody[] = [];
  for (const body of list) {
    inverses.unshift(invertOp(deck, body));
    deck = applyOp(deck, body);
    ops.push(makeOp(body, author, reason));
  }
  const step: Step = {
    opId: ops[ops.length - 1].id,
    inverse: inverses,
    label: reason ?? list[0].kind,
  };
  return {
    deck,
    log: [...state.log, ...ops],
    undoStack: [...state.undoStack, step],
    redoStack: [],
  };
}

function applyStep(state: EditorState, step: Step, author: Author, reason: string) {
  let deck = state.deck;
  const ops: Operation[] = [];
  const inverses: OpBody[] = [];
  for (const body of step.inverse) {
    inverses.unshift(invertOp(deck, body));
    deck = applyOp(deck, body);
    ops.push(makeOp(body, author, reason));
  }
  const back: Step = {
    opId: ops[ops.length - 1]?.id ?? step.opId,
    inverse: inverses,
    label: step.label,
  };
  return { deck, ops, back };
}

export function undo(state: EditorState, author: Author): EditorState {
  const step = state.undoStack[state.undoStack.length - 1];
  if (!step) return state;
  const { deck, ops, back } = applyStep(state, step, author, `undo: ${step.label}`);
  return {
    deck,
    log: [...state.log, ...ops],
    undoStack: state.undoStack.slice(0, -1),
    redoStack: [...state.redoStack, back],
  };
}

export function redo(state: EditorState, author: Author): EditorState {
  const step = state.redoStack[state.redoStack.length - 1];
  if (!step) return state;
  const { deck, ops, back } = applyStep(state, step, author, `redo: ${step.label}`);
  return {
    deck,
    log: [...state.log, ...ops],
    undoStack: [...state.undoStack, back],
    redoStack: state.redoStack.slice(0, -1),
  };
}
