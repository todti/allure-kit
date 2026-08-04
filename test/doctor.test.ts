import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KitDoctorCommand } from "../src/commands/doctor.js";

const captureOutput = async (command: KitDoctorCommand): Promise<string[]> => {
  const chunks: string[] = [];
  const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));

    return true;
  });

  await command.execute();
  writeSpy.mockRestore();

  return chunks;
};

describe("kit/doctor", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "allure-kit-doctor-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
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

  it("flags a framework whose adapter is installed but not wired into its config", async () => {
    await setUpPlaywrightProject(`export default defineConfig({\n  testDir: "./tests",\n});\n`);

    const command = new KitDoctorCommand();
    command.cwd = tempDir;

    const chunks = await captureOutput(command);
    const output = chunks.join("");

    expect(output).toContain("isn't wired into its config");
    expect(output).toContain("Found 1 issue");
  });

  it("reports no issues when the reporter is wired into the config", async () => {
    await setUpPlaywrightProject(`export default defineConfig({\n  reporter: [["allure-playwright"]],\n});\n`);

    const command = new KitDoctorCommand();
    command.cwd = tempDir;

    const chunks = await captureOutput(command);
    const output = chunks.join("");

    expect(output).toContain("reporter is wired into its config");
    expect(output).toContain("No issues found");
  });
});
