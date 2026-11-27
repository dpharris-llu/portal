"use client";
import { Qr } from "./Qr";
import type { Theme } from "@/theme/types";
import { primary } from "@/theme/rules";

/** Full-slide join instructions for the audience screen (A-01). */
export function JoinScreen({ code, url, theme }: { code: string; url: string; theme: Theme }) {
  const host = new URL(url).host;
  return (
    <div className="slide join-screen" style={{ background: theme.background, color: theme.text }}>
      <div className="slide-accent" style={{ background: primary(theme).hex }} />
      <div className="join-inner">
        <div>
          <p className="join-lead">Join from your phone</p>
          <p className="join-url">Go to <strong>{host}/join</strong></p>
          <p className="join-url">and enter</p>
          <p className="join-code" style={{ color: primary(theme).hex }}>{code.slice(0, 3)} {code.slice(3)}</p>
          <p className="join-note">No account needed. Responses are anonymous.</p>
        </div>
        <div className="join-qr"><Qr url={url} size={360} label={`QR code to join with code ${code}`} /></div>
      </div>
    </div>
  );
}
