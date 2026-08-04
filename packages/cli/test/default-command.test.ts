import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logMock = vi.fn();

vi.mock("node:console", () => ({ log: (...args: unknown[]) => logMock(...args) }));

const { KitDefaultCommand } = await import("../src/commands/defaultCommand.js");

describe("kit/default command", () => {
  it("should print usage and every registered command", async () => {
    logMock.mockClear();

    const command = new KitDefaultCommand();
    await command.execute();

    const output = logMock.mock.calls.map((call) => call.join(" ")).join("\n");

    expect(output).toContain("allure-kit");
    expect(output).toContain("Usage:");
    expect(output).toContain("init");
    expect(output).toContain("gh-pages init");
    expect(output).toContain("plugin add");
    expect(output).toContain("plugin edit");
    expect(output).toContain("plugin remove");
    expect(output).toContain("plugin list");
    expect(output).toContain("update");
    expect(output).toContain("doctor");
  });

  describe("Allure version banner", () => {
    let tempDir: string;
    let originalCwd: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), "allure-kit-default-test-"));
      originalCwd = process.cwd();
      process.chdir(tempDir);
      logMock.mockClear();
    });

    afterEach(async () => {
      process.chdir(originalCwd);
      await rm(tempDir, { recursive: true, force: true });
    });

    it("reports Allure as not installed when node_modules/allure is absent", async () => {
      await new KitDefaultCommand().execute();

      const output = logMock.mock.calls.map((call) => call.join(" ")).join("\n");

      expect(output).toContain("not installed in this project");
    });

    it("shows the installed Allure version when node_modules/allure exists", async () => {
      const allureDir = join(tempDir, "node_modules", "allure");

      await mkdir(allureDir, { recursive: true });
      await writeFile(join(allureDir, "package.json"), JSON.stringify({ name: "allure", version: "3.14.3" }));

      await new KitDefaultCommand().execute();

      const output = logMock.mock.calls.map((call) => call.join(" ")).join("\n");

      expect(output).toContain("Allure: v3.14.3");
    });
  });
});
