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
const { KitPluginRemoveCommand } = await import("../src/commands/pluginRemove.js");

const runCommand = async (args: string[]) => {
  const cli = new Cli();

  cli.register(KitPluginRemoveCommand);

  await cli.run(args);
};

describe("kit/plugin remove", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "allure-plugin-remove-test-"));
    promptsMock.mockReset();
    executeCommandMock.mockReset();
    executeCommandMock.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should do nothing when no config exists", async () => {
    await runCommand(["plugin", "remove", "csv", "--cwd", tempDir]);

    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  it("should warn when the plugin is not in the config", async () => {
    await writeFile(join(tempDir, "allurerc.json"), JSON.stringify({ name: "Test", plugins: {} }));

    await runCommand(["plugin", "remove", "csv", "--cwd", tempDir]);

    const config = await readAllureConfig(tempDir);
    expect(config?.plugins).toEqual({});
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  it("should remove the plugin from config and prompt before uninstalling", async () => {
    await writeFile(
      join(tempDir, "allurerc.json"),
      JSON.stringify({ name: "Test", plugins: { csv: { options: {} } } }),
    );
    promptsMock.mockResolvedValueOnce({ shouldUninstall: false });

    await runCommand(["plugin", "remove", "csv", "--cwd", tempDir]);

    const config = await readAllureConfig(tempDir);
    expect(config?.plugins?.csv).toBeUndefined();
    expect(promptsMock).toHaveBeenCalledTimes(1);
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  it("should uninstall the package when the user confirms", async () => {
    await writeFile(
      join(tempDir, "allurerc.json"),
      JSON.stringify({ name: "Test", plugins: { csv: { options: {} } } }),
    );
    promptsMock.mockResolvedValueOnce({ shouldUninstall: true });

    await runCommand(["plugin", "remove", "csv", "--cwd", tempDir]);

    expect(executeCommandMock).toHaveBeenCalledTimes(1);
    const [removeCommand] = executeCommandMock.mock.calls[0];
    expect(removeCommand).toBe("npm uninstall @allurereport/plugin-csv");
  });

  it("should uninstall without prompting when --uninstall is passed", async () => {
    await writeFile(
      join(tempDir, "allurerc.json"),
      JSON.stringify({ name: "Test", plugins: { csv: { options: {} } } }),
    );

    await runCommand(["plugin", "remove", "csv", "--uninstall", "--cwd", tempDir]);

    expect(promptsMock).not.toHaveBeenCalled();
    expect(executeCommandMock).toHaveBeenCalledTimes(1);
  });

  it("should still leave the plugin removed from config even if the uninstall command fails", async () => {
    await writeFile(
      join(tempDir, "allurerc.json"),
      JSON.stringify({ name: "Test", plugins: { csv: { options: {} } } }),
    );
    executeCommandMock.mockResolvedValue({ stdout: "", stderr: "boom", exitCode: 1 });

    await runCommand(["plugin", "remove", "csv", "--uninstall", "--cwd", tempDir]);

    const config = await readAllureConfig(tempDir);

    // config edit happens before the (failed) uninstall attempt
    expect(config?.plugins?.csv).toBeUndefined();
    expect(executeCommandMock).toHaveBeenCalledTimes(1);
  });

  it("should not touch an ESM config", async () => {
    await writeFile(join(tempDir, "allurerc.mjs"), 'export default { plugins: { csv: {} } };\n');

    await runCommand(["plugin", "remove", "csv", "--uninstall", "--cwd", tempDir]);

    expect(executeCommandMock).not.toHaveBeenCalled();
  });
});
