import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logMock = vi.fn();

vi.mock("node:console", () => ({ log: (...args: unknown[]) => logMock(...args) }));

const { KitDoctorCommand } = await import("../src/commands/doctor.js");

const output = () => logMock.mock.calls.map((call) => call.join(" ")).join("\n");

describe("kit/doctor", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "allure-kit-doctor-test-"));
    logMock.mockReset();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const run = async () => {
    const command = new KitDoctorCommand();
    command.cwd = tempDir;
    await command.execute();
  };

  it("should report missing config and missing allure CLI on an empty project", async () => {
    await run();

    expect(output()).toContain("No allurerc config file found");
    expect(output()).toContain("allure CLI package is not installed");
    expect(output()).toContain("Found 2 issue(s)");
  });

  it("should report no issues for a fully configured project", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ devDependencies: { vitest: "^2.0.0" } }));
    await writeFile(
      join(tempDir, "allurerc.json"),
      JSON.stringify({ name: "Allure Report", plugins: { awesome: { options: {} } } }),
    );
    await mkdir(join(tempDir, "node_modules", "allure-vitest"), { recursive: true });
    await mkdir(join(tempDir, "node_modules", "allure"), { recursive: true });
    await mkdir(join(tempDir, "node_modules", "@allurereport", "plugin-awesome"), { recursive: true });

    await run();

    expect(output()).toContain("No issues found. Your Allure setup looks good!");
  });

  it("should flag a detected framework whose adapter is not installed", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ devDependencies: { vitest: "^2.0.0" } }));
    await writeFile(join(tempDir, "allurerc.json"), JSON.stringify({ name: "Allure Report", plugins: {} }));
    await mkdir(join(tempDir, "node_modules", "allure"), { recursive: true });

    await run();

    expect(output()).toContain("Vitest detected but allure-vitest is not installed");
  });

  it("should flag an installed adapter with no matching detected framework", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ devDependencies: { "allure-jest": "^2.0.0" } }));

    await run();

    expect(output()).toContain("allure-jest is installed but jest was not found in dependencies");
  });

  it("should warn (not error) about an unconfigured/unclear plugin count", async () => {
    await writeFile(join(tempDir, "allurerc.json"), JSON.stringify({ name: "Allure Report", plugins: {} }));

    await run();

    expect(output()).toContain("No plugins configured (the 'awesome' plugin will be used by default)");
  });

  const setUpPlaywrightProject = async (configText: string) => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "demo", devDependencies: { "@playwright/test": "^1.40.0" } }),
    );
    await writeFile(join(tempDir, "playwright.config.ts"), configText);
    await writeFile(join(tempDir, "allurerc.json"), JSON.stringify({ name: "Allure Report", plugins: {} }));
    await mkdir(join(tempDir, "node_modules", "allure-playwright"), { recursive: true });
    await mkdir(join(tempDir, "node_modules", "allure"), { recursive: true });
  };

  it("should flag a framework whose adapter is installed but not wired into its config", async () => {
    await setUpPlaywrightProject(`export default defineConfig({\n  testDir: "./tests",\n});\n`);

    await run();

    expect(output()).toContain("isn't wired into its config");
    expect(output()).toContain("Found 1 issue");
  });

  it("should report no issues when the reporter is wired into the config", async () => {
    await setUpPlaywrightProject(`export default defineConfig({\n  reporter: [["allure-playwright"]],\n});\n`);

    await run();

    expect(output()).toContain("reporter is wired into its config");
    expect(output()).toContain("No issues found");
  });

  it("should count an outdated Playwright adapter as an issue", async () => {
    await setUpPlaywrightProject(`export default defineConfig({\n  reporter: [["allure-playwright"]],\n});\n`);
    for (const [name, version] of [
      ["@playwright/test", "1.60.0"],
      ["allure-playwright", "3.4.5"],
    ]) {
      await mkdir(join(tempDir, "node_modules", name), { recursive: true });
      await writeFile(join(tempDir, "node_modules", name, "package.json"), JSON.stringify({ name, version }));
    }

    await run();

    expect(output()).toContain("allure-playwright@3.4.5 is too old for @playwright/test@1.60.0");
    expect(output()).toContain("Found 1 issue");
  });

  describe("--json / --strict", () => {
    const runJson = async (strict = false) => {
      let out = "";
      const command = new KitDoctorCommand();

      command.cwd = tempDir;
      command.json = true;
      command.strict = strict;
      command.context = { stdout: { write: (chunk: string) => ((out += chunk), true) } } as never;

      const code = await command.execute();

      return { code, result: JSON.parse(out) };
    };

    it("prints only JSON with every check, its step and hint", async () => {
      const { code, result } = await runJson();

      expect(logMock).not.toHaveBeenCalled();
      expect(code).toBe(0);
      expect(result.ok).toBe(false);
      expect(result.issues).toBe(2);
      expect(result.checks).toContainEqual({
        step: "Checking config file",
        level: "error",
        message: "No allurerc config file found",
        hint: "Run 'allure-kit init' to create one",
      });
    });

    it("exits with 1 under --strict when issues are found", async () => {
      expect((await runJson(true)).code).toBe(1);
    });
  });

  describe("python projects", () => {
    const setUpPython = async (requirements: string) => {
      await writeFile(join(tempDir, "requirements.txt"), requirements);
      await writeFile(join(tempDir, "allurerc.json"), JSON.stringify({ name: "Allure Report", plugins: {} }));
    };

    it("should accept a pytest project that declares allure-pytest", async () => {
      await setUpPython("pytest==8.0.0\nallure_pytest==2.13.5\n");

      await run();

      expect(output()).toContain("allure-pytest is declared in your dependencies");
      expect(output()).toContain("Node.js-based Allure CLI");
      expect(output()).toContain("No issues found");
    });

    it("should flag a detected framework whose adapter isn't declared", async () => {
      await setUpPython("pytest==8.0.0\n");

      await run();

      expect(output()).toContain("pytest detected but allure-pytest is not in your dependencies");
      expect(output()).toContain("Found 1 issue");
    });

    it("should warn about a declared adapter whose framework is gone", async () => {
      await setUpPython("allure-behave==2.13.5\nrequests\n");

      await run();

      expect(output()).toContain("allure-behave is declared but behave was not found");
    });
  });
});
