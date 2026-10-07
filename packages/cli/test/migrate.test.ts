import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logMock = vi.fn();

vi.mock("node:console", () => ({ log: (...args: unknown[]) => logMock(...args) }));

vi.mock("../../core/src/exec.js", () => ({ executeCommand: vi.fn() }));

vi.mock("../../npm/src/detect-package-manager.js", async () => {
  const actual = await vi.importActual<typeof import("../../npm/src/detect-package-manager.js")>(
    "../../npm/src/detect-package-manager.js",
  );

  return { ...actual, detectPackageManager: vi.fn() };
});

const { KitMigrateCommand } = await import("../src/commands/migrate.js");
const { executeCommand } = await import("../../core/src/exec.js");
const { detectPackageManager } = await import("../../npm/src/detect-package-manager.js");

const output = () => logMock.mock.calls.map((call) => call.join(" ")).join("\n");

describe("kit/migrate", () => {
  let dir: string;

  const run = async (dryRun: boolean) => {
    const command = new KitMigrateCommand();

    command.cwd = dir;
    command.dryRun = dryRun;
    await command.execute();
  };

  const writePackage = (pkg: object) => writeFile(join(dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "allure-kit-migrate-"));
    logMock.mockReset();
    vi.mocked(executeCommand).mockReset();
    vi.mocked(detectPackageManager).mockResolvedValue("npm");
    vi.mocked(executeCommand).mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  const legacyProject = {
    devDependencies: { "allure-commandline": "^2.30.0" },
    scripts: { report: "allure serve allure-results", test: "vitest run" },
  };

  it("changes nothing under --dry-run but describes the plan", async () => {
    await writePackage(legacyProject);

    await run(true);

    expect(executeCommand).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(join(dir, "package.json"), "utf-8"))).toEqual(legacyProject);
    expect(output()).toContain("would run: npm uninstall allure-commandline");
    expect(output()).toContain("would run: npm install --save-dev allure");
    expect(output()).toContain("would rewrite report: allure serve allure-results");
    expect(output()).toContain("would create allurerc.json");
  });

  it("swaps the package, rewrites scripts and creates allurerc", async () => {
    await writePackage(legacyProject);

    await run(false);

    expect(vi.mocked(executeCommand).mock.calls.map((call) => call[0])).toEqual([
      "npm uninstall allure-commandline",
      "npm install --save-dev allure",
    ]);
    expect(JSON.parse(await readFile(join(dir, "package.json"), "utf-8")).scripts.report).toBe(
      "allure generate allure-results --open",
    );
    expect(JSON.parse(await readFile(join(dir, "allurerc.json"), "utf-8")).plugins).toHaveProperty("awesome");
  });

  it("reports when there is nothing to migrate", async () => {
    await writePackage({ devDependencies: { allure: "^3.0.0" }, scripts: { test: "vitest" } });

    await run(false);

    expect(executeCommand).not.toHaveBeenCalled();
    expect(output()).toContain("Nothing to migrate");
  });

  it("migrates allure-junit5 in a Maven project and respects --dry-run", async () => {
    const pom = "<project><properties><allure.version>2.29.0</allure.version></properties><artifactId>allure-junit5</artifactId></project>";

    await writeFile(join(dir, "pom.xml"), pom);
    await run(true);

    expect(await readFile(join(dir, "pom.xml"), "utf-8")).toBe(pom);
    expect(output()).toContain("would change artifactId allure-junit5 → allure-jupiter");

    await run(false);

    const migrated = await readFile(join(dir, "pom.xml"), "utf-8");

    expect(migrated).toContain("allure-jupiter");
    expect(migrated).toContain("<allure.version>3.0.0</allure.version>");
    expect(executeCommand).not.toHaveBeenCalled();
  });
});
