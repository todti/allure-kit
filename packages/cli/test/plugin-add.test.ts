import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Cli } from "clipanion";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const promptsMock = vi.fn();
const executeCommandMock = vi.fn();

vi.mock("prompts", () => ({
  default: (...args: unknown[]) => promptsMock(...args),
}));

vi.mock("@todti/allure-kit-core", async () => {
  const actual = await vi.importActual<typeof import("@todti/allure-kit-core")>("@todti/allure-kit-core");

  return {
    ...actual,
    executeCommand: (...args: unknown[]) => executeCommandMock(...args),
  };
});

const { readAllureConfig } = await import("@todti/allure-kit-core");
const { KitPluginAddCommand } = await import("../src/commands/pluginAdd.js");

const runCommand = async (args: string[]) => {
  const cli = new Cli();

  cli.register(KitPluginAddCommand);

  await cli.run(args);
};

describe("kit/plugin add", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "allure-plugin-add-test-"));
    promptsMock.mockReset();
    executeCommandMock.mockReset();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("asks for confirmation and leaves config untouched when overwrite is declined", async () => {
    await writeFile(
      join(tempDir, "allurerc.json"),
      JSON.stringify({ name: "Test", plugins: { csv: { options: { fileName: "results.csv" } } } }),
    );

    promptsMock.mockResolvedValueOnce({ shouldOverwrite: false });

    await runCommand(["plugin", "add", "csv", "--cwd", tempDir]);

    expect(promptsMock).toHaveBeenCalledTimes(1);
    expect(executeCommandMock).not.toHaveBeenCalled();

    const config = await readAllureConfig(tempDir);

    expect(config?.plugins?.csv?.options).toEqual({ fileName: "results.csv" });
  });

  it("does not prompt for confirmation when the plugin is not yet configured", async () => {
    await writeFile(join(tempDir, "allurerc.json"), JSON.stringify({ name: "Test", plugins: {} }));

    executeCommandMock.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
    promptsMock.mockResolvedValueOnce({ value: "custom.csv" }).mockResolvedValueOnce({ value: "," }).mockResolvedValueOnce({ value: false });

    await runCommand(["plugin", "add", "csv", "--cwd", tempDir]);

    const overwritePromptCalled = promptsMock.mock.calls.some(
      (call) => (call[0] as { message?: string })?.message?.includes("already configured"),
    );

    expect(overwritePromptCalled).toBe(false);
    expect(executeCommandMock).toHaveBeenCalledTimes(1);

    const config = await readAllureConfig(tempDir);

    expect(config?.plugins?.csv).toBeDefined();
  });
});
