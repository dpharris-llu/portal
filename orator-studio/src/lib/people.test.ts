import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { normalEmail, validEmail } from "./people";

describe("invitations", () => {
  it("normalizes and checks addresses", () => {
    expect(normalEmail("  Ana.Delgado@Example.ORG ")).toBe("ana.delgado@example.org");
    expect(validEmail("ana@example.org")).toBe(true);
    expect(validEmail("ana@example")).toBe(false);
    expect(validEmail("not an email")).toBe(false);
  });
});
