import { describe, expect, it } from "vitest";

import { PYTHON_FRAMEWORK_REGISTRY } from "../src/registry.js";

describe("kit/python/registry", () => {
  describe("PYTHON_FRAMEWORK_REGISTRY", () => {
    it("should contain all expected frameworks", () => {
      const frameworkIds = PYTHON_FRAMEWORK_REGISTRY.map((framework) => framework.id);

      expect(frameworkIds).toContain("behave");
      expect(frameworkIds).toContain("pytest");
      expect(frameworkIds).toContain("pytest-bdd");
      expect(frameworkIds).toContain("robotframework");
    });

    it("should have unique ids", () => {
      const ids = PYTHON_FRAMEWORK_REGISTRY.map((framework) => framework.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it("should have unique adapter packages", () => {
      const adapters = PYTHON_FRAMEWORK_REGISTRY.map((framework) => framework.adapterPackage);
      const uniqueAdapters = new Set(adapters);

      expect(uniqueAdapters.size).toBe(adapters.length);
    });
  });
});
