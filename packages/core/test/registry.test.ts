import { describe, expect, it } from "vitest";

import { findReportPluginById, getDefaultReportPlugins, REPORT_PLUGIN_REGISTRY } from "../src/registry.js";

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
});
