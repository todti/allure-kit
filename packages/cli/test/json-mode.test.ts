import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Cli } from "clipanion";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consoleLog = vi.fn();

vi.mock("node:console", () => ({ log: (...args: unknown[]) => consoleLog(...args) }));

const { KitDemoCommand } = await import("../src/commands/demo.js");
const { runJson, wantsJson } = await import("../src/json-mode.js");

describe("kit/json-mode", () => {
  let dir: string;
  const cli = () => {
    const instance = new Cli();

    instance.register(KitDemoCommand);

    return instance;
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "allure-kit-json-"));
    consoleLog.mockReset();
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("knows which commands can return JSON", () => {
    expect(wantsJson(["init", "--yes", "--json"])).toBe(true);
    expect(wantsJson(["plugin", "add", "csv", "--json"])).toBe(true);
    expect(wantsJson(["plugin", "list", "--json"])).toBe(false);
    expect(wantsJson(["config", "get", "name", "--json"])).toBe(false);
    expect(wantsJson(["doctor", "--json"])).toBe(false);
    expect(wantsJson(["init"])).toBe(false);
  });

  it("returns the command's messages as data and prints nothing", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({ devDependencies: { vitest: "^3.0.0" } }));

    const { exitCode, result } = await runJson(cli(), ["demo", "--cwd", dir, "--json"]);

    expect(exitCode).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.command).toEqual(["demo", "--cwd", dir]);
    expect(result.messages).toContainEqual({ level: "success", message: "created allure-demo.test.ts" });
    expect(result.messages.some((m) => m.level === "hint" && m.message.includes("npx vitest run"))).toBe(true);
    expect(consoleLog).not.toHaveBeenCalled();
    expect(await readFile(join(dir, "allure-demo.test.ts"), "utf-8")).toContain("allure demo");
  });

  it("reports a usage error as ok:false with the framework's message", async () => {
    const { exitCode, result } = await runJson(cli(), ["demo", "--framework", "nope", "--cwd", dir, "--json"]);

    expect(exitCode).not.toBe(0);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("No demo for");
  });

  it("stops capturing afterwards, so later output prints normally", async () => {
    await runJson(cli(), ["demo", "--framework", "pytest", "--cwd", dir, "--dry-run", "--json"]);

    const { logInfo } = await import("@todti/allure-kit-core");

    logInfo("visible");

    expect(consoleLog).toHaveBeenCalledTimes(1);
  });
});
