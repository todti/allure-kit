import { describe, expect, it } from "vitest";

import { diffLines } from "../src/diff.js";

describe("core/diff", () => {
  it("returns an empty string when nothing changed", () => {
    expect(diffLines("a\nb", "a\nb")).toBe("");
  });

  it("marks added and removed lines with limited context", () => {
    const before = ["1", "2", "3", "4", "5", "6", "7", "8"].join("\n");
    const after = ["1", "2", "3", "NEW", "4", "5", "6", "7"].join("\n");

    expect(diffLines(before, after, 1)).toBe(["  3", "+ NEW", "  4", "  …", "  7", "- 8"].join("\n"));
  });

  it("shows a new file as all additions", () => {
    expect(diffLines("", "a\nb")).toBe("+ a\n+ b");
  });
});
