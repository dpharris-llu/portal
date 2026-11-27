/**
 * Rule-based layout (spec 3, "Layout"). Picks an arrangement from the slide's
 * blocks and the theme; never stores positions. All rects are slide-relative (0..1).
 * Pure and synchronous so it can run on every keystroke and be reused by export.
 */
import type { Block, Rect, Slide } from "@/model/types";
import type { Theme } from "@/theme/types";

export const SLIDE_W = 1600;
export const SLIDE_H = 900;

export type LayoutName = "statement" | "quote" | "visual" | "split" | "stack" | "grid";
export const LAYOUT_NAMES: LayoutName[] = ["statement", "quote", "visual", "split", "stack", "grid"];

export interface LayoutBox {
  blockId: string;
  rect: Rect;
  /** Multiplier on the theme's body size, after shrink-to-fit. */
  fontScale: number;
}

export interface SlideLayout {
  name: LayoutName;
  title: { rect: Rect; fontPx: number };
  boxes: LayoutBox[];
  freeform?: Rect;
  /** Content that could not fit even at the minimum font scale. */
  warnings: string[];
}

const MIN_SCALE = 0.6;
const VISUAL: Block["type"][] = ["image", "chart", "table", "poll"];

export function isVisual(b: Block): boolean {
  return VISUAL.includes(b.type);
}

/** Approximate characters of text a block needs to show. */
export function textLength(b: Block): { chars: number; lines: number } {
  switch (b.type) {
    case "text":
      return { chars: b.text.length, lines: 1 };
    case "bullets":
      return { chars: b.items.join(" ").length, lines: b.items.length };
    case "quote":
      return { chars: b.text.length + (b.attribution?.length ?? 0), lines: 2 };
    default:
      return { chars: 0, lines: 0 };
  }
}

/** Largest font scale (<= 1) at which the text fits the rect, by a simple line-wrap estimate. */
export function fitScale(b: Block, rect: Rect, bodyPx: number): { scale: number; fits: boolean } {
  if (isVisual(b)) return { scale: 1, fits: true };
  const { chars, lines: minLines } = textLength(b);
  const widthPx = rect.w * SLIDE_W;
  const heightPx = rect.h * SLIDE_H;
  for (let scale = 1; scale >= MIN_SCALE - 1e-9; scale -= 0.05) {
    const px = bodyPx * scale * (b.type === "quote" ? 1.3 : 1);
    const perLine = Math.max(1, Math.floor(widthPx / (px * 0.52)));
    const lines = Math.max(minLines, Math.ceil(chars / perLine) + (b.type === "bullets" ? minLines * 0.3 : 0));
    if (lines * px * 1.35 <= heightPx) return { scale: Math.round(scale * 100) / 100, fits: true };
  }
  return { scale: MIN_SCALE, fits: false };
}

/** Choose a layout from the blocks alone (overridable per slide). */
export function chooseLayout(blocks: Block[]): LayoutName {
  if (blocks.length === 0) return "statement";
  const visuals = blocks.filter(isVisual);
  const texts = blocks.filter((b) => !isVisual(b));
  if (blocks.length === 1 && blocks[0].type === "quote") return "quote";
  if (visuals.length === 1 && texts.length === 0) return "visual";
  if (visuals.length === 1 && texts.length <= 2) return "split";
  if (visuals.length === 0 && texts.length <= 3) return "stack";
  return "grid";
}

/** The part of the body area left over once a freeform region is placed: the largest strip beside it. */
export function areaAround(body: Rect, ff: Rect): Rect {
  const strips: Rect[] = [
    { x: body.x, y: body.y, w: Math.max(0, ff.x - body.x), h: body.h },
    { x: ff.x + ff.w, y: body.y, w: Math.max(0, body.x + body.w - (ff.x + ff.w)), h: body.h },
    { x: body.x, y: body.y, w: body.w, h: Math.max(0, ff.y - body.y) },
    { x: body.x, y: ff.y + ff.h, w: body.w, h: Math.max(0, body.y + body.h - (ff.y + ff.h)) },
  ];
  return strips.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
}

function splitVertical(area: Rect, weights: number[], gap: number): Rect[] {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const usable = area.h - gap * (weights.length - 1);
  let y = area.y;
  return weights.map((w) => {
    const h = (usable * w) / total;
    const r = { x: area.x, y, w: area.w, h };
    y += h + gap;
    return r;
  });
}

function weightOf(b: Block): number {
  if (isVisual(b)) return 3;
  const { chars, lines } = textLength(b);
  return Math.max(1, Math.min(4, chars / 120 + lines * 0.4));
}

export function layoutSlide(slide: Slide, theme: Theme): SlideLayout {
  const m = theme.spacing.margin;
  const gapX = theme.spacing.gap;
  const gapY = gapX * (SLIDE_W / SLIDE_H);
  const mY = m * (SLIDE_W / SLIDE_H);

  const override = LAYOUT_NAMES.find((n) => n === slide.layoutOverride);
  const name = override ?? chooseLayout(slide.blocks);

  const titleFont = name === "statement" ? theme.sizes.title * 1.3 : theme.sizes.title;
  const titleH = name === "statement" ? 0.5 : 0.2;
  const titleRect: Rect =
    name === "statement"
      ? { x: m, y: 0.25, w: 1 - 2 * m, h: titleH }
      : { x: m, y: mY, w: 1 - 2 * m, h: titleH };

  let body: Rect = { x: m, y: mY + titleH + gapY * 0.5, w: 1 - 2 * m, h: 1 - (mY + titleH + gapY * 0.5) - mY };
  if (slide.freeform) body = areaAround(body, slide.freeform.rect);

  const blocks = slide.blocks;
  let rects: Rect[] = [];
  switch (name) {
    case "statement":
      rects = splitVertical({ ...body, y: 0.78, h: Math.max(0.05, 1 - 0.78 - mY) }, blocks.map(() => 1), gapY);
      break;
    case "quote":
    case "visual":
    case "stack":
      rects = splitVertical(body, blocks.map(weightOf), gapY);
      break;
    case "split": {
      const visualFirst = isVisual(blocks[0]);
      const textW = body.w * 0.42;
      const visW = body.w - textW - gapX;
      const textArea: Rect = { x: visualFirst ? body.x + visW + gapX : body.x, y: body.y, w: textW, h: body.h };
      const visArea: Rect = { x: visualFirst ? body.x : body.x + textW + gapX, y: body.y, w: visW, h: body.h };
      const texts = blocks.filter((b) => !isVisual(b));
      const textRects = splitVertical(textArea, texts.map(weightOf), gapY);
      let t = 0;
      rects = blocks.map((b) => (isVisual(b) ? visArea : textRects[t++]));
      break;
    }
    case "grid": {
      const cols = 2;
      const rows = Math.ceil(blocks.length / cols);
      const cellW = (body.w - gapX * (cols - 1)) / cols;
      const cellH = (body.h - gapY * (rows - 1)) / rows;
      rects = blocks.map((_, i) => ({
        x: body.x + (i % cols) * (cellW + gapX),
        y: body.y + Math.floor(i / cols) * (cellH + gapY),
        w: cellW,
        h: cellH,
      }));
      break;
    }
  }

  const warnings: string[] = [];
  const boxes = blocks.map((b, i) => {
    const fit = fitScale(b, rects[i], theme.sizes.body);
    if (!fit.fits) warnings.push(`Block ${i + 1} (${b.type}) may overflow; consider splitting the slide.`);
    return { blockId: b.id, rect: rects[i], fontScale: fit.scale };
  });

  const titleFit = Math.min(1, (titleRect.w * SLIDE_W) / (Math.max(1, slide.claim.length) * titleFont * 0.5) * (name === "statement" ? 3 : 2));
  return {
    name,
    title: { rect: titleRect, fontPx: Math.round(titleFont * Math.max(0.6, titleFit)) },
    boxes,
    freeform: slide.freeform?.rect,
    warnings,
  };
}
