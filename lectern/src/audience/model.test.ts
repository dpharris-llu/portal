import { describe, expect, it } from "vitest";
import {
  approveUnflagged, ask, closePoll, hostView, join, LIMITS, moderateQuestion, moderateText, newSession,
  normalizeCode, openPoll, participantView, randomCode, respond, tally, vote, type PollSpec,
} from "./model";
import { isFlagged } from "./filter";

const choice: PollSpec = { blockId: "p1", kind: "choice", question: "Best time?", options: ["Morning", "Noon", "Evening"] };

function room(n = 3) {
  const s = newSession("s1", "ABC234", "key", 0);
  for (let i = 0; i < n; i++) join(s, `d${i}`, 0);
  return s;
}

describe("audience sessions", () => {
  it("makes readable join codes", () => {
    const code = randomCode();
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(normalizeCode(" abc-234 ")).toBe("ABC234");
  });

  it("counts one choice per device and only while the poll is open", () => {
    const s = room();
    expect(respond(s, "d0", "p1", { kind: "choice", option: 0 }, 5000).ok).toBe(false);
    openPoll(s, choice);
    expect(respond(s, "d0", "p1", { kind: "choice", option: 0 }, 5000).ok).toBe(true);
    expect(respond(s, "d0", "p1", { kind: "choice", option: 1 }, 9000)).toEqual({ ok: false, error: "You have already responded to this poll." });
    expect(respond(s, "d1", "p1", { kind: "choice", option: 2 }, 5000).ok).toBe(true);
    expect(respond(s, "d2", "p1", { kind: "choice", option: 7 }, 5000).ok).toBe(false);
    expect(tally(s.polls.p1)).toEqual({ kind: "counts", labels: choice.options, counts: [1, 0, 1], total: 2 });
    closePoll(s);
    expect(respond(s, "d2", "p1", { kind: "choice", option: 1 }, 9000).ok).toBe(false);
    expect(participantView(s, "d2").poll).toBeNull();
  });

  it("keeps responses when the same poll reopens, and resets when it changed", () => {
    const s = room();
    openPoll(s, choice);
    respond(s, "d0", "p1", { kind: "choice", option: 0 }, 5000);
    closePoll(s);
    openPoll(s, choice);
    expect(tally(s.polls.p1).total).toBe(1);
    openPoll(s, { ...choice, options: ["A", "B"] });
    expect(tally(s.polls.p1).total).toBe(0);
  });

  it("tallies ratings with an average and rankings by Borda count", () => {
    const s = room();
    openPoll(s, { blockId: "r", kind: "rating", question: "Clear?", options: [], scale: 5 });
    respond(s, "d0", "r", { kind: "rating", value: 5 }, 5000);
    respond(s, "d1", "r", { kind: "rating", value: 4 }, 5000);
    expect(respond(s, "d2", "r", { kind: "rating", value: 6 }, 5000).ok).toBe(false);
    expect(tally(s.polls.r)).toMatchObject({ counts: [0, 0, 0, 1, 1], average: 4.5 });

    openPoll(s, { blockId: "k", kind: "ranking", question: "Priority?", options: ["A", "B", "C"] });
    respond(s, "d0", "k", { kind: "ranking", order: [1, 0, 2] }, 9000);
    respond(s, "d1", "k", { kind: "ranking", order: [1, 2, 0] }, 9000);
    expect(respond(s, "d2", "k", { kind: "ranking", order: [1, 1, 0] }, 9000).ok).toBe(false);
    expect(tally(s.polls.k)).toMatchObject({ scores: [1, 4, 1], total: 2 });
  });

  it("shows free text to the room only after approval; flagged text is never auto-approved", () => {
    const s = room();
    openPoll(s, { blockId: "w", kind: "wordcloud", question: "One word?", options: [] });
    respond(s, "d0", "w", { kind: "text", text: "Clarity" }, 5000);
    respond(s, "d1", "w", { kind: "text", text: "clarity" }, 5000);
    respond(s, "d2", "w", { kind: "text", text: "sh1t" }, 5000);
    expect(tally(s.polls.w)).toEqual({ kind: "words", words: [], total: 3 });
    expect(hostView(s).pendingTexts).toHaveLength(3);
    expect(approveUnflagged(s, "w")).toBe(2);
    expect(tally(s.polls.w)).toMatchObject({ words: [{ word: "clarity", count: 2 }] });
    expect(hostView(s).pendingTexts).toEqual([{ device: "d2", text: "sh1t", flagged: true }]);
    moderateText(s, "w", "d2", "rejected");
    expect(hostView(s).pendingTexts).toEqual([]);
  });

  it("queues questions for moderation before anyone sees them", () => {
    const s = room();
    expect(ask(s, "d0", "What does the pilot cost?", "q1", 1000).ok).toBe(true);
    expect(ask(s, "d0", "And who runs it?", "q2", 2000)).toMatchObject({ ok: false });
    expect(ask(s, "d0", "And who runs it?", "q2", 1000 + LIMITS.askIntervalMs).ok).toBe(true);
    expect(participantView(s, "d1").questions).toEqual([]);
    expect(participantView(s, "d0").myPending).toBe(2);
    expect(vote(s, "d1", "q1").ok).toBe(false);

    moderateQuestion(s, "q1", "approved");
    moderateQuestion(s, "q2", "dismissed");
    expect(vote(s, "d1", "q1").ok).toBe(true);
    expect(vote(s, "d2", "q1").ok).toBe(true);
    expect(vote(s, "d0", "q1").ok).toBe(false); // own question
    expect(vote(s, "d2", "q1").ok).toBe(true); // toggles off
    expect(participantView(s, "d1").questions).toEqual([{ id: "q1", text: "What does the pilot cost?", votes: 1, voted: true, mine: false, answered: false }]);
    expect(hostView(s).questions.map((q) => q.id)).toEqual(["q1"]);
  });

  it("locks the room to devices already in", () => {
    const s = room(1);
    s.locked = true;
    expect(join(s, "d0", 1).ok).toBe(true);
    expect(join(s, "new", 1).ok).toBe(false);
  });

  it("rate limits submissions per device", () => {
    const s = room(1);
    openPoll(s, { blockId: "t", kind: "text", question: "Thoughts?", options: [] });
    expect(respond(s, "d0", "t", { kind: "text", text: "x".repeat(LIMITS.textLength + 1) }, 5000).ok).toBe(false);
    expect(respond(s, "d0", "t", { kind: "text", text: "fine" }, 5000).ok).toBe(true);
    openPoll(s, choice);
    expect(respond(s, "d0", "p1", { kind: "choice", option: 0 }, 5500)).toEqual({ ok: false, error: "Slow down a moment, then try again." });
  });

  it("flags abuse and links", () => {
    expect(isFlagged("This is f*ck ridiculous")).toBe(true);
    expect(isFlagged("see http://spam.example")).toBe(true);
    expect(isFlagged("What about class sizes in Dickinson Hall?")).toBe(false);
    expect(isFlagged("Great talk")).toBe(false);
  });
});
