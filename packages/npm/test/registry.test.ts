import { describe, expect, it } from "vitest";

import { findFrameworkByPackageName, FRAMEWORK_REGISTRY } from "../src/registry.js";

describe("kit/npm/registry", () => {
  describe("FRAMEWORK_REGISTRY", () => {
    it("should contain all expected frameworks", () => {
      const frameworkIds = FRAMEWORK_REGISTRY.map((framework) => framework.id);

      expect(frameworkIds).toContain("vitest");
      expect(frameworkIds).toContain("playwright");
      expect(frameworkIds).toContain("jest");
      expect(frameworkIds).toContain("mocha");
      expect(frameworkIds).toContain("cypress");
      expect(frameworkIds).toContain("cucumberjs");
      expect(frameworkIds).toContain("jasmine");
      expect(frameworkIds).toContain("codeceptjs");
      expect(frameworkIds).toContain("newman");
      expect(frameworkIds).toContain("wdio");
    });

    it("should have unique ids", () => {
      const ids = FRAMEWORK_REGISTRY.map((framework) => framework.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it("should have unique adapter packages", () => {
      const adapters = FRAMEWORK_REGISTRY.map((framework) => framework.adapterPackage);
      const uniqueAdapters = new Set(adapters);

      expect(uniqueAdapters.size).toBe(adapters.length);
    });
  });

  describe("findFrameworkByPackageName", () => {
    it("should find vitest by package name", () => {
      const result = findFrameworkByPackageName("vitest");

      expect(result).toBeDefined();
      expect(result?.id).toBe("vitest");
      expect(result?.adapterPackage).toBe("allure-vitest");
    });

    it("should find playwright by package name", () => {
      const result = findFrameworkByPackageName("@playwright/test");

      expect(result).toBeDefined();
      expect(result?.id).toBe("playwright");
    });

    it("should find newman by package name", () => {
      const result = findFrameworkByPackageName("newman");

      expect(result).toBeDefined();
      expect(result?.id).toBe("newman");
      expect(result?.adapterPackage).toBe("newman-reporter-allure");
    });

    it("should return undefined for unknown package", () => {
      const result = findFrameworkByPackageName("unknown-framework");

      expect(result).toBeUndefined();
    });
  });
});
