import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  checkAdapterCompat,
  checkAllureCliGeneration,
  checkAllureJsVersionAlignment,
  checkFrameworkCaveats,
  checkPlaywrightFullName,
  checkPluginImports,
  checkConfigCombinations,
  checkTestPlanEnv,
  compareVersions,
  parseVersion,
} from "../src/doctor-checks.js";

describe("kit/doctor-checks", () => {
  let dir: string;

  const install = async (name: string, version: string) => {
    await mkdir(join(dir, "node_modules", name), { recursive: true });
    await writeFile(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, version }));
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "allure-kit-checks-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("parses and compares versions", () => {
    expect(parseVersion("^3.9.0")).toEqual([3, 9, 0]);
    expect(parseVersion("latest")).toBeNull();
    expect(compareVersions("3.10.0", "3.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.60.0", "1.60.0")).toBe(0);
    expect(compareVersions("x", "1.0.0")).toBeNull();
  });

  describe("checkAdapterCompat", () => {
    it("flags allure-playwright < 3.9.0 with Playwright >= 1.60", async () => {
      await install("@playwright/test", "1.60.1");
      await install("allure-playwright", "3.4.5");

      const findings = await checkAdapterCompat(dir);

      expect(findings).toHaveLength(1);
      expect(findings[0].level).toBe("error");
      expect(findings[0].message).toContain("allure-playwright@3.4.5");
    });

    it("passes with a fixed adapter or an older Playwright", async () => {
      await install("@playwright/test", "1.60.1");
      await install("allure-playwright", "3.10.0");
      expect(await checkAdapterCompat(dir)).toEqual([]);

      await install("@playwright/test", "1.56.0");
      await install("allure-playwright", "3.4.5");
      expect(await checkAdapterCompat(dir)).toEqual([]);
    });

    it("ignores projects without the packages", async () => {
      expect(await checkAdapterCompat(dir)).toEqual([]);
    });
  });

  describe("checkAllureJsVersionAlignment", () => {
    it("warns when an adapter and allure-js-commons differ in minor version", async () => {
      await install("allure-js-commons", "3.12.0");
      await install("allure-vitest", "3.4.3");

      const findings = await checkAllureJsVersionAlignment(dir);

      expect(findings).toHaveLength(1);
      expect(findings[0].level).toBe("warning");
    });

    it("accepts patch differences", async () => {
      await install("allure-js-commons", "3.4.5");
      await install("allure-vitest", "3.4.3");

      expect(await checkAllureJsVersionAlignment(dir)).toEqual([]);
    });
  });

  describe("checkConfigCombinations", () => {
    it("warns about qualityGate with historyPath in JSON and ESM configs", () => {
      const json = JSON.stringify({ historyPath: "./history.jsonl", qualityGate: { rules: [] } });
      const mjs = `export default defineConfig({ historyPath: "./h.jsonl", qualityGate: { rules: [] } })`;

      for (const source of [json, mjs]) {
        const findings = checkConfigCombinations(source);

        expect(findings.some((f) => f.level === "warning" && f.message.includes("qualityGate"))).toBe(true);
      }
    });

    it("only gives the history hint when no quality gate is configured", () => {
      const findings = checkConfigCombinations(JSON.stringify({ historyPath: "./h.jsonl" }));

      expect(findings.map((f) => f.level)).toEqual(["info"]);
    });

    it("stays quiet without historyPath, even for a lookalike key", () => {
      expect(checkConfigCombinations(JSON.stringify({ qualityGate: {}, myhistoryPath: 1 }))).toEqual([]);
    });
  });

  describe("checkTestPlanEnv", () => {
    it("is silent when the variable is unset or the plan is valid", async () => {
      expect(await checkTestPlanEnv({}, dir)).toEqual([]);

      await writeFile(join(dir, "plan.json"), JSON.stringify({ version: "1.0", tests: [] }));
      expect(await checkTestPlanEnv({ ALLURE_TESTPLAN_PATH: "plan.json" }, dir)).toEqual([]);
    });

    it("warns about a missing or invalid file", async () => {
      expect((await checkTestPlanEnv({ ALLURE_TESTPLAN_PATH: "nope.json" }, dir))[0].message).toContain("missing");

      await writeFile(join(dir, "bad.json"), "{not json");
      expect((await checkTestPlanEnv({ ALLURE_TESTPLAN_PATH: "bad.json" }, dir))[0].message).toContain("not valid JSON");
    });
  });

  describe("checkAllureCliGeneration", () => {
    it("errors on allure < 3 and warns about allure-commandline", async () => {
      await install("allure", "2.30.0");
      await install("allure-commandline", "2.30.0");

      const findings = await checkAllureCliGeneration(dir);

      expect(findings.map((f) => f.level)).toEqual(["error", "warning"]);
    });

    it("accepts a plain Allure 3 install", async () => {
      await install("allure", "3.19.0");

      expect(await checkAllureCliGeneration(dir)).toEqual([]);
    });
  });

  describe("checkFrameworkCaveats", () => {
    it("reports known adapter limitations as info", () => {
      const findings = checkFrameworkCaveats(["newman", "jest", "playwright"]);

      expect(findings.every((f) => f.level === "info")).toBe(true);
      expect(findings.map((f) => f.message.split(":")[0])).toEqual(["newman", "newman", "jest"]);
    });
  });

  describe("checkPluginImports", () => {
    it("errors on a relative plugin import that doesn't exist and ignores package names", async () => {
      await writeFile(join(dir, "my-plugin.js"), "");

      const findings = checkPluginImports(
        { plugins: { mine: { import: "./my-plugin.js" }, gone: { import: "./nope.js" }, pkg: { import: "@scope/plugin" }, awesome: {} } },
        dir,
      );

      expect(findings).toHaveLength(1);
      expect(findings[0].message).toContain('Plugin "gone" imports ./nope.js');
    });
  });

  describe("checkPlaywrightFullName", () => {
    const wired = `reporter: [["allure-playwright"]]`;
    const testops = JSON.stringify({ plugins: { testops: {} } });

    it("hints about useLegacyFullName only for TestOps users with the default fullName", () => {
      expect(checkPlaywrightFullName(wired, testops)).toHaveLength(1);
      expect(checkPlaywrightFullName(wired, JSON.stringify({ plugins: { awesome: {} } }))).toEqual([]);
      expect(checkPlaywrightFullName(wired, null)).toEqual([]);
    });

    it("is quiet once useLegacyFullName is set or the reporter isn't wired", () => {
      expect(checkPlaywrightFullName(`reporter: [["allure-playwright", { useLegacyFullName: true }]]`, testops)).toEqual([]);
      expect(checkPlaywrightFullName(`reporter: "html"`, testops)).toEqual([]);
    });
  });
});
