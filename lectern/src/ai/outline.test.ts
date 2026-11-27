import { describe, expect, it } from "vitest";
import { OutlineRequest, templateOutline, targetSlideCount } from "./outline";

describe("outline", () => {
  it("sizes the template outline to the time limit and ends with a decision", () => {
    const req = OutlineRequest.parse({ goal: "Approve the pilot", timeLimitMin: 20 });
    const out = templateOutline(req);
    expect(out.nodes.length).toBe(targetSlideCount(20));
    expect(out.nodes.at(-1)!.intent).toBe("decide");
  });
});
