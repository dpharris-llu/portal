/**
 * Audience response sessions (spec 8). Pure state and rules, shared by the
 * server store and the tests. The presenter controls everything the room sees:
 * free text is queued for approval, and polls open and close on command.
 */
import { isFlagged } from "./filter";
import type { PollKind } from "@/model/types";

export type { PollKind };

export interface PollSpec {
  /** The poll block on the slide this poll belongs to. */
  blockId: string;
  kind: PollKind;
  question: string;
  options: string[];
  /** Rating polls: highest value (lowest is 1). */
  scale?: number;
}

export type Moderation = "pending" | "approved" | "rejected";

export type Answer =
  | { kind: "choice"; option: number }
  | { kind: "rating"; value: number }
  | { kind: "ranking"; order: number[] }
  | { kind: "text"; text: string };

interface StoredAnswer {
  answer: Answer;
  at: number;
  /** Free-text answers only. */
  status?: Moderation;
  flagged?: boolean;
}

export interface PollRecord {
  spec: PollSpec;
  open: boolean;
  responses: Record<string, StoredAnswer>;
}

export type QuestionStatus = "pending" | "approved" | "dismissed" | "answered";

export interface Question {
  id: string;
  text: string;
  device: string;
  at: number;
  status: QuestionStatus;
  flagged: boolean;
  votes: string[];
}

export interface Session {
  id: string;
  code: string;
  hostKey: string;
  createdAt: number;
  locked: boolean;
  ended: boolean;
  qaOpen: boolean;
  activePoll: string | null;
  polls: Record<string, PollRecord>;
  questions: Question[];
  devices: Record<string, { joinedAt: number; lastSubmit: number; lastAsk: number }>;
}

export const LIMITS = {
  textLength: 280,
  submitIntervalMs: 1000,
  askIntervalMs: 15000,
  maxDevices: 1000,
};

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

// No 0/O, 1/I/L, so codes read cleanly from a screen.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function randomCode(rand: () => number = Math.random, length = 6): string {
  return Array.from({ length }, () => CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]).join("");
}

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function newSession(id: string, code: string, hostKey: string, now: number): Session {
  return {
    id,
    code,
    hostKey,
    createdAt: now,
    locked: false,
    ended: false,
    qaOpen: true,
    activePoll: null,
    polls: {},
    questions: [],
    devices: {},
  };
}

/** A device joins (or returns). Locked rooms admit only devices already in. */
export function join(s: Session, device: string, now: number): Result {
  if (s.ended) return fail("This session has ended.");
  if (s.devices[device]) return ok(undefined);
  if (s.locked) return fail("The presenter has locked this room.");
  if (Object.keys(s.devices).length >= LIMITS.maxDevices) return fail("This session is full.");
  s.devices[device] = { joinedAt: now, lastSubmit: -Infinity, lastAsk: -Infinity };
  return ok(undefined);
}

export function openPoll(s: Session, spec: PollSpec): void {
  const valid = cleanSpec(spec);
  const existing = s.polls[spec.blockId];
  // Reopening the same poll keeps its responses; a changed poll starts fresh.
  if (!existing || JSON.stringify(existing.spec) !== JSON.stringify(valid)) {
    s.polls[spec.blockId] = { spec: valid, open: true, responses: {} };
  } else {
    existing.open = true;
  }
  for (const [id, p] of Object.entries(s.polls)) if (id !== spec.blockId) p.open = false;
  s.activePoll = spec.blockId;
}

export function cleanSpec(spec: PollSpec): PollSpec {
  return {
    blockId: spec.blockId,
    kind: spec.kind,
    question: spec.question.slice(0, 300),
    options: spec.kind === "choice" || spec.kind === "ranking" ? spec.options.map((o) => o.slice(0, 120)).slice(0, 12) : [],
    ...(spec.kind === "rating" ? { scale: Math.max(2, Math.min(10, spec.scale ?? 5)) } : {}),
  };
}

export function closePoll(s: Session): void {
  if (s.activePoll && s.polls[s.activePoll]) s.polls[s.activePoll].open = false;
  s.activePoll = null;
}

export function checkAnswer(spec: PollSpec, a: Answer): Result<Answer> {
  switch (spec.kind) {
    case "choice":
      return a.kind === "choice" && Number.isInteger(a.option) && a.option >= 0 && a.option < spec.options.length ? ok(a) : fail("Pick one of the options.");
    case "rating":
      return a.kind === "rating" && Number.isInteger(a.value) && a.value >= 1 && a.value <= (spec.scale ?? 5) ? ok(a) : fail("Pick a rating.");
    case "ranking": {
      const n = spec.options.length;
      if (a.kind !== "ranking" || a.order.length !== n) return fail("Rank every option.");
      const sorted = [...a.order].sort((x, y) => x - y);
      return sorted.every((v, i) => v === i) ? ok(a) : fail("Rank every option once.");
    }
    case "text":
    case "wordcloud": {
      if (a.kind !== "text") return fail("Type a response.");
      const text = a.text.trim().replace(/\s+/g, " ");
      if (!text) return fail("Type a response.");
      if (text.length > (spec.kind === "wordcloud" ? 40 : LIMITS.textLength)) return fail("That response is too long.");
      return ok({ kind: "text", text });
    }
  }
}

/** One response per device per poll (A-01, rule 3); rate limited. */
export function respond(s: Session, device: string, blockId: string, answer: Answer, now: number): Result {
  const d = s.devices[device];
  if (!d) return fail("Join the session first.");
  if (s.ended) return fail("This session has ended.");
  const poll = s.polls[blockId];
  if (!poll || !poll.open || s.activePoll !== blockId) return fail("This poll is closed.");
  if (poll.responses[device]) return fail("You have already responded to this poll.");
  if (now - d.lastSubmit < LIMITS.submitIntervalMs) return fail("Slow down a moment, then try again.");
  const checked = checkAnswer(poll.spec, answer);
  if (!checked.ok) return checked;
  d.lastSubmit = now;
  const isText = checked.value.kind === "text";
  poll.responses[device] = {
    answer: checked.value,
    at: now,
    ...(isText ? { status: "pending" as const, flagged: isFlagged((checked.value as { text: string }).text) } : {}),
  };
  return ok(undefined);
}

/** Normalize a question's text, or say why it cannot be asked. */
export function cleanQuestion(text: string): Result<string> {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length < 3) return fail("Type a question.");
  if (t.length > LIMITS.textLength) return fail(`Keep questions under ${LIMITS.textLength} characters.`);
  return ok(t);
}

export function ask(s: Session, device: string, text: string, id: string, now: number): Result<string> {
  const d = s.devices[device];
  if (!d) return fail("Join the session first.");
  if (s.ended) return fail("This session has ended.");
  if (!s.qaOpen) return fail("Questions are closed right now.");
  const cleaned = cleanQuestion(text);
  if (!cleaned.ok) return cleaned;
  const t = cleaned.value;
  if (now - d.lastAsk < LIMITS.askIntervalMs) return fail("You can ask another question in a few seconds.");
  d.lastAsk = now;
  s.questions.push({ id, text: t, device, at: now, status: "pending", flagged: isFlagged(t), votes: [] });
  return ok(id);
}

/** Upvote an approved question; voting again removes the vote. */
export function vote(s: Session, device: string, questionId: string): Result {
  if (!s.devices[device]) return fail("Join the session first.");
  const q = s.questions.find((x) => x.id === questionId);
  if (!q || q.status !== "approved") return fail("That question is not open for votes.");
  if (q.device === device) return fail("You cannot vote for your own question.");
  q.votes = q.votes.includes(device) ? q.votes.filter((v) => v !== device) : [...q.votes, device];
  return ok(undefined);
}

export function moderateQuestion(s: Session, questionId: string, status: QuestionStatus): Result {
  const q = s.questions.find((x) => x.id === questionId);
  if (!q) return fail("No such question.");
  q.status = status;
  return ok(undefined);
}

export function moderateText(s: Session, blockId: string, device: string, status: Moderation): Result {
  const r = s.polls[blockId]?.responses[device];
  if (!r || r.answer.kind !== "text") return fail("No such response.");
  r.status = status;
  return ok(undefined);
}

/** Approve every pending, unflagged text response (flagged ones stay for review). */
export function approveUnflagged(s: Session, blockId: string): number {
  let n = 0;
  for (const r of Object.values(s.polls[blockId]?.responses ?? {})) {
    if (r.status === "pending" && !r.flagged) {
      r.status = "approved";
      n++;
    }
  }
  return n;
}

// ---- Results ----

export type PollResults =
  | { kind: "counts"; labels: string[]; counts: number[]; total: number; average?: number }
  | { kind: "ranking"; labels: string[]; scores: number[]; total: number }
  | { kind: "texts"; items: string[]; total: number }
  | { kind: "words"; words: { word: string; count: number }[]; total: number };

export function tally(p: PollRecord): PollResults {
  const answers = Object.values(p.responses);
  const total = answers.length;
  switch (p.spec.kind) {
    case "choice": {
      const counts = p.spec.options.map(() => 0);
      for (const r of answers) if (r.answer.kind === "choice") counts[r.answer.option]++;
      return { kind: "counts", labels: p.spec.options, counts, total };
    }
    case "rating": {
      const scale = p.spec.scale ?? 5;
      const counts = Array.from({ length: scale }, () => 0);
      let sum = 0;
      for (const r of answers) if (r.answer.kind === "rating") {
        counts[r.answer.value - 1]++;
        sum += r.answer.value;
      }
      return { kind: "counts", labels: counts.map((_, i) => String(i + 1)), counts, total, average: total ? Math.round((sum / total) * 10) / 10 : 0 };
    }
    case "ranking": {
      // Borda count: first place earns n-1 points, last earns 0.
      const n = p.spec.options.length;
      const scores = p.spec.options.map(() => 0);
      for (const r of answers) if (r.answer.kind === "ranking") r.answer.order.forEach((opt, place) => (scores[opt] += n - 1 - place));
      return { kind: "ranking", labels: p.spec.options, scores, total };
    }
    case "text": {
      const items = answers.filter((r) => r.status === "approved" && r.answer.kind === "text").map((r) => (r.answer as { text: string }).text);
      return { kind: "texts", items, total };
    }
    case "wordcloud": {
      const counts = new Map<string, number>();
      for (const r of answers) {
        if (r.status !== "approved" || r.answer.kind !== "text") continue;
        const w = r.answer.text.toLowerCase();
        counts.set(w, (counts.get(w) ?? 0) + 1);
      }
      const words = [...counts].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word)).slice(0, 60);
      return { kind: "words", words, total };
    }
  }
}

// ---- Views ----

export interface HostView {
  id: string;
  code: string;
  locked: boolean;
  ended: boolean;
  qaOpen: boolean;
  participants: number;
  activePoll: string | null;
  results: Record<string, PollResults>;
  /** Free-text poll responses awaiting moderation, for the active poll. */
  pendingTexts: { device: string; text: string; flagged: boolean }[];
  questions: { id: string; text: string; status: QuestionStatus; flagged: boolean; votes: number; at: number }[];
  /** What every phone may see; the presenter relays it in cloud mode. */
  room: RoomView;
}

/** The public part of a session, identical for every phone. */
export interface RoomView {
  code: string;
  ended: boolean;
  qaOpen: boolean;
  poll: PollSpec | null;
  questions: { id: string; text: string; votes: number; answered: boolean }[];
}

export function roomView(s: Session): RoomView {
  const p = s.activePoll ? s.polls[s.activePoll] : null;
  return {
    code: s.code,
    ended: s.ended,
    qaOpen: s.qaOpen,
    poll: p && p.open ? p.spec : null,
    questions: s.questions
      .filter((q) => q.status === "approved" || q.status === "answered")
      .map((q) => ({ id: q.id, text: q.text, votes: q.votes.length, answered: q.status === "answered" })),
  };
}

export function hostView(s: Session): HostView {
  const active = s.activePoll ? s.polls[s.activePoll] : null;
  return {
    id: s.id,
    code: s.code,
    locked: s.locked,
    ended: s.ended,
    qaOpen: s.qaOpen,
    participants: Object.keys(s.devices).length,
    activePoll: s.activePoll,
    results: Object.fromEntries(Object.entries(s.polls).map(([id, p]) => [id, tally(p)])),
    pendingTexts: active
      ? Object.entries(active.responses)
          .filter(([, r]) => r.status === "pending" && r.answer.kind === "text")
          .map(([device, r]) => ({ device, text: (r.answer as { text: string }).text, flagged: Boolean(r.flagged) }))
      : [],
    questions: s.questions
      .filter((q) => q.status !== "dismissed")
      .map((q) => ({ id: q.id, text: q.text, status: q.status, flagged: q.flagged, votes: q.votes.length, at: q.at })),
    room: roomView(s),
  };
}

export interface ParticipantView {
  code: string;
  ended: boolean;
  qaOpen: boolean;
  poll: (PollSpec & { responded: boolean }) | null;
  /** Only approved questions are visible to the room (A-04). */
  questions: { id: string; text: string; votes: number; voted: boolean; mine: boolean; answered: boolean }[];
  /** This device's own questions still waiting for approval. */
  myPending: number;
}

export function participantView(s: Session, device: string): ParticipantView {
  const p = s.activePoll ? s.polls[s.activePoll] : null;
  return {
    code: s.code,
    ended: s.ended,
    qaOpen: s.qaOpen,
    poll: p && p.open ? { ...p.spec, responded: Boolean(p.responses[device]) } : null,
    questions: s.questions
      .filter((q) => q.status === "approved" || q.status === "answered")
      .map((q) => ({ id: q.id, text: q.text, votes: q.votes.length, voted: q.votes.includes(device), mine: q.device === device, answered: q.status === "answered" }))
      .sort(byRoomOrder),
    myPending: s.questions.filter((q) => q.device === device && q.status === "pending").length,
  };
}

function byRoomOrder(a: { answered: boolean; votes: number }, b: { answered: boolean; votes: number }) {
  return Number(a.answered) - Number(b.answered) || b.votes - a.votes;
}

/** Same poll, compared field by field (key order differs once stored in Postgres). */
export function samePoll(a: PollSpec, b: PollSpec): boolean {
  return (
    a.blockId === b.blockId &&
    a.kind === b.kind &&
    a.question === b.question &&
    (a.scale ?? null) === (b.scale ?? null) &&
    a.options.length === b.options.length &&
    a.options.every((o, i) => o === b.options[i])
  );
}

/**
 * Update a phone's view from a room broadcast without asking the server.
 * Returns null when the phone needs its own view refetched: a different poll
 * opened (it may already have answered it), or one of its questions was approved.
 */
export function mergeRoom(prev: ParticipantView, room: RoomView, mine: ReadonlySet<string>): ParticipantView | null {
  if (room.ended) return { ...prev, ended: true };
  let poll: ParticipantView["poll"] = null;
  if (room.poll) {
    if (!prev.poll || !samePoll(prev.poll, room.poll)) return null;
    poll = { ...room.poll, responded: prev.poll.responded };
  }
  const before = new Map(prev.questions.map((q) => [q.id, q]));
  if (room.questions.some((q) => mine.has(q.id) && !before.has(q.id))) return null;
  return {
    code: room.code,
    ended: false,
    qaOpen: room.qaOpen,
    poll,
    questions: room.questions
      .map((q) => ({ ...q, voted: before.get(q.id)?.voted ?? false, mine: mine.has(q.id) }))
      .sort(byRoomOrder),
    myPending: prev.myPending,
  };
}
