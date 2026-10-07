import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { UsageError } from "clipanion";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logMock = vi.fn();

vi.mock("node:console", () => ({ log: (...args: unknown[]) => logMock(...args) }));

const { DEMO_TEMPLATES, KitDemoCommand } = await import("../src/commands/demo.js");

const output = () => logMock.mock.calls.map((call) => call.join(" ")).join("\n");

describe("kit/demo", () => {
  let dir: string;

  const run = async (configure: (command: InstanceType<typeof KitDemoCommand>) => void = () => undefined) => {
    const command = new KitDemoCommand();

    command.cwd = dir;
    command.force = false;
    command.dryRun = false;
    configure(command);
    await command.execute();
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "allure-kit-demo-"));
    logMock.mockReset();
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("creates a demo test for the detected framework and says how to run it", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({ devDependencies: { vitest: "^3.0.0" } }));

    await run();

    expect(await readFile(join(dir, "allure-demo.test.ts"), "utf-8")).toContain('test("allure demo"');
    expect(output()).toContain("vitest: npx vitest run");
  });

  it("never overwrites an existing file unless --force is given", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({ devDependencies: { vitest: "^3.0.0" } }));
    await writeFile(join(dir, "allure-demo.test.ts"), "// mine\n");

    await run();

    expect(await readFile(join(dir, "allure-demo.test.ts"), "utf-8")).toBe("// mine\n");
    expect(output()).toContain("left untouched");

    await run((command) => (command.force = true));

    expect(await readFile(join(dir, "allure-demo.test.ts"), "utf-8")).toContain("allure demo");
  });

  it("lists the files under --dry-run without writing them", async () => {
    await run((command) => {
      command.framework = "pytest";
      command.dryRun = true;
    });

    expect(output()).toContain("would create tests/test_allure_demo.py");
    await expect(readFile(join(dir, "tests", "test_allure_demo.py"), "utf-8")).rejects.toThrow();
  });

  it("writes several files and nested directories for frameworks that need them", async () => {
    await run((command) => (command.framework = "cucumberjs"));

    expect(await readFile(join(dir, "features", "allure-demo.feature"), "utf-8")).toContain("Given a number");
    expect(await readFile(join(dir, "features", "step_definitions", "allure-demo.js"), "utf-8")).toContain("@cucumber/cucumber");
  });

  it("rejects a framework without a template and reports a project without any framework", async () => {
    await expect(run((command) => (command.framework = "codeceptjs"))).rejects.toThrow(UsageError);

    await run();

    expect(output()).toContain("No test framework detected");
  });

  it("has a template for every framework it advertises", () => {
    for (const [id, template] of Object.entries(DEMO_TEMPLATES)) {
      expect(Object.keys(template.files).length, id).toBeGreaterThan(0);
      expect(template.run, id).not.toBe("");
    }
  });
});
