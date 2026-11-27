import { describe, expect, it } from "vitest";
import { initPresenter, presenterReducer as r } from "./state";
import { sampleDeck } from "@/model/sample";

describe("presenter", () => {
  const deck = sampleDeck();
  const [n0, n1] = deck.narrative;
  const [churn, security] = deck.backup;

  it("previews privately, sends, and returns to place", () => {
    let s = initPresenter(deck);
    s = r(deck, s, { type: "next" });
    expect(s.audience).toEqual({ kind: "slide", slideId: n1 });
    s = r(deck, s, { type: "preview", slideId: churn, via: "search" });
    expect(s.audience).toEqual({ kind: "slide", slideId: n1 });
    s = r(deck, s, { type: "send" });
    expect(s.audience).toEqual({ kind: "slide", slideId: churn });
    expect(s.detour).toBe(true);
    s = r(deck, s, { type: "returnToPlace" });
    expect(s.audience).toEqual({ kind: "slide", slideId: n1 });
    expect(s.detour).toBe(false);
  });

  it("next from a detour returns to the narrative first", () => {
    let s = initPresenter(deck);
    s = r(deck, s, { type: "preview", slideId: churn, via: "search" });
    s = r(deck, s, { type: "send" });
    s = r(deck, s, { type: "next" });
    expect(s.audience).toEqual({ kind: "slide", slideId: n0 });
  });

  it("requires a second send for confidential slides", () => {
    let s = initPresenter(deck);
    s = r(deck, s, { type: "preview", slideId: security, via: "search" });
    s = r(deck, s, { type: "send" });
    expect(s.audience).toEqual({ kind: "slide", slideId: n0 });
    expect(s.notice).toMatch(/confidential/);
    s = r(deck, s, { type: "send" });
    expect(s.audience).toEqual({ kind: "slide", slideId: security });
  });

  it("refuses voice previews of never-show-on-voice slides", () => {
    const d = structuredClone(deck);
    d.slides[churn].flags.neverShowOnVoice = true;
    let s = initPresenter(d);
    s = r(d, s, { type: "preview", slideId: churn, via: "voice" });
    expect(s.preview).toBeNull();
    expect(s.notice).toBeTruthy();
    s = r(d, s, { type: "preview", slideId: churn, via: "search" });
    expect(s.preview).toBe(churn);
  });

  it("shows the join screen and returns from it without skipping a slide", () => {
    let s = initPresenter(deck);
    s = r(deck, s, { type: "showJoin", code: "ABC234", url: "https://x/j/ABC234" });
    expect(s.audience.kind).toBe("join");
    s = r(deck, s, { type: "next" });
    expect(s.audience).toEqual({ kind: "slide", slideId: n0 });
  });

  it("blanks and unblanks the audience screen", () => {
    let s = initPresenter(deck);
    s = r(deck, s, { type: "toggleBlank" });
    expect(s.audience.kind).toBe("blank");
    s = r(deck, s, { type: "toggleBlank" });
    expect(s.audience).toEqual({ kind: "slide", slideId: n0 });
  });
});
