/**
 * Live presenting state (spec 5). The audience screen changes only through
 * explicit presenter actions: a match is previewed privately first (L-04), slides
 * flagged never-show-on-voice cannot be previewed by voice, flagged slides need a
 * second confirmation (L-06), and one action returns to the main narrative (L-05).
 */
import type { Deck, Id } from "@/model/types";

export type AudienceView = { kind: "slide"; slideId: Id } | { kind: "blank" };

export interface PresenterState {
  /** Position in the main narrative. */
  index: number;
  audience: AudienceView;
  /** Slide shown on the presenter screen only, waiting to be sent. */
  preview: Id | null;
  /** Set after the first press of "send" on a require-confirm slide. */
  confirming: Id | null;
  /** True while the audience sees something other than the current narrative slide. */
  detour: boolean;
  /** Last message for the presenter (failures, refusals). Never shown to the audience. */
  notice: string | null;
}

export type PresenterAction =
  | { type: "next" }
  | { type: "prev" }
  | { type: "goto"; index: number }
  | { type: "preview"; slideId: Id; via: "search" | "voice" | "question" }
  | { type: "cancelPreview" }
  | { type: "send" }
  | { type: "returnToPlace" }
  | { type: "toggleBlank" }
  | { type: "notice"; message: string | null };

export function initPresenter(deck: Deck, index = 0): PresenterState {
  const id = deck.narrative[index];
  return {
    index,
    audience: id ? { kind: "slide", slideId: id } : { kind: "blank" },
    preview: null,
    confirming: null,
    detour: false,
    notice: null,
  };
}

function show(deck: Deck, state: PresenterState, index: number): PresenterState {
  const i = Math.max(0, Math.min(index, deck.narrative.length - 1));
  const id = deck.narrative[i];
  return {
    ...state,
    index: i,
    audience: id ? { kind: "slide", slideId: id } : { kind: "blank" },
    detour: false,
    confirming: null,
  };
}

export function presenterReducer(deck: Deck, state: PresenterState, action: PresenterAction): PresenterState {
  switch (action.type) {
    case "next":
      // From a detour, "next" first returns to the narrative.
      return state.detour ? show(deck, state, state.index) : show(deck, state, state.index + 1);
    case "prev":
      return state.detour ? show(deck, state, state.index) : show(deck, state, state.index - 1);
    case "goto":
      return show(deck, state, action.index);
    case "preview": {
      const slide = deck.slides[action.slideId];
      if (!slide) return { ...state, notice: "That slide no longer exists." };
      if (action.via === "voice" && slide.flags.neverShowOnVoice) {
        return { ...state, notice: `"${slide.claim}" cannot be opened by voice. Use the command bar.` };
      }
      return { ...state, preview: action.slideId, confirming: null, notice: null };
    }
    case "cancelPreview":
      return { ...state, preview: null, confirming: null };
    case "send": {
      const id = state.preview;
      if (!id) return state;
      const slide = deck.slides[id];
      if (!slide) return { ...state, preview: null, notice: "That slide no longer exists." };
      if (slide.flags.requireConfirm && state.confirming !== id) {
        return { ...state, confirming: id, notice: `"${slide.claim}" is marked confidential. Send again to show it.` };
      }
      const onNarrative = deck.narrative[state.index] === id;
      return {
        ...state,
        audience: { kind: "slide", slideId: id },
        preview: null,
        confirming: null,
        detour: !onNarrative,
        notice: null,
      };
    }
    case "returnToPlace":
      return { ...show(deck, state, state.index), preview: null };
    case "toggleBlank":
      if (state.audience.kind === "blank") return show(deck, state, state.index);
      return { ...state, audience: { kind: "blank" } };
    case "notice":
      return { ...state, notice: action.message };
  }
}
