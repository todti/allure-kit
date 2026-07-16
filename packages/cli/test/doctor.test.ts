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
});
