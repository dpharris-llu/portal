/**
 * OratorStudio wordmark: "Orator" in navy, "Studio" in Regent Red, on a light
 * background (navy 15.4:1, red 8.0:1). Regent Red on black is only 2.6:1, so a
 * dark-background version needs a lighter red; see the README.
 */
export function Wordmark({ size = 28, tagline = false }: { size?: number; tagline?: boolean }) {
  return (
    <span className="wordmark-wrap">
      <span className="wordmark" style={{ fontSize: size }} aria-label="OratorStudio">
        <span aria-hidden="true">
          Orator<span className="wordmark-studio">Studio</span>
        </span>
      </span>
      {tagline && <span className="wordmark-tagline" style={{ fontSize: Math.max(14, size * 0.42) }}>Ideas first. Slides follow.</span>}
    </span>
  );
}
