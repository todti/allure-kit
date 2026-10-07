import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const promptsMock = vi.fn();
const executeCommandMock = vi.fn();
const logMock = vi.fn();

vi.mock("node:console", () => ({ log: (...args: unknown[]) => logMock(...args) }));

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

const { KitUpdateCommand } = await import("../src/commands/update.js");

const output = () => logMock.mock.calls.map((call) => call.join(" ")).join("\n");

describe("kit/update", () => {
  let tempDir: string;
  let latestVersions: Record<string, string>;

  const installCalls = () => executeCommandMock.mock.calls.map(([command]) => command as string).filter((command) => !command.startsWith("npm view"));

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "allure-kit-update-test-"));
    promptsMock.mockReset();
    executeCommandMock.mockReset();
    latestVersions = {};
    executeCommandMock.mockImplementation(async (command: string) => {
      const view = /^npm view (\S+) version$/.exec(command);

      if (view) {
        const latest = latestVersions[view[1]];

        return latest ? { stdout: `${latest}\n`, stderr: "", exitCode: 0 } : { stdout: "", stderr: "404", exitCode: 1 };
      }

      return { stdout: "", stderr: "", exitCode: 0 };
    });
    logMock.mockReset();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const run = async (yes = false) => {
    const command = new KitUpdateCommand();
    command.cwd = tempDir;
    command.yes = yes;
    await command.execute();
  };

  it("should report nothing to update when no Allure packages are installed", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ dependencies: { react: "^18.0.0" } }));

    await run();

    expect(output()).toContain("No Allure packages found in package.json");
    expect(promptsMock).not.toHaveBeenCalled();
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  it("should update dev and prod packages separately after confirmation", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({
        devDependencies: { "allure-vitest": "^2.0.0" },
        dependencies: { allure: "^3.0.0" },
      }),
    );
    promptsMock.mockResolvedValue({ shouldUpdate: true });

    await run();

    expect(installCalls()).toHaveLength(2);
    const [devCommand, prodCommand] = installCalls();
    expect(devCommand).toBe("npm install --save-dev allure-vitest@latest");
    expect(prodCommand).toBe("npm install allure@latest");
    expect(output()).toContain("All Allure packages updated successfully");
  });

  it("should skip the confirmation prompt with --yes", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ devDependencies: { "allure-vitest": "^2.0.0" } }));

    await run(true);

    expect(promptsMock).not.toHaveBeenCalled();
    expect(installCalls()).toHaveLength(1);
  });

  it("should cancel and not install anything when the user declines", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ devDependencies: { "allure-vitest": "^2.0.0" } }));
    promptsMock.mockResolvedValue({ shouldUpdate: false });

    await run();

    expect(output()).toContain("Update cancelled.");
    expect(installCalls()).toEqual([]);
  });

  it("should stop before updating prod packages when the dev update fails", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({
        devDependencies: { "allure-vitest": "^2.0.0" },
        dependencies: { allure: "^3.0.0" },
      }),
    );
    executeCommandMock.mockImplementation(async (command: string) =>
      command.startsWith("npm view") ? { stdout: "", stderr: "", exitCode: 1 } : { stdout: "", stderr: "boom", exitCode: 1 },
    );

    await run(true);

    expect(installCalls()).toHaveLength(1);
    expect(output()).toContain("Failed to update dev packages:");
  });

  describe("version preview", () => {
    const withPackages = (deps: Record<string, string>) =>
      writeFile(join(tempDir, "package.json"), JSON.stringify({ devDependencies: deps }));

    it("shows current → latest, flags major upgrades and skips packages that are already current", async () => {
      await withPackages({ "allure-vitest": "^2.15.0", "allure-playwright": "^3.9.0", allure: "^3.20.1" });
      latestVersions = { "allure-vitest": "3.4.5", "allure-playwright": "3.10.0", allure: "3.20.1" };

      await run(true);

      expect(output()).toContain("allure-vitest@2.15.0 → 3.4.5 (dev) — MAJOR upgrade");
      expect(output()).toContain("allure-playwright@3.9.0 → 3.10.0 (dev)");
      expect(output()).not.toContain("allure-playwright@3.9.0 → 3.10.0 (dev) — MAJOR");
      expect(output()).toContain("allure@3.20.1 (dev) — up to date");
      expect(installCalls()).toEqual(["npm install --save-dev allure-vitest@latest allure-playwright@latest"]);
    });

    it("reports that everything is up to date without installing anything", async () => {
      await withPackages({ allure: "^3.20.1" });
      latestVersions = { allure: "3.20.1" };

      await run(true);

      expect(output()).toContain("All Allure packages are up to date");
      expect(installCalls()).toEqual([]);
    });

    it("--dry-run only lists what would change", async () => {
      await withPackages({ allure: "^3.0.0" });
      latestVersions = { allure: "3.20.1" };

      const command = new KitUpdateCommand();
      command.cwd = tempDir;
      command.yes = true;
      command.dryRun = true;
      await command.execute();

      expect(output()).toContain("Would update 1 package(s)");
      expect(installCalls()).toEqual([]);
    });
  });
});
