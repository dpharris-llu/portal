"use client";
/**
 * Push-to-talk voice jump (L-03) using the browser's speech recognition where it
 * exists. Failures never touch the audience screen (spec 5, failure behavior).
 */
type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

export function speechAvailable(): boolean {
  return typeof window !== "undefined" && Boolean((window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition);
}

export function listenOnce(onText: (text: string) => void, onFail: (reason: string) => void): () => void {
  const w = window as unknown as Record<string, new () => Recognition>;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) {
    onFail("Voice is not available in this browser. Use Ctrl+K.");
    return () => {};
  }
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  let got = false;
  rec.onresult = (e) => {
    got = true;
    onText(e.results[0][0].transcript);
  };
  rec.onerror = (e) => onFail(e.error === "network" ? "Voice needs a network connection. Use Ctrl+K." : `Voice failed (${e.error}). Use Ctrl+K.`);
  rec.onend = () => {
    if (!got) onFail("Did not catch that. Use Ctrl+K.");
  };
  rec.start();
  return () => rec.stop();
}
