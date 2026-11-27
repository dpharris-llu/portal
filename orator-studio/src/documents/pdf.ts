/**
 * Reads the positioned text of a PDF with pdf.js, on the page's own thread
 * (no separate worker file), so it works in the app, the single-file demo and
 * tests. The file never leaves the browser.
 */
import type { PageText } from "./extract";

export class NoTextError extends Error {}

export async function readPdf(bytes: Uint8Array): Promise<PageText[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const g = globalThis as unknown as { pdfjsWorker?: unknown };
  // pdf.js runs its worker code in this thread when it finds it here.
  if (!g.pdfjsWorker) g.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    disableFontFace: true,
    useSystemFonts: false,
    // Text extraction needs no font files; built-in metrics cover the standard fonts.
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  const doc = await task.promise;
  try {
    const pages: PageText[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items = content.items.flatMap((it) => {
        if (!("str" in it)) return [];
        const [, , c, d, e, f] = it.transform as number[];
        return [{ str: it.str, x: e, y: f, width: it.width, height: it.height || Math.hypot(c, d) }];
      });
      pages.push({ page: n, items });
      page.cleanup();
    }
    if (pages.every((p) => p.items.every((i) => !i.str.trim()))) {
      throw new NoTextError("This PDF has no text layer; it looks like a scan. Scanned documents are not supported yet.");
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
