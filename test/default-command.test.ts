import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KitDefaultCommand } from "../src/commands/defaultCommand.js";

describe("kit/default-command", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "allure-kit-default-test-"));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reports Allure as not installed when node_modules/allure is absent", async () => {
    const chunks: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk));

      return true;
    });

    await new KitDefaultCommand().execute();
    writeSpy.mockRestore();

    expect(chunks.some((line) => line.includes("not installed in this project"))).toBe(true);
  });

  it("shows the installed Allure version when node_modules/allure exists", async () => {
    const allureDir = join(tempDir, "node_modules", "allure");

    await mkdir(allureDir, { recursive: true });
    await writeFile(join(allureDir, "package.json"), JSON.stringify({ name: "allure", version: "3.14.3" }));

    const chunks: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk));

      return true;
    });

    await new KitDefaultCommand().execute();
    writeSpy.mockRestore();

    expect(chunks.some((line) => line.includes("Allure: v3.14.3"))).toBe(true);
  });
});
