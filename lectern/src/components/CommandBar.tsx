"use client";
/** Cmd/Ctrl+K search over every slide, backups included, with thumbnails (L-01, L-09). */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Deck } from "@/model/types";
import type { Theme } from "@/theme/types";
import { LOW_CONFIDENCE, search, type SearchIndex } from "@/search/index";
import { SlideView } from "./SlideView";

export function CommandBar({
  deck,
  index,
  theme,
  initialQuery = "",
  onPick,
  onClose,
}: {
  deck: Deck;
  index: SearchIndex;
  theme: Theme;
  initialQuery?: string;
  onPick: (slideId: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => (q.trim() ? search(index, q) : []), [index, q]);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => setSel(0), [q]);

  return (
    <div className="cmdk-backdrop" onMouseDown={onClose}>
      <div className="cmdk" role="dialog" aria-label="Jump to a slide" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          value={q}
          placeholder="Search slides, backups, notes, data labels…"
          aria-label="Search slides"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
            else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === "Enter" && hits[sel]) onPick(hits[sel].slideId);
          }}
        />
        {q.trim() && hits.length === 0 && <p className="muted">No matching slides.</p>}
        {hits.length > 0 && hits[0].confidence < LOW_CONFIDENCE && (
          <p className="muted small">Weak matches only. Pick one to preview it; nothing is shown to the audience yet.</p>
        )}
        <ul className="cmdk-results" role="listbox" aria-label="Matches">
          {hits.map((h, i) => (
            <li key={h.slideId}>
              <button role="option" aria-selected={i === sel} onClick={() => onPick(h.slideId)}>
                <SlideView slide={deck.slides[h.slideId]} theme={theme} />
                <span className="small">
                  {h.section === "narrative" ? `Slide ${h.position + 1}` : `Backup ${h.position + 1}`} · {Math.round(h.confidence * 100)}%
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="muted small">
          <span className="kbd">Enter</span> preview privately · <span className="kbd">Esc</span> close
        </p>
      </div>
    </div>
  );
}
