import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Cli } from "clipanion";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readAllureConfig } from "@todti/allure-kit-core";

const promptsMock = vi.fn();

vi.mock("prompts", () => ({
  default: (...args: unknown[]) => promptsMock(...args),
}));

const { KitPluginEditCommand } = await import("../src/commands/pluginEdit.js");

const runCommand = async (args: string[]) => {
  const cli = new Cli();

  cli.register(KitPluginEditCommand);

  await cli.run(args);
};

describe("kit/plugin edit", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "allure-plugin-edit-test-"));
    promptsMock.mockReset();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("updates options of an already configured plugin", async () => {
    await writeFile(
      join(tempDir, "allurerc.json"),
      JSON.stringify({
        name: "Test",
        plugins: { csv: { options: { fileName: "results.csv", separator: "," } } },
      }),
    );

    promptsMock
      .mockResolvedValueOnce({ value: "export.csv" })
      .mockResolvedValueOnce({ value: ";" })
      .mockResolvedValueOnce({ value: true });

    await runCommand(["plugin", "edit", "csv", "--cwd", tempDir]);

    const config = await readAllureConfig(tempDir);

    expect(config?.plugins?.csv?.options).toEqual({
      fileName: "export.csv",
      separator: ";",
      disableHeaders: true,
    });
  });

  it("leaves the config untouched when the plugin is not configured yet", async () => {
    await writeFile(join(tempDir, "allurerc.json"), JSON.stringify({ name: "Test", plugins: {} }));

    await runCommand(["plugin", "edit", "slack", "--cwd", tempDir]);

    expect(promptsMock).not.toHaveBeenCalled();

    const config = await readAllureConfig(tempDir);

    expect(config?.plugins?.slack).toBeUndefined();
  });

  it("does nothing when no config file exists", async () => {
    await runCommand(["plugin", "edit", "csv", "--cwd", tempDir]);

    expect(promptsMock).not.toHaveBeenCalled();
  });
});
