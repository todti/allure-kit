import { describe, expect, it } from "vitest";

import { buildAllureConfig, PRESET_CONFIGS } from "../src/templates/allurerc.js";

describe("kit/templates/allurerc", () => {
  describe("buildAllureConfig", () => {
    it("should build a config with the given report name and default output dir", () => {
      const config = buildAllureConfig("My Report", ["awesome"]);

      expect(config.name).toBe("My Report");
      expect(config.output).toBe("./allure-report");
    });

    it("should build an empty-options plugin entry per plugin id", () => {
      const config = buildAllureConfig("Allure Report", ["awesome", "dashboard"]);

      expect(config.plugins).toEqual({
        awesome: { options: {} },
        dashboard: { options: {} },
      });
    });

    it("should produce an empty plugins object for an empty list", () => {
      const config = buildAllureConfig("Allure Report", []);

      expect(config.plugins).toEqual({});
    });
  });

  describe("PRESET_CONFIGS", () => {
    it("should define minimal, full, and ci presets", () => {
      expect(Object.keys(PRESET_CONFIGS).sort()).toEqual(["ci", "full", "minimal"]);
    });

    it("should have the awesome plugin in the minimal preset", () => {
      expect(PRESET_CONFIGS.minimal.pluginIds).toEqual(["awesome"]);
    });

    it("should have log, dashboard, and slack in the ci preset", () => {
      expect(PRESET_CONFIGS.ci.pluginIds).toEqual(["log", "dashboard", "slack"]);
    });
  });
});
