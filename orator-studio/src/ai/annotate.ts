/**
 * Annotated bibliography (F-135): Claude drafts a source's annotation from its
 * citation and the facts kept from it (what it found, how strong, why it
 * matters). The author edits it; it is labeled as drafted by Claude until then.
 */
import { z } from "zod";

export const Annotation = z.object({ annotation: z.string().max(1200) });

export const AnnotateRequest = z.object({
  citation: z.string().min(2).max(1000),
  design: z.string().max(300).default(""),
  sample: z.string().max(300).default(""),
  access: z.string().max(30).default(""),
  facts: z.array(z.object({ text: z.string().max(1000), kind: z.string().max(20) })).max(60),
});
export type AnnotateRequest = z.infer<typeof AnnotateRequest>;

export function annotatePrompt(r: AnnotateRequest): string {
  return [
    "Draft an annotation for an annotated bibliography entry, from the facts kept from this source only.",
    `Source: ${r.citation}`,
    r.design ? `Design: ${r.design}` : "",
    r.sample ? `Sample: ${r.sample}` : "",
    r.access === "abstract" ? "Only the abstract was read; say so." : "",
    "Facts kept from it:",
    ...r.facts.map((f, i) => `${i + 1}. [${f.kind}] ${f.text}`),
    "",
    "Write 2 to 4 plain sentences: what it found, how strong the evidence is (design, size, limitations as stated in the facts), and what it is useful for. Use only what the facts say; add no numbers or claims of your own.",
    'Reply with only JSON: {"annotation":"..."}',
  ]
    .filter((l) => l !== "")
    .join("\n");
}
