/** Sketch of the LecternAI wordmark (spec 3B): navy "Lectern", red "AI", slanted desk-top bar. */
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }} aria-label="LecternAI">
      <span aria-hidden="true">
        Lectern<span className="wordmark-ai">AI</span>
      </span>
      <span className="wordmark-bar" aria-hidden="true" />
    </span>
  );
}
