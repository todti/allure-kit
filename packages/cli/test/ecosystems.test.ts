import { describe, expect, it } from "vitest";

import { npmAdapter } from "@todti/allure-kit-npm";
import { pythonAdapter } from "@todti/allure-kit-python";

import { ECOSYSTEMS } from "../src/ecosystems.js";

describe("kit/ecosystems", () => {
  it("should register npm first and python second (auto-detect priority)", () => {
    expect(ECOSYSTEMS).toEqual([npmAdapter, pythonAdapter]);
  });

  it("should have unique ids", () => {
    const ids = ECOSYSTEMS.map((ecosystem) => ecosystem.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have non-overlapping lang aliases", () => {
    const allAliases = ECOSYSTEMS.flatMap((ecosystem) => ecosystem.langAliases);

    expect(new Set(allAliases).size).toBe(allAliases.length);
  });

  it("should have non-overlapping manifest files", () => {
    const allManifests = ECOSYSTEMS.flatMap((ecosystem) => ecosystem.manifestFiles);

    expect(new Set(allManifests).size).toBe(allManifests.length);
  });
});
