import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Cli } from "clipanion";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  KitConfigGetCommand,
  KitConfigListCommand,
  KitConfigSetCommand,
  KitConfigUnsetCommand,
} from "../src/commands/config.js";

const run = async (args: string[]) => {
  const cli = new Cli();
  let out = "";

  cli.register(KitConfigSetCommand);
  cli.register(KitConfigGetCommand);
  cli.register(KitConfigListCommand);
  cli.register(KitConfigUnsetCommand);
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

  it("lists only options that are set", async () => {
    await run(["config", "set", "resultsDir", "./res", "--cwd", dir]);
    await run(["config", "set", "flakyDetection.historyDepth", "10", "--cwd", dir]);

    expect(await run(["config", "list", "--cwd", dir])).toBe('name = "R"\nresultsDir = "./res"\nflakyDetection.historyDepth = 10\n');
  });

  it("unsets a key and drops an emptied parent object", async () => {
    await run(["config", "set", "resultsDir", "./res", "--cwd", dir]);
    await run(["config", "set", "flakyDetection.historyDepth", "10", "--cwd", dir]);
    await run(["config", "unset", "flakyDetection.historyDepth", "--cwd", dir]);
    await run(["config", "unset", "resultsDir", "--cwd", dir]);

    expect(JSON.parse(await readFile(file(), "utf-8"))).toEqual({ name: "R", plugins: {} });
    expect(await run(["config", "unset", "resultsDir", "--cwd", dir])).toBe("");
  });

  it("handles the scalar options from the Allure 3 config reference", async () => {
    await run(["config", "set", "appendHistory", "false", "--cwd", dir]);
    await run(["config", "set", "historyLimit", "20", "--cwd", dir]);
    await run(["config", "set", "output", "./out", "--cwd", dir]);

    expect(await run(["config", "list", "--cwd", dir])).toBe('name = "R"\noutput = "./out"\nappendHistory = false\nhistoryLimit = 20\n');
  });

  it("edits an allurerc.mjs in place for set and unset", async () => {
    await rm(file());

    const mjs = join(dir, "allurerc.mjs");

    await writeFile(mjs, `export default defineConfig({\n  name: "R",\n  flakyDetection: { historyDepth: 5 },\n});\n`);

    await run(["config", "set", "historyPath", "./history.jsonl", "--cwd", dir]);
    await run(["config", "set", "flakyDetection.historyDepth", "12", "--cwd", dir]);

    let text = await readFile(mjs, "utf-8");

    expect(text).toContain('historyPath: "./history.jsonl",');
    expect(text).toContain("flakyDetection: { historyDepth: 12 }");

    await run(["config", "unset", "historyPath", "--cwd", dir]);
    text = await readFile(mjs, "utf-8");

    expect(text).not.toContain("historyPath");
    expect(text).toContain('name: "R"');
  });
});
