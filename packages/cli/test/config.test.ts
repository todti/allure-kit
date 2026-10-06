import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Cli } from "clipanion";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { KitConfigGetCommand, KitConfigSetCommand } from "../src/commands/config.js";

const run = async (args: string[]) => {
  const cli = new Cli();
  let out = "";

  cli.register(KitConfigSetCommand);
  cli.register(KitConfigGetCommand);
  await cli.run(args, { stdout: { write: (s: string) => ((out += s), true) } } as never);

  return out;
};

describe("kit/config", () => {
  let dir: string;
  const file = () => join(dir, "allurerc.json");

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "allure-config-test-"));
    await writeFile(file(), JSON.stringify({ name: "R", plugins: {} }));
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("sets top-level and nested keys, parsing JSON values", async () => {
    await run(["config", "set", "resultsDir", "./res", "--cwd", dir]);
    await run(["config", "set", "flakyDetection.historyDepth", "10", "--cwd", dir]);
    await run(["config", "set", "flakyDetection.includePassedTests", "true", "--cwd", dir]);

    const config = JSON.parse(await readFile(file(), "utf-8"));

    expect(config.resultsDir).toBe("./res");
    expect(config.flakyDetection).toEqual({ historyDepth: 10, includePassedTests: true });
    expect(config.name).toBe("R");
  });

  it("gets a value and rejects unknown keys", async () => {
    await run(["config", "set", "historyBaseUrl", "https://x/history.jsonl", "--cwd", dir]);

    expect(await run(["config", "get", "historyBaseUrl", "--cwd", dir])).toBe('"https://x/history.jsonl"\n');
    expect(await run(["config", "set", "bogus", "1", "--cwd", dir])).toMatch(/Unknown config key/);
  });
});
