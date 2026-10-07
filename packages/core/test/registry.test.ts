import { describe, expect, it } from "vitest";

import { findReportPluginById, getDefaultReportPlugins, REPORT_PLUGIN_REGISTRY, resolveReportSubdir } from "../src/registry.js";

describe("kit/registry", () => {
  describe("REPORT_PLUGIN_REGISTRY", () => {
    it("should contain all expected plugins", () => {
      const pluginIds = REPORT_PLUGIN_REGISTRY.map((plugin) => plugin.id);

      expect(pluginIds).toContain("awesome");
      expect(pluginIds).toContain("classic");
      expect(pluginIds).toContain("dashboard");
      expect(pluginIds).toContain("csv");
      expect(pluginIds).toContain("log");
      expect(pluginIds).toContain("slack");
      expect(pluginIds).toContain("jira");
      expect(pluginIds).toContain("testops");
      expect(pluginIds).toContain("allure2");
      expect(pluginIds).toContain("testplan");
      expect(pluginIds).toContain("progress");
    });

    it("should have unique ids", () => {
      const ids = REPORT_PLUGIN_REGISTRY.map((plugin) => plugin.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it("should have at least one default plugin", () => {
      const defaults = REPORT_PLUGIN_REGISTRY.filter((plugin) => plugin.isDefault);

      expect(defaults.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("findReportPluginById", () => {
    it("should find awesome plugin by id", () => {
      const result = findReportPluginById("awesome");

      expect(result).toBeDefined();
      expect(result?.packageName).toBe("@allurereport/plugin-awesome");
    });

    it("should return undefined for unknown plugin", () => {
      const result = findReportPluginById("nonexistent");

      expect(result).toBeUndefined();
    });
  });

  describe("getDefaultReportPlugins", () => {
    it("should return awesome as a default plugin", () => {
      const defaults = getDefaultReportPlugins();
      const defaultIds = defaults.map((plugin) => plugin.id);

      expect(defaultIds).toContain("awesome");
    });
  });

  it("documents how the TestOps plugin reads its settings (ALLURE_* variables) and that it only runs in CI", () => {
    const testops = REPORT_PLUGIN_REGISTRY.find((plugin) => plugin.id === "testops")!;
    const envVars = Object.fromEntries((testops.options ?? []).map((option) => [option.name, option.envVar]));

    expect(envVars).toEqual({
      endpoint: "ALLURE_ENDPOINT",
      accessToken: "ALLURE_TOKEN",
      projectId: "ALLURE_PROJECT_ID",
      launchName: "ALLURE_LAUNCH_NAME",
    });
    expect(testops.note).toContain("ALLURE_TESTOPS_ENABLED");
  });

  it("knows where the HTML report lands for plugin combinations (verified with allure 3.20.1)", () => {
    expect(resolveReportSubdir(["awesome"])).toBe("");
    expect(resolveReportSubdir(["awesome", "log"])).toBe("");
    expect(resolveReportSubdir(["awesome", "csv"])).toBe("awesome");
    expect(resolveReportSubdir(["csv", "classic"])).toBe("classic");
    expect(resolveReportSubdir(["awesome", "classic", "csv"])).toBe("");
    expect(resolveReportSubdir(["csv"])).toBe("");
  });
});
