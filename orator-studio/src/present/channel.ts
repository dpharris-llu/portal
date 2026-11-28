/**
 * Presenter-to-audience-window sync. BroadcastChannel works between windows of
 * the same browser with no network, so presenting never depends on a server (spec 11).
 */
import type { AudienceView } from "./state";
import type { LiveInfo } from "@/components/LiveContext";

export interface AudienceMessage {
  deckId: string;
  view: AudienceView;
  /** The deck itself is sent so the audience window needs no storage or network. */
  deckJson?: string;
  /** Live poll results for slides on screen. */
  live?: LiveInfo;
}

export function audienceChannel(deckId: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(`lectern-audience-${deckId}`);
}
