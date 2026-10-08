import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  checkAdapterCompat,
  checkAllureActionPermissions,
  checkAllureCliGeneration,
  checkAllureJsVersionAlignment,
  checkFrameworkCaveats,
  checkPlaywrightFullName,
  checkPluginImports,
  checkReportLayout,
  checkTestOpsPlugin,
  checkResultsDirAgreement,
  checkUnsupportedConfigFields,
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

    it("flags allure-vitest >= 3.13 on vitest < 3 (silently writes no results)", async () => {
      await install("vitest", "2.1.9");
      await install("allure-vitest", "3.13.0");

      const findings = await checkAdapterCompat(dir);

      expect(findings).toHaveLength(1);
      expect(findings[0].level).toBe("error");
      expect(findings[0].message).toContain("writes no allure-results");

      await install("vitest", "3.2.7");
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

  describe("checkAllureActionPermissions", () => {
    const workflow = (extra: string, withBlock = "          github-token: ${{ secrets.GITHUB_TOKEN }}\n") =>
      `name: ci\non: pull_request\n${extra}jobs:\n  report:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: allure-framework/allure-action@v0\n        with:\n${withBlock}`;
    const check = (content: string) => checkAllureActionPermissions([{ file: ".github/workflows/ci.yml", content }]);

    it("warns when the workflow has no permissions for comments and checks", () => {
      const findings = check(workflow(""));

      expect(findings).toHaveLength(1);
      expect(findings[0].message).toContain("pull-requests: write and checks: write");
    });

    it("names only the missing scope", () => {
      expect(check(workflow("permissions:\n  pull-requests: write\n"))[0].message).toContain("needs checks: write");
    });

    it("accepts workflow-level, job-level and write-all permissions", () => {
      expect(check(workflow("permissions:\n  pull-requests: write\n  checks: write\n"))).toEqual([]);
      expect(check(workflow("permissions: write-all\n"))).toEqual([]);
      expect(check(workflow("").replace("    runs-on", "    permissions:\n      pull-requests: write\n      checks: write\n    runs-on"))).toEqual([]);
    });

    it("warns about a missing github-token input and ignores workflows without the action", () => {
      expect(check(workflow("permissions: write-all\n", "          report-directory: ./allure-report\n"))[0].message).toContain("no github-token");
      expect(check("name: x\non: push\njobs:\n  a:\n    steps:\n      - run: echo\n")).toEqual([]);
      expect(check("{ not: yaml: [")).toEqual([]);
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

  describe("checkTestOpsPlugin", () => {
    const config = JSON.stringify({ plugins: { testops: { options: {} } } });

    it("explains that the plugin is silent outside CI", () => {
      const findings = checkTestOpsPlugin(config, {});

      expect(findings).toHaveLength(1);
      expect(findings[0].level).toBe("info");
      expect(findings[0].hint).toContain("ALLURE_TESTOPS_ENABLED");
    });

    it("is quiet in CI, when forced on, with a job run id, or without the plugin", () => {
      expect(checkTestOpsPlugin(config, { CI: "true" })).toEqual([]);
      expect(checkTestOpsPlugin(config, { ALLURE_TESTOPS_ENABLED: "true" })).toEqual([]);
      expect(checkTestOpsPlugin(config, { ALLURE_JOB_RUN_ID: "12" })).toEqual([]);
      expect(checkTestOpsPlugin(JSON.stringify({ plugins: { awesome: {} } }), {})).toEqual([]);
      expect(checkTestOpsPlugin(null, {})).toEqual([]);
    });
  });

  describe("checkReportLayout", () => {
    it("tells where the report went when csv moves it into a subfolder", () => {
      const findings = checkReportLayout(["awesome", "csv"], "./allure-report");

      expect(findings).toHaveLength(1);
      expect(findings[0].message).toContain("./allure-report/awesome/");
    });

    it("is quiet when the report stays in the output root", () => {
      expect(checkReportLayout(["awesome"], undefined)).toEqual([]);
      expect(checkReportLayout(["awesome", "classic", "csv"], undefined)).toEqual([]);
    });
  });

  describe("checkUnsupportedConfigFields", () => {
    it("errors on fields Allure rejects, e.g. the knownIssuesPath older allure-kit versions could write", () => {
      const findings = checkUnsupportedConfigFields({ name: "R", knownIssuesPath: "./known.json", plugins: {}, bogus: 1 });

      expect(findings).toHaveLength(1);
      expect(findings[0].level).toBe("error");
      expect(findings[0].message).toContain("knownIssuesPath, bogus");
    });

    it("accepts every field allure-kit itself writes", () => {
      expect(
        checkUnsupportedConfigFields({ name: "R", output: "./o", plugins: {}, historyPath: "h", appendHistory: true, historyLimit: 3, flakyDetection: {}, resultsDir: "r", environment: "e", port: "1" }),
      ).toEqual([]);
    });
  });

  describe("checkResultsDirAgreement", () => {
    const jest = (dir: string) => ({ framework: "jest", source: `module.exports = { testEnvironmentOptions: { resultsDir: "${dir}" } };` });

    it("warns when the adapter writes somewhere allure doesn't read", () => {
      const findings = checkResultsDirAgreement([jest("build/allure")], { name: "R" });

      expect(findings).toHaveLength(1);
      expect(findings[0].message).toContain("jest writes results to build/allure, but allure reads allure-results");
      expect(findings[0].hint).toContain("allure generate build/allure");
    });

    it("accepts the default directory, a matching resultsDir (string or list) and a glob", () => {
      expect(checkResultsDirAgreement([jest("./allure-results")], null)).toEqual([]);
      expect(checkResultsDirAgreement([jest("build/allure")], { resultsDir: "./build/allure/" })).toEqual([]);
      expect(checkResultsDirAgreement([jest("build/allure")], { resultsDir: ["x", "build/allure"] })).toEqual([]);
      expect(checkResultsDirAgreement([jest("build/allure")], { resultsDir: "**/allure-results" })).toEqual([]);
    });

    it("reads the WebdriverIO reporter's outputDir but ignores unrelated outputDir keys and env-based values", () => {
      const wdio = { framework: "wdio", source: `reporters: ["spec", ["allure", { outputDir: "reports/allure" }]]` };
      const playwright = { framework: "playwright", source: `export default defineConfig({ outputDir: "test-results" });` };
      const dynamic = { framework: "mocha", source: "reporterOptions: { resultsDir: `${process.env.OUT}` }" };

      expect(checkResultsDirAgreement([wdio, playwright, dynamic], null).map((f) => f.message.split(" ")[0])).toEqual(["wdio"]);
    });
  });
});
