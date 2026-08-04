import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Cli } from "clipanion";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REPORT_PLUGIN_REGISTRY } from "@todti/allure-kit-core";

const logMock = vi.fn();

vi.mock("node:console", () => ({ log: (...args: unknown[]) => logMock(...args) }));

const { KitPluginListCommand } = await import("../src/commands/pluginList.js");

const runCommand = async (args: string[]) => {
  const cli = new Cli();

  cli.register(KitPluginListCommand);

  await cli.run(args);
};

describe("kit/plugin list", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "allure-plugin-list-test-"));
    logMock.mockReset();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const output = () => logMock.mock.calls.map((call) => call.join(" ")).join("\n");

  it("shows a zero count summary when no config exists", async () => {
    await runCommand(["plugin", "list", "--cwd", tempDir]);

    expect(output()).toContain(`Configured: 0 of ${REPORT_PLUGIN_REGISTRY.length}`);
  });

  it("counts only the configured plugins", async () => {
    await writeFile(
      join(tempDir, "allurerc.json"),
      JSON.stringify({ plugins: { csv: { options: {} }, dashboard: { options: {} } } }),
    );

    await runCommand(["plugin", "list", "--cwd", tempDir]);

    expect(output()).toContain(`Configured: 2 of ${REPORT_PLUGIN_REGISTRY.length}`);
  });
});
