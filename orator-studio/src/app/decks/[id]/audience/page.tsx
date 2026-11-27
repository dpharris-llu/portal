"use client";
/** The audience screen. It only mirrors what the presenter sends, over a local channel. */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Deck } from "@/model/types";
import type { AudienceView } from "@/present/state";
import { audienceChannel, type AudienceMessage } from "@/present/channel";
import { getTheme } from "@/theme/llu";
import { SlideView } from "@/components/SlideView";
import { JoinScreen } from "@/components/JoinScreen";
import { LiveContext, type LiveInfo } from "@/components/LiveContext";

export default function AudiencePage() {
  const { id } = useParams<{ id: string }>();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [view, setView] = useState<AudienceView>({ kind: "blank" });
  const [live, setLive] = useState<LiveInfo>({ results: {}, activePoll: null });

  useEffect(() => {
    const ch = audienceChannel(id);
    if (!ch) return;
    ch.onmessage = (e: MessageEvent<AudienceMessage | string>) => {
      if (typeof e.data === "string") return;
      if (e.data.deckJson) setDeck(JSON.parse(e.data.deckJson));
      setView(e.data.view);
      if (e.data.live) setLive(e.data.live);
    };
    ch.postMessage("hello");
    return () => ch.close();
  }, [id]);

  const slide = deck && view.kind === "slide" ? deck.slides[view.slideId] : null;
  const theme = getTheme(deck?.meta.themeId ?? "llu");
  return (
    <LiveContext.Provider value={live}>
      <main className="audience" onDoubleClick={() => document.documentElement.requestFullscreen?.()}>
        {view.kind === "join" ? (
          <JoinScreen code={view.code} url={view.url} theme={theme} />
        ) : slide ? (
          <SlideView slide={slide} theme={theme} />
        ) : (
          <span className="sr-only">Waiting for the presenter</span>
        )}
      </main>
    </LiveContext.Provider>
  );
}
