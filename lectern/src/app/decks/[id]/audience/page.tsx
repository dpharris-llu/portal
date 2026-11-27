"use client";
/** The audience screen. It only mirrors what the presenter sends, over a local channel. */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Deck } from "@/model/types";
import type { AudienceView } from "@/present/state";
import { audienceChannel, type AudienceMessage } from "@/present/channel";
import { getTheme } from "@/theme/llu";
import { SlideView } from "@/components/SlideView";

export default function AudiencePage() {
  const { id } = useParams<{ id: string }>();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [view, setView] = useState<AudienceView>({ kind: "blank" });

  useEffect(() => {
    const ch = audienceChannel(id);
    if (!ch) return;
    ch.onmessage = (e: MessageEvent<AudienceMessage | string>) => {
      if (typeof e.data === "string") return;
      if (e.data.deckJson) setDeck(JSON.parse(e.data.deckJson));
      setView(e.data.view);
    };
    ch.postMessage("hello");
    return () => ch.close();
  }, [id]);

  const slide = deck && view.kind === "slide" ? deck.slides[view.slideId] : null;
  return (
    <main className="audience" onDoubleClick={() => document.documentElement.requestFullscreen?.()}>
      {slide && deck ? <SlideView slide={slide} theme={getTheme(deck.meta.themeId)} /> : <span className="sr-only">Waiting for the presenter</span>}
    </main>
  );
}
