/**
 * A first-pass profanity and abuse filter. It only flags: flagged text is never
 * auto-approved, and every free-text item still goes through the presenter's
 * queue (spec 5A, rule 2). The list is deliberately short; extend it per site.
 */
const WORDS = [
  "fuck", "shit", "bitch", "bastard", "asshole", "dick", "cunt", "slut", "whore", "fag", "faggot",
  "nigger", "nigga", "retard", "kys", "kill yourself", "rape",
];
const PATTERN = new RegExp(`(^|[^a-z])(${WORDS.map((w) => w.replace(/ /g, "\\s+")).join("|")})(s|es|ed|ing|er|ers)?([^a-z]|$)`, "i");

/** Undo common character swaps (f*ck, sh1t) before matching. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/[3]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[$5]/g, "s")
    .replace(/[*]/g, "u");
}

export function isFlagged(text: string): boolean {
  return PATTERN.test(text) || PATTERN.test(normalize(text)) || /https?:\/\//i.test(text);
}
