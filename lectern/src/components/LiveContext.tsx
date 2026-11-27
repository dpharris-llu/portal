"use client";
import { createContext, useContext } from "react";
import type { PollResults } from "@/audience/model";

export interface LiveInfo {
  results: Record<string, PollResults>;
  activePoll: string | null;
  /** Shown on poll slides so late joiners can find the session. */
  join?: { code: string; host: string };
}

export const LiveContext = createContext<LiveInfo>({ results: {}, activePoll: null });
export const useLive = () => useContext(LiveContext);
