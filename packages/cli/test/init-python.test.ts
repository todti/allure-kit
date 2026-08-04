import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KitInitCommand } from "../src/commands/init.js";

// Mocked by resolved file path so the mock also intercepts the ecosystem
// adapter's own internal relative import of the same file — see
// packages/python/src/adapter.ts.
vi.mock("../../python/src/detect-python-package-manager.js", async () => {
  const actual = await vi.importActual<typeof import("../../python/src/detect-python-package-manager.js")>(
    "../../python/src/detect-python-package-manager.js",
  );

  return {
    ...actual,
    detectPythonPackageManager: vi.fn(),
  };
});

vi.mock("../../core/src/exec.js", () => ({
  executeCommand: vi.fn(),
}));

const { detectPythonPackageManager } = await import("../../python/src/detect-python-package-manager.js");
const { executeCommand } = await import("../../core/src/exec.js");

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

describe("kit/init (python)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "allure-kit-init-python-test-"));
    vi.mocked(detectPythonPackageManager).mockResolvedValue("poetry");
    vi.mocked(executeCommand).mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("should auto-detect a Python project from pyproject.toml and install the pytest adapter", async () => {
    await writeFile(
      join(tempDir, "pyproject.toml"),
      '[tool.poetry.dependencies]\npython = "^3.11"\npytest = "^8.0"\n',
    );

    const command = new KitInitCommand();
    command.cwd = tempDir;
    command.yes = true;

    await command.execute();

    expect(executeCommand).toHaveBeenCalledTimes(1);
    const [installCommand] = vi.mocked(executeCommand).mock.calls[0];
    expect(installCommand).toBe("poetry add --group dev allure-pytest");
    expect(installCommand).not.toContain('"allure"');
    expect(installCommand.split(" ")).not.toContain("allure");

    const configPath = join(tempDir, "allurerc.json");
    expect(await fileExists(configPath)).toBe(true);
  });

  it("should perform non-interactive setup with --lang=python --framework=pytest", async () => {
    const command = new KitInitCommand();
    command.cwd = tempDir;
    command.lang = "python";
    command.framework = "pytest";

    await command.execute();

    expect(executeCommand).toHaveBeenCalledTimes(1);
    const [installCommand] = vi.mocked(executeCommand).mock.calls[0];
    expect(installCommand).toBe("poetry add --group dev allure-pytest");

    const configPath = join(tempDir, "allurerc.json");
    expect(await fileExists(configPath)).toBe(true);
    const config = JSON.parse(await readFile(configPath, "utf-8"));
    expect(config.name).toBe("Allure Report");
  });

  it("should append to requirements.txt when the resolved manager is pip", async () => {
    vi.mocked(detectPythonPackageManager).mockResolvedValue("pip");
    await writeFile(join(tempDir, "requirements.txt"), "requests==2.31.0\n");

    const command = new KitInitCommand();
    command.cwd = tempDir;
    command.lang = "python";
    command.framework = "pytest";

    await command.execute();

    const requirementsContent = await readFile(join(tempDir, "requirements.txt"), "utf-8");
    expect(requirementsContent).toBe("requests==2.31.0\nallure-pytest\n");
  });

  it("should not create package.json for a Python project", async () => {
    const command = new KitInitCommand();
    command.cwd = tempDir;
    command.lang = "python";
    command.framework = "pytest";

    await command.execute();

    expect(await fileExists(join(tempDir, "package.json"))).toBe(false);
  });

  it("should suggest --lang=js when a JS framework is forced against a Python-resolved project", async () => {
    const command = new KitInitCommand();
    command.cwd = tempDir;
    command.lang = "python";
    command.framework = "playwright";

    await expect(command.execute()).rejects.toThrow(/--lang=js/);
  });

  describe.each([
    { framework: "behave", adapter: "allure-behave" },
    { framework: "pytest-bdd", adapter: "allure-pytest-bdd" },
    { framework: "robotframework", adapter: "allure-robotframework" },
  ])("--framework=$framework", ({ framework, adapter }) => {
    it(`should install ${adapter}`, async () => {
      const command = new KitInitCommand();
      command.cwd = tempDir;
      command.lang = "python";
      command.framework = framework;

      await command.execute();

      expect(executeCommand).toHaveBeenCalledTimes(1);
      const [installCommand] = vi.mocked(executeCommand).mock.calls[0];
      expect(installCommand).toBe(`poetry add --group dev ${adapter}`);
    });
  });

  describe.each([
    { manager: "pdm", expected: "pdm add -d allure-pytest" },
    { manager: "pipenv", expected: "pipenv install --dev allure-pytest" },
  ] as const)("package manager: $manager", ({ manager, expected }) => {
    it(`should build the ${manager} install command`, async () => {
      vi.mocked(detectPythonPackageManager).mockResolvedValue(manager);

      const command = new KitInitCommand();
      command.cwd = tempDir;
      command.lang = "python";
      command.framework = "pytest";

      await command.execute();

      expect(executeCommand).toHaveBeenCalledTimes(1);
      const [installCommand] = vi.mocked(executeCommand).mock.calls[0];
      expect(installCommand).toBe(expected);

      // pdm/pipenv self-persist to their manifest — no requirements.txt should appear.
      expect(await fileExists(join(tempDir, "requirements.txt"))).toBe(false);
    });
  });

  it("should not write allurerc.json when the install command fails", async () => {
    vi.mocked(executeCommand).mockResolvedValue({ stdout: "", stderr: "no matching package", exitCode: 1 });

    const command = new KitInitCommand();
    command.cwd = tempDir;
    command.lang = "python";
    command.framework = "pytest";

    await command.execute();

    expect(await fileExists(join(tempDir, "allurerc.json"))).toBe(false);
  });
});
