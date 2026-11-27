/** The argument as a written brief (F-016), in Markdown. */
import { argumentTitle, isSupported, type Argument } from "@/model/argument";

export function briefMarkdown(a: Argument): string {
  const out: string[] = [`# ${argumentTitle(a)}`, ""];
  if (a.purpose) out.push(`**Purpose:** ${a.purpose}`, "");
  if (a.audience) out.push(`**Audience:** ${a.audience}`, "");
  if (a.thesis) out.push(`## Summary`, "", a.thesis, "");
  if (a.points.length) {
    out.push("## The argument", "");
    a.points.forEach((p, i) => {
      out.push(`### ${i + 1}. ${p.text || "Untitled point"}`, "");
      if (p.detail) out.push(p.detail, "");
      if (isSupported(p)) {
        out.push("Evidence:", "");
        for (const e of p.evidence) out.push(`- ${e.text}${e.quote ? ` ("${e.quote}")` : ""}${e.source ? ` (${e.source})` : ""}`);
        out.push("");
      } else out.push("_No evidence yet._", "");
    });
  }
  if (a.openQuestions.length) out.push("## What we don't know yet", "", ...a.openQuestions.map((q) => `- ${q}`), "");
  if (a.recommendation) out.push("## Recommendation", "", a.recommendation, "");
  if (a.nextSteps.length) out.push("## Next steps", "", ...a.nextSteps.map((s) => `- ${s}`), "");
  if (a.points.some((p) => p.byAi)) out.push("---", "", "_Some points were written or proposed by Claude and edited by the author._", "");
  return out.join("\n");
}
