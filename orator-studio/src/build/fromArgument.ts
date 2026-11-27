/**
 * Orator Build drafts slides from a Research argument (F-003): a thesis slide,
 * one slide per point (its conclusion as the headline, its evidence as the
 * body), then open questions, the recommendation and next steps. Points the
 * author leaves out of the talk become backup slides. Each point slide records
 * its point, so later argument changes can show which slides they affect.
 */
import type { Block, Slide } from "@/model/types";
import type { Argument, ArgPoint } from "@/model/argument";
import { isSupported } from "@/model/argument";
import { newId } from "@/model/ids";
import { newSlide } from "@/model/factory";

export const MINUTES_PER_SLIDE = 2;

function pointSlide(p: ArgPoint): Slide {
  const items = p.evidence.map((e) => (e.source ? `${e.text} (${e.source})` : e.text));
  const blocks: Block[] = [{ id: newId("b"), type: "bullets", items: items.length ? items : ["[Evidence needed]"] } as Block];
  const quoted = p.evidence.find((e) => e.quote);
  if (quoted) blocks.push({ id: newId("b"), type: "quote", text: quoted.quote!, attribution: quoted.source ?? "" } as Block);
  const slide = newSlide(p.text.replace(/[.]$/, "") || "Untitled point", p.intent, blocks);
  slide.pointId = p.id;
  slide.notes = p.detail;
  const review = [
    ...(isSupported(p) ? [] : ["This point had no evidence in Research. Add it there, or here, before presenting."]),
    ...(p.byAi ? ["Claude wrote or proposed this point. Make it your own."] : []),
  ];
  if (review.length) slide.importNotes = review;
  return slide;
}

export function draftFromArgument(arg: Argument, include: (p: ArgPoint) => boolean = () => true): { narrative: Slide[]; backup: Slide[] } {
  const narrative: Slide[] = [];
  const title = newSlide((arg.thesis || arg.title || arg.purpose || "Untitled").replace(/[.]$/, ""), "inform", []);
  const intro = [arg.audience && `For: ${arg.audience}`, arg.takeaway && arg.takeaway !== arg.thesis && `Takeaway: ${arg.takeaway}`].filter(Boolean) as string[];
  if (intro.length) title.blocks.push({ id: newId("b"), type: "bullets", items: intro } as Block);
  title.notes = arg.purpose ? `Purpose: ${arg.purpose}` : "";
  narrative.push(title);

  const kept = arg.points.filter(include);
  narrative.push(...kept.map(pointSlide));
  if (arg.openQuestions.length)
    narrative.push(newSlide("What we don't know yet", "inform", [{ id: newId("b"), type: "bullets", items: arg.openQuestions } as Block]));
  if (arg.recommendation.trim()) narrative.push(newSlide("Recommendation", "decide", [{ id: newId("b"), type: "text", text: arg.recommendation.trim() } as Block]));
  if (arg.nextSteps.length) narrative.push(newSlide("Next steps", "decide", [{ id: newId("b"), type: "bullets", items: arg.nextSteps } as Block]));

  const backup = arg.points.filter((p) => !include(p)).map(pointSlide);
  return { narrative, backup };
}

/** Slides that fit a time limit, at about two minutes a slide. */
export const slidesFor = (minutes: number) => Math.max(1, Math.floor(minutes / MINUTES_PER_SLIDE));
