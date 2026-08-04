import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

  it("returns unsupported for frameworks without a patcher", async () => {
    await writeFile(join(tempDir, "cypress.config.ts"), "export default defineConfig({})");

    const outcome = await patchFrameworkConfig(tempDir, findFramework("cypress"));

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

    it("returns unrecognized-shape when there's no reporters array and the export isn't a plain object", async () => {
      const configPath = join(tempDir, "wdio.conf.ts");

      await writeFile(configPath, `export const config = {\n  runner: "local",\n};\n`);

      const outcome = await patchFrameworkConfig(tempDir, findFramework("wdio"));

      expect(outcome.status).toBe("unrecognized-shape");
    });
  });
});
