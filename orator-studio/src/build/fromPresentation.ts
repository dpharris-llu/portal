/**
 * Orator Build drafts slides from a presentation (F-136): a title slide with
 * its purpose and audience, then for each topic in order a section slide (when
 * there is more than one topic) and one slide per chosen assertion: the
 * assertion as the headline, the facts that support it as the body, a quote
 * where one exists, and the facts that qualify or contradict it in the
 * speaker notes. Assertions of those topics left out become backup slides.
 * A last slide lists the sources, with any copyright notice they require.
 */
import type { Block, Slide } from "@/model/types";
import { newId } from "@/model/ids";
import { newSlide } from "@/model/factory";
import type { PresentationView } from "@/knowledge/repo";
import type { Assertion, Fact, Source } from "@/knowledge/types";

const block = (b: Omit<Block, "id">) => ({ id: newId("b"), ...b }) as Block;
const short = (s?: Source) => (s ? s.short || s.title : "");

function assertionSlide(a: Assertion, v: PresentationView, flagged: Set<string>): Slide {
  const facts = new Map(v.facts.map((f) => [f.id, f]));
  const sources = new Map(v.sources.map((s) => [s.id, s]));
  const links = v.assertionFacts.filter((l) => l.assertion_id === a.id).map((l) => ({ l, f: facts.get(l.fact_id) })).filter((x): x is { l: (typeof v.assertionFacts)[number]; f: Fact } => Boolean(x.f && x.f.status === "active"));
  const supports = links.filter((x) => x.l.role === "supports");
  const label = (f: Fact) => {
    const s = sources.get(f.source_id);
    return s?.kind === "scripture" ? f.text : `${f.text} (${short(s)})`;
  };
  const blocks: Block[] = [block({ type: "bullets", items: supports.length ? supports.map((x) => label(x.f)) : ["[Evidence needed]"] } as Omit<Block, "id">)];
  const quoted = supports.find((x) => x.f.quote && x.f.quote !== x.f.text);
  if (quoted) blocks.push(block({ type: "quote", text: quoted.f.quote!, attribution: short(sources.get(quoted.f.source_id)) } as Omit<Block, "id">));
  const slide = newSlide(a.text.replace(/[.]$/, ""), "persuade", blocks);
  slide.pointId = a.id;
  const qualifies = links.filter((x) => x.l.role === "qualifies").map((x) => `Qualifies: ${label(x.f)}`);
  const against = links.filter((x) => x.l.role === "contradicts").map((x) => `Against: ${label(x.f)}`);
  slide.notes = [...qualifies, ...against].join("\n");
  const review = [
    ...(links.length ? [] : ["This assertion is unsupported: no facts are linked yet. Investigate it in Curate before presenting."]),
    ...(flagged.has(a.id) ? ["Evidence behind this assertion changed. Review it in Curate."] : []),
    ...(a.still_held ? [] : ["You marked this assertion as no longer held."]),
  ];
  if (review.length) slide.importNotes = review;
  return slide;
}

export function draftFromPresentation(v: PresentationView, flaggedAssertions: Set<string> = new Set()): { narrative: Slide[]; backup: Slide[] } {
  const p = v.presentation;
  const narrative: Slide[] = [];
  const title = newSlide(p.title || "Untitled presentation", "inform", []);
  if (p.audience) title.blocks.push(block({ type: "bullets", items: [`For: ${p.audience}`] } as Omit<Block, "id">));
  title.notes = p.purpose ? `Purpose: ${p.purpose}` : "";
  narrative.push(title);

  const backup: Slide[] = [];
  for (const t of v.topics) {
    const chosen = v.chosen[t.id] ?? [];
    if (v.topics.length > 1 && chosen.length) {
      const section = newSlide(t.name, "inform", t.description ? [block({ type: "text", text: t.description } as Omit<Block, "id">)] : []);
      narrative.push(section);
    }
    narrative.push(...chosen.map((a) => assertionSlide(a, v, flaggedAssertions)));
    backup.push(...(v.available[t.id] ?? []).filter((a) => !chosen.some((c) => c.id === a.id)).map((a) => assertionSlide(a, v, flaggedAssertions)));
  }

  // The sources behind the chosen assertions, with any notice a license requires (Bible versions).
  const used = new Set(Object.values(v.chosen).flat().flatMap((a) => v.assertionFacts.filter((l) => l.assertion_id === a.id).map((l) => l.fact_id)));
  const srcIds = [...new Set(v.facts.filter((f) => used.has(f.id)).map((f) => f.source_id))];
  const cited = v.sources.filter((s) => srcIds.includes(s.id));
  if (cited.length) narrative.push(newSlide("Sources", "inform", [block({ type: "bullets", items: cited.map((s) => s.citation || s.title) } as Omit<Block, "id">)]));
  return { narrative, backup };
}
