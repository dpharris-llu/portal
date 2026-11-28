/**
 * Basic PPTX import (F-006, spec 10). Converts text, bullets, tables, images,
 * bar and line charts, and speaker notes into the deck model. Anything else is
 * listed in the import report and on the slide, so nothing is lost silently.
 * Hidden slides become backup slides. Runs in the browser or in Node.
 */
import { unzipSync, strFromU8 } from "fflate";
import type { Block, ChartBlock, Slide } from "@/model/types";
import { newId } from "@/model/ids";
import { child, descendants, kids, parseXml, path, type El } from "./xml";

export interface ImportedAsset {
  id: string;
  mime: string;
  bytes: Uint8Array;
  name: string;
}

export interface SlideReport {
  number: number;
  claim: string;
  claimSource: "title" | "inferred" | "none";
  hidden: boolean;
  converted: number;
  unconverted: string[];
}

export interface ImportReport {
  fileName: string;
  slideCount: number;
  hiddenCount: number;
  /** 0 to 100: share of content converted, with penalties for missing titles. */
  score: number;
  /** Slides with nothing left to review. */
  cleanSlides: number;
  converted: Record<string, number>;
  unconverted: { slide: number; what: string }[];
  imagesMissingAlt: number;
  animationsDropped: number;
  decorativeDropped: number;
  slides: SlideReport[];
}

export interface ImportResult {
  title: string;
  narrative: Slide[];
  backup: Slide[];
  assets: ImportedAsset[];
  report: ImportReport;
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  bmp: "image/bmp",
};

class Package {
  private files: Record<string, Uint8Array>;
  constructor(bytes: Uint8Array) {
    try {
      this.files = unzipSync(bytes);
    } catch {
      throw new Error("This file is not a valid PPTX (it could not be unzipped).");
    }
  }
  has(p: string) {
    return p in this.files;
  }
  bytes(p: string): Uint8Array | undefined {
    return this.files[p];
  }
  xml(p: string): El | undefined {
    const b = this.files[p];
    return b ? parseXml(strFromU8(b)) : undefined;
  }
  /** Relationships of a part, resolved to package paths. */
  rels(part: string): Map<string, { type: string; target: string; external: boolean }> {
    const dir = part.slice(0, part.lastIndexOf("/"));
    const relPath = `${dir}/_rels/${part.slice(part.lastIndexOf("/") + 1)}.rels`;
    const out = new Map<string, { type: string; target: string; external: boolean }>();
    for (const r of kids(this.xml(relPath), "Relationship")) {
      const external = r.attrs.TargetMode === "External";
      out.set(r.attrs.Id, {
        type: r.attrs.Type.slice(r.attrs.Type.lastIndexOf("/") + 1),
        target: external ? r.attrs.Target : resolve(dir, r.attrs.Target),
        external,
      });
    }
    return out;
  }
}

export function resolve(dir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = dir ? dir.split("/") : [];
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

interface Para {
  text: string;
  level: number;
  bullet: boolean;
}

function paragraphs(txBody: El | undefined): Para[] {
  return kids(txBody, "a:p")
    .map((p) => {
      const pPr = child(p, "a:pPr");
      const text = p.children
        .map((c) => (c.name === "a:r" || c.name === "a:fld" ? child(c, "a:t")?.text ?? "" : c.name === "a:br" ? "\n" : ""))
        .join("");
      return {
        text: text.replace(/\u000b/g, "\n").trim(),
        level: Number(pPr?.attrs.lvl ?? 0),
        bullet: Boolean(child(pPr, "a:buChar") || child(pPr, "a:buAutoNum")),
      };
    })
    .filter((p) => p.text.length > 0);
}

function placeholderType(shape: El): string | null {
  const nvPr = child(child(shape, "p:nvSpPr"), "p:nvPr");
  const ph = child(nvPr, "p:ph");
  if (!ph) return null;
  return ph.attrs.type ?? "body";
}

function chartFrom(pkg: Package, chartPath: string, fileName: string): ChartBlock | string {
  const space = pkg.xml(chartPath);
  const plot = path(space, "c:chart", "c:plotArea");
  const kinds = (plot?.children ?? []).filter((c) => c.name.endsWith("Chart")).map((c) => c.name);
  const bar = child(plot, "c:barChart");
  const line = child(plot, "c:lineChart");
  const chart = bar ?? line;
  if (!chart || kinds.length !== 1) {
    const kind = (kinds[0] ?? "unknown").replace(/^c:/, "").replace(/Chart$/, "").replace(/3D$/, " 3D");
    return `${kinds.length > 1 ? "combination" : kind} chart`;
  }
  const cache = (el: El | undefined) =>
    descendants(el, "c:pt")
      .sort((a, b) => Number(a.attrs.idx) - Number(b.attrs.idx))
      .map((pt) => child(pt, "c:v")?.text ?? "");
  const series = kids(chart, "c:ser").map((ser, i) => ({
    name: cache(child(ser, "c:tx"))[0] || `Series ${i + 1}`,
    values: cache(child(ser, "c:val")).map((v) => Number(v) || 0),
  }));
  const labels = cache(child(kids(chart, "c:ser")[0], "c:cat"));
  const kind = bar ? "bar" : "line";
  return {
    id: newId("b"),
    type: "chart",
    chart: kind,
    labels: labels.length ? labels : (series[0]?.values ?? []).map((_, i) => String(i + 1)),
    series,
    alt: "",
    source: `Imported from ${fileName}; original spreadsheet not linked`,
  };
}

interface Ctx {
  pkg: Package;
  rels: ReturnType<Package["rels"]>;
  fileName: string;
  assets: Map<string, ImportedAsset>;
  titles: string[];
  blocks: Block[];
  unconverted: string[];
  converted: Record<string, number>;
  decorative: number;
  missingAlt: number;
}

function count(ctx: Ctx, kind: string) {
  ctx.converted[kind] = (ctx.converted[kind] ?? 0) + 1;
}

function imageAsset(ctx: Ctx, rId: string | undefined): { id: string } | string {
  const rel = rId ? ctx.rels.get(rId) : undefined;
  if (!rel) return "image with a missing file";
  if (rel.external) return "linked image (not embedded in the file)";
  const ext = rel.target.slice(rel.target.lastIndexOf(".") + 1).toLowerCase();
  const mime = MIME[ext];
  if (!mime) return `${ext.toUpperCase()} image (format not supported in browsers)`;
  const existing = ctx.assets.get(rel.target);
  if (existing) return { id: existing.id };
  const bytes = ctx.pkg.bytes(rel.target);
  if (!bytes) return "image with a missing file";
  const asset = { id: newId("a"), mime, bytes, name: rel.target.slice(rel.target.lastIndexOf("/") + 1) };
  ctx.assets.set(rel.target, asset);
  return { id: asset.id };
}

function walk(ctx: Ctx, el: El) {
  switch (el.name) {
    case "p:grpSp":
      for (const c of el.children) walk(ctx, c);
      return;
    case "mc:AlternateContent": {
      // Prefer the fallback when it is a picture (e.g. an embedded object's preview image).
      const fb = child(el, "mc:Fallback");
      const choice = child(el, "mc:Choice");
      const use = fb && descendants(fb, "p:pic").length ? fb : choice ?? fb;
      for (const c of use?.children ?? []) walk(ctx, c);
      return;
    }
    case "p:sp": {
      const ph = placeholderType(el);
      const paras = paragraphs(child(el, "p:txBody"));
      if (paras.length === 0) {
        if (!ph) ctx.decorative++;
        return;
      }
      if (ph === "title" || ph === "ctrTitle") {
        ctx.titles.push(paras.map((p) => p.text).join(" "));
        return;
      }
      if (["dt", "ftr", "sldNum", "hdr"].includes(ph ?? "")) return;
      const listy = (ph !== null && ph !== "subTitle" && paras.length > 1) || paras.some((p) => p.bullet);
      if (listy) {
        const levels = paras.map((p) => p.level);
        ctx.blocks.push({
          id: newId("b"),
          type: "bullets",
          items: paras.map((p) => p.text),
          ...(levels.some((l) => l > 0) ? { levels } : {}),
        });
        count(ctx, "bullets");
      } else {
        ctx.blocks.push({ id: newId("b"), type: "text", text: paras.map((p) => p.text).join("\n") });
        count(ctx, "text");
      }
      return;
    }
    case "p:pic": {
      const cNvPr = path(el, "p:nvPicPr", "p:cNvPr");
      const blip = descendants(child(el, "p:blipFill"), "a:blip")[0];
      const res = imageAsset(ctx, blip?.attrs["r:embed"]);
      if (typeof res === "string") {
        ctx.unconverted.push(res);
        return;
      }
      const alt = (cNvPr?.attrs.descr ?? "").trim();
      if (!alt) ctx.missingAlt++;
      ctx.blocks.push({ id: newId("b"), type: "image", src: `asset:${res.id}`, alt });
      count(ctx, "image");
      return;
    }
    case "p:graphicFrame": {
      const data = path(el, "a:graphic", "a:graphicData");
      const uri = data?.attrs.uri ?? "";
      if (uri.endsWith("/table")) {
        const rows = kids(child(data, "a:tbl"), "a:tr").map((tr) =>
          kids(tr, "a:tc").map((tc) => paragraphs(child(tc, "a:txBody")).map((p) => p.text).join(" ")),
        );
        if (!rows.length) return;
        ctx.blocks.push({ id: newId("b"), type: "table", header: rows[0], rows: rows.slice(1) });
        count(ctx, "table");
      } else if (uri.endsWith("/chart")) {
        const rel = ctx.rels.get(child(data, "c:chart")?.attrs["r:id"] ?? "");
        const res = rel ? chartFrom(ctx.pkg, rel.target, ctx.fileName) : "chart with a missing part";
        if (typeof res === "string") ctx.unconverted.push(res);
        else {
          // Keep the chart's alt text from PowerPoint (Format > Alt Text).
          res.alt = (path(el, "p:nvGraphicFramePr", "p:cNvPr")?.attrs.descr ?? "").trim();
          ctx.blocks.push(res);
          count(ctx, "chart");
        }
      } else if (uri.endsWith("/diagram")) {
        ctx.unconverted.push("SmartArt diagram");
      } else if (uri.endsWith("/ole")) {
        ctx.unconverted.push("embedded object");
      } else {
        ctx.unconverted.push("unsupported graphic");
      }
      return;
    }
    case "p:cxnSp":
      ctx.decorative++;
      return;
    case "p:contentPart":
      ctx.unconverted.push("ink drawing");
      return;
    default:
      return;
  }
}

function notesText(pkg: Package, rels: ReturnType<Package["rels"]>): string {
  const rel = [...rels.values()].find((r) => r.type === "notesSlide");
  if (!rel) return "";
  const tree = path(pkg.xml(rel.target), "p:cSld", "p:spTree");
  const body = kids(tree, "p:sp").find((sp) => placeholderType(sp) === "body");
  return paragraphs(child(body, "p:txBody"))
    .map((p) => p.text)
    .join("\n");
}

export function importPptx(bytes: Uint8Array, fileName = "presentation.pptx"): ImportResult {
  const pkg = new Package(bytes);
  if (!pkg.has("ppt/presentation.xml")) throw new Error("This file is not a PowerPoint presentation.");
  const presRels = pkg.rels("ppt/presentation.xml");
  const ids = kids(path(pkg.xml("ppt/presentation.xml"), "p:sldIdLst"), "p:sldId");
  const slidePaths = ids.map((s) => presRels.get(s.attrs["r:id"])?.target).filter((p): p is string => Boolean(p && pkg.has(p)));

  const assets = new Map<string, ImportedAsset>();
  const narrative: Slide[] = [];
  const backup: Slide[] = [];
  const reports: SlideReport[] = [];
  const unconvertedAll: { slide: number; what: string }[] = [];
  const converted: Record<string, number> = {};
  let missingAlt = 0;
  let animations = 0;
  let decorative = 0;
  let scoreSum = 0;

  slidePaths.forEach((sp, i) => {
    const number = i + 1;
    const sld = pkg.xml(sp)!;
    const hidden = sld.attrs.show === "0";
    const ctx: Ctx = {
      pkg,
      rels: pkg.rels(sp),
      fileName,
      assets,
      titles: [],
      blocks: [],
      unconverted: [],
      converted,
      decorative: 0,
      missingAlt: 0,
    };
    for (const el of path(sld, "p:cSld", "p:spTree")?.children ?? []) walk(ctx, el);
    if (child(sld, "p:timing") && descendants(child(sld, "p:timing"), "p:par").length) animations++;

    // Claim: the title; otherwise the first short line of text, marked for review.
    let claim = ctx.titles.join(" ").trim();
    let claimSource: SlideReport["claimSource"] = claim ? "title" : "none";
    if (!claim) {
      const first = ctx.blocks.find((b) => b.type === "text" || b.type === "bullets");
      const line = first ? (first.type === "text" ? first.text : first.items[0]).split("\n")[0] : "";
      if (line && line.length <= 120) {
        claim = line;
        claimSource = "inferred";
        if (first!.type === "text" && first!.text.trim() === line) ctx.blocks = ctx.blocks.filter((b) => b !== first);
      }
    }

    const notes: string[] = ctx.unconverted.map((u) => `Not converted: ${u}. Recreate it or add an image of it.`);
    if (claimSource === "inferred") notes.unshift("No title in the original; the claim was taken from the slide text. Confirm it.");
    if (claimSource === "none") notes.unshift("No title in the original. Write the claim for this slide.");

    const slide: Slide = {
      id: newId("s"),
      claim,
      intent: "inform",
      blocks: ctx.blocks,
      notes: notesText(pkg, ctx.rels),
      flags: {},
      ...(notes.length ? { importNotes: notes } : {}),
    };
    (hidden ? backup : narrative).push(slide);

    const total = ctx.blocks.length + ctx.unconverted.length;
    const share = total === 0 ? 1 : ctx.blocks.length / total;
    scoreSum += Math.max(0, share - (claimSource === "none" ? 0.25 : claimSource === "inferred" ? 0.1 : 0));
    missingAlt += ctx.missingAlt;
    decorative += ctx.decorative;
    ctx.unconverted.forEach((what) => unconvertedAll.push({ slide: number, what }));
    reports.push({ number, claim, claimSource, hidden, converted: ctx.blocks.length, unconverted: ctx.unconverted });
  });

  const firstTitle = reports.find((r) => r.claimSource === "title")?.claim;
  const coreTitle = path(pkg.xml("docProps/core.xml"), "dc:title")?.text.trim();
  return {
    title: coreTitle || firstTitle || fileName.replace(/\.pptx$/i, ""),
    narrative,
    backup,
    assets: [...assets.values()],
    report: {
      fileName,
      slideCount: reports.length,
      hiddenCount: backup.length,
      score: reports.length ? Math.round((scoreSum / reports.length) * 100) : 0,
      cleanSlides: [...narrative, ...backup].filter((s) => !s.importNotes).length,
      converted,
      unconverted: unconvertedAll,
      imagesMissingAlt: missingAlt,
      animationsDropped: animations,
      decorativeDropped: decorative,
      slides: reports,
    },
  };
}
