"use client";
/**
 * Offer a generated file to the person. Inside claude.ai the page has no
 * download permission of its own, so it asks the viewer through the
 * `downloads` capability (they confirm the save); elsewhere it uses an
 * ordinary browser download.
 */
type Downloads = { save(r: { filename: string; data: string | Blob }): Promise<{ status: string }> };
type Use = { use(name: string): Promise<unknown> };

let downloadsPromise: Promise<Downloads | null> | null = null;
function viewerDownloads(): Promise<Downloads | null> {
  const w = window as unknown as { claude?: Use };
  if (!w.claude?.use) return Promise.resolve(null);
  downloadsPromise ??= w.claude.use("downloads").then((d) => (d as Downloads | null) ?? null, () => null);
  return downloadsPromise;
}

/** Resolves "saved", "declined" (the viewer said no), or an error message. */
export async function saveFile(filename: string, data: string, type = "text/plain"): Promise<"saved" | "declined" | string> {
  const d = await viewerDownloads();
  if (d) {
    try {
      await d.save({ filename, data });
      return "saved";
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "declined") return "declined";
      if (code === "rate_limited") return "Another save is waiting for your answer. Try again in a moment.";
      return "This view can't save files. Open the page in a browser to download it.";
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return "saved";
}
