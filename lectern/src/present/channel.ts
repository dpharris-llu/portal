/**
 * Presenter-to-audience-window sync. BroadcastChannel works between windows of
 * the same browser with no network, so presenting never depends on a server (spec 8).
 */
import type { AudienceView } from "./state";

export interface AudienceMessage {
  deckId: string;
  view: AudienceView;
  /** The deck itself is sent so the audience window needs no storage or network. */
  deckJson?: string;
}

export function audienceChannel(deckId: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(`lectern-audience-${deckId}`);
}
