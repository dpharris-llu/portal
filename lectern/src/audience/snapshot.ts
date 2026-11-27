/** Turn the `live_snapshot` JSON from Postgres into the model's Session, so the same view code serves both stores. */
import type { Answer, PollSpec, QuestionStatus, Session } from "./model";

export interface Snapshot {
  session: { id: string; code: string; locked: boolean; ended: boolean; qa_open: boolean; active_poll: string | null; created_at: string };
  polls: { block_id: string; spec: PollSpec; open: boolean }[];
  responses: { block_id: string; device: string; answer: Answer; status: "pending" | "approved" | "rejected" | null; flagged: boolean; at: number }[];
  questions: { id: string; device: string; text: string; status: QuestionStatus; flagged: boolean; at: number; votes: string[] }[];
  devices: string[];
}

export function sessionFromSnapshot(snap: Snapshot): Session {
  const polls: Session["polls"] = {};
  for (const p of snap.polls) polls[p.block_id] = { spec: p.spec, open: p.open, responses: {} };
  for (const r of snap.responses) {
    const poll = polls[r.block_id];
    if (!poll) continue;
    poll.responses[r.device] = {
      answer: r.answer,
      at: Number(r.at),
      ...(r.status ? { status: r.status, flagged: r.flagged } : {}),
    };
  }
  return {
    id: snap.session.id,
    code: snap.session.code,
    hostKey: "",
    createdAt: Date.parse(snap.session.created_at),
    locked: snap.session.locked,
    ended: snap.session.ended,
    qaOpen: snap.session.qa_open,
    activePoll: snap.session.active_poll,
    polls,
    questions: snap.questions.map((q) => ({ ...q, at: Number(q.at), votes: q.votes ?? [] })),
    devices: Object.fromEntries(snap.devices.map((d) => [d, { joinedAt: 0, lastSubmit: -Infinity, lastAsk: -Infinity }])),
  };
}
