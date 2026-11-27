/** A demo deck used on first run, so the editor and presenter have something to show. */
import type { Deck } from "./types";
import { applyOp, type OpBody } from "./ops";
import { bulletsBlock, emptyDeck, newSlide, textBlock } from "./factory";
import { newId } from "./ids";

export function sampleDeck(): Deck {
  let deck = emptyDeck({
    title: "Why LecternAI",
    goal: "Get approval to pilot LecternAI with five LLU admins",
    audience: "LLU leadership",
    timeLimitMin: 15,
    takeaway: "Structured decks are faster to build, easier to trust, and easier to present.",
  });

  const narrative = [
    newSlide("PowerPoint stores boxes, not arguments", "inform", [
      bulletsBlock([
        "Restyling means nudging every box by hand",
        "Numbers cannot show where they came from",
        "One deck cannot become a 5-minute and a 45-minute version",
      ]),
    ]),
    newSlide("A deck should be a model of its argument", "persuade", [
      textBlock("Each slide holds one claim, its evidence, and what the presenter wants from the room. Layout is generated from that."),
      {
        id: newId("b"),
        type: "quote",
        text: "Authors edit meaning; layout follows.",
        attribution: "Design principle 1",
      },
    ]),
    newSlide("Board decks need sourced numbers", "persuade", [
      {
        id: newId("b"),
        type: "chart",
        chart: "bar",
        labels: ["Q1", "Q2", "Q3", "Q4"],
        series: [
          { name: "Decks reviewed", values: [12, 15, 19, 22] },
          { name: "Errors caught", values: [3, 4, 2, 5] },
        ],
        alt: "Bar chart: decks reviewed rose from 12 to 22 over four quarters; errors caught ranged from 2 to 5.",
        source: "Illustrative figures for the demo deck",
      },
    ]),
    newSlide("Where would a pilot help most?", "decide", [
      {
        id: newId("b"),
        type: "poll",
        poll: "choice",
        question: "Which decks cost your team the most time?",
        options: ["Board and budget", "Enrollment reports", "Accreditation", "Lectures"],
      },
    ]),
    newSlide("Approve a pilot with five admins", "decide", [
      bulletsBlock(["Each admin ships three real decks", "We measure time saved and errors caught", "Decision on Stage 1 after eight weeks"]),
    ]),
  ];
  const backup = [
    newSlide("Customer churn by cohort", "inform", [
      {
        id: newId("b"),
        type: "table",
        header: ["Cohort", "Retained after 1 year"],
        rows: [
          ["2023", "81%"],
          ["2024", "86%"],
          ["2025", "90%"],
        ],
        caption: "Illustrative retention figures",
      },
    ]),
    newSlide("Security and privacy plan", "inform", [
      bulletsBlock(["Non-sensitive content only in version .3", "Row Level Security on every table", "No training on customer content"]),
    ]),
  ];
  backup[0].notes = "Why customers leave: retention improves each cohort.";
  backup[1].flags = { requireConfirm: true };

  const ops: OpBody[] = [
    ...narrative.map((slide, index) => ({ kind: "slide.insert" as const, slide, section: "narrative" as const, index })),
    ...backup.map((slide, index) => ({ kind: "slide.insert" as const, slide, section: "backup" as const, index })),
  ];
  for (const op of ops) deck = applyOp(deck, op);
  return deck;
}
