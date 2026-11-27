"use client";
/**
 * Renders a slide from the model: layout comes from the rule engine, colors from
 * theme tokens. Sizes are in container-query units, so the same slide renders as
 * a thumbnail, in the editor, or full screen.
 */
import type { Block, Slide } from "@/model/types";
import type { Theme } from "@/theme/types";
import { layoutSlide, SLIDE_W, type SlideLayout } from "@/layout/engine";
import { BlockView } from "./BlockView";

const cq = (px: number) => `${((px / SLIDE_W) * 100).toFixed(3)}cqw`;
const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

export function SlideView({
  slide,
  theme,
  layout,
  className = "",
  label,
}: {
  slide: Slide;
  theme: Theme;
  layout?: SlideLayout;
  className?: string;
  label?: string;
}) {
  const l = layout ?? layoutSlide(slide, theme);
  const accent = theme.colors.find((c) => c.role === "primary")?.hex ?? theme.text;
  return (
    <div
      className={`slide ${className}`}
      style={{ background: theme.background, color: theme.text, fontFamily: theme.fonts.body }}
      role="img"
      aria-label={label ?? `Slide: ${slide.claim}`}
      data-layout={l.name}
    >
      <div className="slide-accent" style={{ background: accent }} />
      <h2
        className="slide-title"
        style={{
          left: pct(l.title.rect.x),
          top: pct(l.title.rect.y),
          width: pct(l.title.rect.w),
          height: pct(l.title.rect.h),
          fontSize: cq(l.title.fontPx),
          fontFamily: theme.fonts.heading,
          alignItems: l.name === "statement" ? "center" : "flex-end",
        }}
      >
        {slide.claim || <span className="placeholder">Claim</span>}
      </h2>
      {l.boxes.map((box, i) => (
        <div
          key={box.blockId}
          className="slide-box"
          data-type={slide.blocks[i]?.type}
          style={{
            left: pct(box.rect.x),
            top: pct(box.rect.y),
            width: pct(box.rect.w),
            height: pct(box.rect.h),
            fontSize: cq(theme.sizes.body * box.fontScale),
          }}
        >
          <BlockView block={slide.blocks[i] as Block} theme={theme} />
        </div>
      ))}
      {slide.freeform && (
        <div
          className="slide-freeform"
          style={{
            left: pct(slide.freeform.rect.x),
            top: pct(slide.freeform.rect.y),
            width: pct(slide.freeform.rect.w),
            height: pct(slide.freeform.rect.h),
            fontSize: cq(theme.sizes.body),
          }}
        >
          {slide.freeform.blocks.map((b) => (
            <BlockView key={b.id} block={b} theme={theme} />
          ))}
        </div>
      )}
    </div>
  );
}
