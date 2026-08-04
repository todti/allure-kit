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

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "allure-kit-update-test-"));
    promptsMock.mockReset();
    executeCommandMock.mockReset();
    executeCommandMock.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
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

    expect(executeCommandMock).toHaveBeenCalledTimes(2);
    const [devCommand] = executeCommandMock.mock.calls[0];
    const [prodCommand] = executeCommandMock.mock.calls[1];
    expect(devCommand).toBe("npm install --save-dev allure-vitest@latest");
    expect(prodCommand).toBe("npm install allure@latest");
    expect(output()).toContain("All Allure packages updated successfully");
  });

  it("should skip the confirmation prompt with --yes", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ devDependencies: { "allure-vitest": "^2.0.0" } }));

    await run(true);

    expect(promptsMock).not.toHaveBeenCalled();
    expect(executeCommandMock).toHaveBeenCalledTimes(1);
  });

  it("should cancel and not install anything when the user declines", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ devDependencies: { "allure-vitest": "^2.0.0" } }));
    promptsMock.mockResolvedValue({ shouldUpdate: false });

    await run();

    expect(output()).toContain("Update cancelled.");
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  it("should stop before updating prod packages when the dev update fails", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({
        devDependencies: { "allure-vitest": "^2.0.0" },
        dependencies: { allure: "^3.0.0" },
      }),
    );
    executeCommandMock.mockResolvedValueOnce({ stdout: "", stderr: "boom", exitCode: 1 });

    await run(true);

    expect(executeCommandMock).toHaveBeenCalledTimes(1);
    expect(output()).toContain("Failed to update dev packages:");
  });
});
