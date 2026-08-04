import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { patchFrameworkConfig } from "../src/commands/utils/config-patchers.js";
import { FRAMEWORK_REGISTRY } from "../src/commands/utils/registry.js";

const findFramework = (id: string) => {
  const framework = FRAMEWORK_REGISTRY.find((f) => f.id === id);

  if (!framework) {
    throw new Error(`Unknown framework id ${id}`);
  }

  return framework;
};

describe("kit/config-patchers", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "allure-kit-patch-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns no-config-file when the framework's config doesn't exist", async () => {
    const outcome = await patchFrameworkConfig(tempDir, findFramework("playwright"));

    expect(outcome.status).toBe("no-config-file");
  });

  it("returns unsupported for frameworks without a patcher (e.g. Newman, no config file at all)", async () => {
    const outcome = await patchFrameworkConfig(tempDir, findFramework("newman"));

    expect(outcome.status).toBe("unsupported");
  });

  describe("playwright", () => {
    it("adds allure-playwright to an existing reporter array", async () => {
      const configPath = join(tempDir, "playwright.config.ts");

      await writeFile(configPath, `export default defineConfig({\n  reporter: ["html"],\n});\n`);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("playwright"));

      expect(outcome.status).toBe("patched");

      const text = await readFile(configPath, "utf-8");

      expect(text).toContain('reporter: [["allure-playwright"], "html"]');
    });

    it("inserts a reporter property when none exists", async () => {
      const configPath = join(tempDir, "playwright.config.ts");

      await writeFile(configPath, `export default defineConfig({\n  testDir: "./tests",\n});\n`);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("playwright"));

      expect(outcome.status).toBe("patched");

      const text = await readFile(configPath, "utf-8");

      expect(text).toContain('reporter: [["allure-playwright"]],');
      expect(text).toContain('testDir: "./tests"');
    });

    it("returns unrecognized-shape when reporter is a non-array value, without duplicating the key", async () => {
      const configPath = join(tempDir, "playwright.config.ts");
      const original = `export default defineConfig({\n  reporter: 'html',\n});\n`;

      await writeFile(configPath, original);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("playwright"));

      expect(outcome.status).toBe("unrecognized-shape");
      expect(await readFile(configPath, "utf-8")).toBe(original);
    });

    it("skips when allure-playwright is already configured", async () => {
      const configPath = join(tempDir, "playwright.config.ts");
      const original = `export default defineConfig({\n  reporter: [["allure-playwright"]],\n});\n`;

      await writeFile(configPath, original);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("playwright"));

      expect(outcome.status).toBe("already-configured");
      expect(await readFile(configPath, "utf-8")).toBe(original);
    });
  });

  describe("vitest", () => {
    it("adds reporters and setupFiles to an existing test block", async () => {
      const configPath = join(tempDir, "vitest.config.ts");

      await writeFile(configPath, `export default defineConfig({\n  test: {\n    globals: true,\n  },\n});\n`);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("vitest"));

      expect(outcome.status).toBe("patched");

      const text = await readFile(configPath, "utf-8");

      expect(text).toContain('reporters: ["default", "allure-vitest/reporter"]');
      expect(text).toContain('setupFiles: ["allure-vitest/setup"]');
      expect(text).toContain("globals: true");
    });

    it("inserts a full test block when none exists", async () => {
      const configPath = join(tempDir, "vitest.config.ts");

      await writeFile(configPath, `export default defineConfig({});\n`);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("vitest"));

      expect(outcome.status).toBe("patched");

      const text = await readFile(configPath, "utf-8");

      expect(text).toContain('reporters: ["default", "allure-vitest/reporter"]');
      expect(text).toContain('setupFiles: ["allure-vitest/setup"]');
    });

    it("appends to existing reporters/setupFiles arrays without dropping entries", async () => {
      const configPath = join(tempDir, "vitest.config.ts");

      await writeFile(
        configPath,
        `export default defineConfig({\n  test: {\n    reporters: ["verbose"],\n    setupFiles: ["./setup.ts"],\n  },\n});\n`,
      );

      const outcome = await patchFrameworkConfig(tempDir, findFramework("vitest"));

      expect(outcome.status).toBe("patched");

      const text = await readFile(configPath, "utf-8");

      expect(text).toContain('reporters: ["allure-vitest/reporter", "verbose"]');
      expect(text).toContain('setupFiles: ["allure-vitest/setup", "./setup.ts"]');
    });

    it("returns unrecognized-shape when setupFiles exists but isn't an array", async () => {
      const configPath = join(tempDir, "vitest.config.ts");

      await writeFile(
        configPath,
        `export default defineConfig({\n  test: {\n    setupFiles: "./setup.ts",\n  },\n});\n`,
      );

      const outcome = await patchFrameworkConfig(tempDir, findFramework("vitest"));

      expect(outcome.status).toBe("unrecognized-shape");
    });
  });

  describe("jest", () => {
    it("sets testEnvironment in a JSON config", async () => {
      const configPath = join(tempDir, "jest.config.json");

      await writeFile(configPath, JSON.stringify({ verbose: true }, null, 2));

      const outcome = await patchFrameworkConfig(tempDir, findFramework("jest"));

      expect(outcome.status).toBe("patched");

      const json = JSON.parse(await readFile(configPath, "utf-8"));

      expect(json.testEnvironment).toBe("allure-jest/environment");
      expect(json.verbose).toBe(true);
    });

    it("inserts testEnvironment into a JS config", async () => {
      const configPath = join(tempDir, "jest.config.js");

      await writeFile(configPath, `module.exports = {\n  verbose: true,\n};\n`);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("jest"));

      expect(outcome.status).toBe("patched");

      const text = await readFile(configPath, "utf-8");

      expect(text).toContain('testEnvironment: "allure-jest/environment",');
    });

    it("doesn't overwrite an existing testEnvironment (JS)", async () => {
      const configPath = join(tempDir, "jest.config.js");
      const original = `module.exports = {\n  testEnvironment: "node",\n};\n`;

      await writeFile(configPath, original);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("jest"));

      expect(outcome.status).toBe("unrecognized-shape");
      expect(await readFile(configPath, "utf-8")).toBe(original);
    });

    it("doesn't overwrite an existing testEnvironment (JSON)", async () => {
      const configPath = join(tempDir, "jest.config.json");
      const original = JSON.stringify({ testEnvironment: "node" }, null, 2);

      await writeFile(configPath, original);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("jest"));

      expect(outcome.status).toBe("unrecognized-shape");
      expect(await readFile(configPath, "utf-8")).toBe(original);
    });

    it("reports already-configured only when our own marker is present", async () => {
      const configPath = join(tempDir, "jest.config.js");
      const original = `module.exports = {\n  testEnvironment: "allure-jest/environment",\n};\n`;

      await writeFile(configPath, original);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("jest"));

      expect(outcome.status).toBe("already-configured");
    });
  });

  describe("mocha", () => {
    it("sets reporter in a JSON .mocharc", async () => {
      const configPath = join(tempDir, ".mocharc.json");

      await writeFile(configPath, JSON.stringify({ spec: "test/**/*.spec.js" }, null, 2));

      const outcome = await patchFrameworkConfig(tempDir, findFramework("mocha"));

      expect(outcome.status).toBe("patched");

      const json = JSON.parse(await readFile(configPath, "utf-8"));

      expect(json.reporter).toBe("allure-mocha/reporter");
      expect(json.spec).toBe("test/**/*.spec.js");
    });

    it("sets reporter in a YAML .mocharc", async () => {
      const configPath = join(tempDir, ".mocharc.yml");

      await writeFile(configPath, "spec: test/**/*.spec.js\n");

      const outcome = await patchFrameworkConfig(tempDir, findFramework("mocha"));

      expect(outcome.status).toBe("patched");

      const text = await readFile(configPath, "utf-8");

      expect(text).toContain("reporter: allure-mocha/reporter");
      expect(text).toContain("spec: test/**/*.spec.js");
    });

    it("inserts reporter into a JS .mocharc", async () => {
      const configPath = join(tempDir, ".mocharc.js");

      await writeFile(configPath, `module.exports = {\n  spec: "test/**/*.spec.js",\n};\n`);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("mocha"));

      expect(outcome.status).toBe("patched");

      const text = await readFile(configPath, "utf-8");

      expect(text).toContain('reporter: "allure-mocha/reporter",');
    });

    it("doesn't overwrite an existing reporter", async () => {
      const configPath = join(tempDir, ".mocharc.json");
      const original = JSON.stringify({ reporter: "spec" }, null, 2);

      await writeFile(configPath, original);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("mocha"));

      expect(outcome.status).toBe("unrecognized-shape");
      expect(await readFile(configPath, "utf-8")).toBe(original);
    });
  });

  describe("wdio", () => {
    it("adds the allure reporter to an existing reporters array regardless of export style", async () => {
      const configPath = join(tempDir, "wdio.conf.ts");

      await writeFile(configPath, `export const config = {\n  reporters: ["spec"],\n};\n`);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("wdio"));

      expect(outcome.status).toBe("patched");

      const text = await readFile(configPath, "utf-8");

      expect(text).toContain('reporters: [["allure", { outputDir: "allure-results" }], "spec"]');
    });

    it("inserts a reporters property for the `export const config = {...}` shape too", async () => {
      const configPath = join(tempDir, "wdio.conf.ts");

      await writeFile(configPath, `export const config = {\n  runner: "local",\n};\n`);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("wdio"));

      expect(outcome.status).toBe("patched");

      const text = await readFile(configPath, "utf-8");

      expect(text).toContain('reporters: [["allure", { outputDir: "allure-results" }]],');
    });

    it("returns unrecognized-shape when the config is built dynamically (spread from another module)", async () => {
      const configPath = join(tempDir, "wdio.conf.ts");
      const original = `const base = require("./wdio.base.conf.js");\n\nexports.config = { ...base, runner: "local" };\n`;

      await writeFile(configPath, original);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("wdio"));

      expect(outcome.status).toBe("unrecognized-shape");
      expect(await readFile(configPath, "utf-8")).toBe(original);
    });
  });

  describe("cucumberjs", () => {
    it("adds format to an existing default profile array (JS)", async () => {
      const configPath = join(tempDir, "cucumber.js");

      await writeFile(
        configPath,
        `module.exports = {\n  default: {\n    format: ["json:reports/report.json"],\n  },\n};\n`,
      );

      const outcome = await patchFrameworkConfig(tempDir, findFramework("cucumberjs"));

      expect(outcome.status).toBe("patched");

      const text = await readFile(configPath, "utf-8");

      expect(text).toContain('format: ["allure-cucumberjs/reporter", "json:reports/report.json"]');
    });

    it("inserts a default profile when none exists (JS)", async () => {
      const configPath = join(tempDir, "cucumber.js");

      await writeFile(configPath, `module.exports = {};\n`);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("cucumberjs"));

      expect(outcome.status).toBe("patched");

      const text = await readFile(configPath, "utf-8");

      expect(text).toContain('default: { format: ["allure-cucumberjs/reporter"], },');
    });

    it("adds format to an existing default profile array (YAML)", async () => {
      const configPath = join(tempDir, "cucumber.yml");

      await writeFile(configPath, "default:\n  format:\n    - json:reports/report.json\n");

      const outcome = await patchFrameworkConfig(tempDir, findFramework("cucumberjs"));

      expect(outcome.status).toBe("patched");

      const text = await readFile(configPath, "utf-8");

      expect(text).toContain("allure-cucumberjs/reporter");
      expect(text).toContain("json:reports/report.json");
    });

    it("returns unrecognized-shape for an old-style CLI-flag string profile", async () => {
      const configPath = join(tempDir, "cucumber.yml");

      await writeFile(configPath, "default: --require features --format json:reports/report.json\n");

      const outcome = await patchFrameworkConfig(tempDir, findFramework("cucumberjs"));

      expect(outcome.status).toBe("unrecognized-shape");
    });
  });

  describe("codeceptjs", () => {
    it("adds the allure plugin to an existing plugins object", async () => {
      const configPath = join(tempDir, "codecept.conf.js");

      await writeFile(
        configPath,
        `module.exports.config = {\n  plugins: {\n    retryFailedStep: { enabled: true },\n  },\n};\n`,
      );

      const outcome = await patchFrameworkConfig(tempDir, findFramework("codeceptjs"));

      expect(outcome.status).toBe("patched");

      const text = await readFile(configPath, "utf-8");

      expect(text).toContain('allure: { enabled: true, require: "allure-codeceptjs" },');
      expect(text).toContain("retryFailedStep");
    });

    it("inserts a plugins object when none exists", async () => {
      const configPath = join(tempDir, "codecept.conf.js");

      await writeFile(configPath, `module.exports.config = {\n  tests: "./*_test.js",\n};\n`);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("codeceptjs"));

      expect(outcome.status).toBe("patched");

      const text = await readFile(configPath, "utf-8");

      expect(text).toContain('plugins: { allure: { enabled: true, require: "allure-codeceptjs" } },');
    });

    it("returns unrecognized-shape when an allure plugin entry already exists with a different value", async () => {
      const configPath = join(tempDir, "codecept.conf.js");
      const original = `module.exports.config = {\n  plugins: {\n    allure: { enabled: false },\n  },\n};\n`;

      await writeFile(configPath, original);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("codeceptjs"));

      expect(outcome.status).toBe("unrecognized-shape");
      expect(await readFile(configPath, "utf-8")).toBe(original);
    });
  });

  describe("cypress", () => {
    it("wires setupNodeEvents and the support file", async () => {
      await writeFile(
        join(tempDir, "cypress.config.ts"),
        `import { defineConfig } from "cypress";\n\nexport default defineConfig({\n  e2e: {\n    setupNodeEvents(on, config) {\n      return config;\n    },\n  },\n});\n`,
      );
      await mkdir(join(tempDir, "cypress", "support"), { recursive: true });
      await writeFile(join(tempDir, "cypress/support/e2e.ts"), `import "./commands";\n`);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("cypress"));

      expect(outcome.status).toBe("patched");

      const configText = await readFile(join(tempDir, "cypress.config.ts"), "utf-8");

      expect(configText).toContain('import { allureCypress } from "allure-cypress/reporter";');
      expect(configText).toContain("allureCypress(on, config);");

      const supportText = await readFile(join(tempDir, "cypress/support/e2e.ts"), "utf-8");

      expect(supportText).toContain('import "allure-cypress";');
    });

    it("patches the config but notes a missing support file", async () => {
      await writeFile(
        join(tempDir, "cypress.config.ts"),
        `export default defineConfig({\n  e2e: {\n    setupNodeEvents(on, config) {\n      return config;\n    },\n  },\n});\n`,
      );

      const outcome = await patchFrameworkConfig(tempDir, findFramework("cypress"));

      expect(outcome.status).toBe("patched");
      expect(outcome.note).toContain("support/e2e");
    });

    it("returns unrecognized-shape when setupNodeEvents isn't found", async () => {
      const configPath = join(tempDir, "cypress.config.ts");
      const original = `export default defineConfig({\n  e2e: {\n    baseUrl: "http://localhost:3000",\n  },\n});\n`;

      await writeFile(configPath, original);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("cypress"));

      expect(outcome.status).toBe("unrecognized-shape");
      expect(await readFile(configPath, "utf-8")).toBe(original);
    });
  });

  describe("jasmine", () => {
    it("creates a helper file matching the default helpers glob", async () => {
      const jasmineDir = join(tempDir, "spec", "support");

      await mkdir(jasmineDir, { recursive: true });
      await writeFile(
        join(jasmineDir, "jasmine.json"),
        JSON.stringify({ spec_dir: "spec", helpers: ["helpers/**/*.js"] }, null, 2),
      );

      const outcome = await patchFrameworkConfig(tempDir, findFramework("jasmine"));

      expect(outcome.status).toBe("patched");

      const helperText = await readFile(join(tempDir, "helpers", "allure.reporter.js"), "utf-8");

      expect(helperText).toContain('require("allure-jasmine")');
      expect(helperText).toContain("addReporter");
    });

    it("reports already-configured when the helper file exists with our marker", async () => {
      const jasmineDir = join(tempDir, "spec", "support");

      await mkdir(jasmineDir, { recursive: true });
      await writeFile(
        join(jasmineDir, "jasmine.json"),
        JSON.stringify({ helpers: ["helpers/**/*.js"] }, null, 2),
      );
      await mkdir(join(tempDir, "helpers"), { recursive: true });
      await writeFile(join(tempDir, "helpers", "allure.reporter.js"), 'require("allure-jasmine");\n');

      const outcome = await patchFrameworkConfig(tempDir, findFramework("jasmine"));

      expect(outcome.status).toBe("already-configured");
    });

    it("returns unrecognized-shape when the helpers glob shape isn't recognized", async () => {
      const jasmineDir = join(tempDir, "spec", "support");

      await mkdir(jasmineDir, { recursive: true });
      await writeFile(join(jasmineDir, "jasmine.json"), JSON.stringify({ helpers: ["helpers/*.js"] }, null, 2));

      const outcome = await patchFrameworkConfig(tempDir, findFramework("jasmine"));

      expect(outcome.status).toBe("unrecognized-shape");
    });
  });
});
