"use client";
/**
 * A drawer over the page: work that belongs to one item (reading a paper,
 * linking it to topics) opens here, so the list behind it stays as it was.
 * A side panel on wide screens, a full-height sheet on phones. Escape or the
 * close button dismisses it; focus moves into it when it opens.
 */
import { useEffect, useRef } from "react";

export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="drawer-root">
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}>
        <header className="drawer-head">
          <strong>{title}</strong>
          <button className="small ghost" onClick={onClose} aria-label="Close">Close ✕</button>
        </header>
        <div className="drawer-body">{children}</div>
      </div>
    </div>
  );
}
