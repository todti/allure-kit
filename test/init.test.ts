import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { UsageError } from "clipanion";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KitInitCommand } from "../src/commands/init.js";
import { detectPackageManager } from "../src/commands/utils/detect-package-manager.js";
import { executeCommand } from "../src/commands/utils/exec.js";

vi.mock("../src/commands/utils/detect-package-manager.js", () => ({
  detectPackageManager: vi.fn(),
  getInstallCommand: vi.fn((manager: string, packages: string[]) => `${manager} install ${packages.join(" ")}`),
}));

vi.mock("../src/commands/utils/exec.js", () => ({
  executeCommand: vi.fn(),
}));

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

describe("kit/init", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "allure-kit-init-test-"));
    vi.mocked(detectPackageManager).mockResolvedValue("npm");
    vi.mocked(executeCommand).mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("should exit early when allurerc already exists", async () => {
    const existingConfigPath = join(tempDir, "allurerc.json");
    await writeFile(existingConfigPath, JSON.stringify({ name: "Existing" }, null, 2));

    const command = new KitInitCommand();
    command.cwd = tempDir;
    command.framework = "playwright";

    await command.execute();

    expect(executeCommand).not.toHaveBeenCalled();

    const stillSame = await readFile(existingConfigPath, "utf-8");
    expect(JSON.parse(stillSame).name).toBe("Existing");
  });

  it("should perform non-interactive setup when --framework is provided", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "demo" }));

    const command = new KitInitCommand();
    command.cwd = tempDir;
    command.framework = "playwright";

    await command.execute();

    expect(executeCommand).toHaveBeenCalledTimes(1);
    const [installCommand] = vi.mocked(executeCommand).mock.calls[0];
    expect(installCommand).toContain("allure");
    expect(installCommand).toContain("allure-playwright");

    const configPath = join(tempDir, "allurerc.json");
    expect(await fileExists(configPath)).toBe(true);
    const config = JSON.parse(await readFile(configPath, "utf-8"));
    expect(config.plugins).toHaveProperty("awesome");
    expect(config.name).toBe("Allure Report");
  });

  it("should throw UsageError for unsupported --lang", async () => {
    const command = new KitInitCommand();
    command.cwd = tempDir;
    command.lang = "java";
    command.framework = "playwright";

    await expect(command.execute()).rejects.toBeInstanceOf(UsageError);
  });

  it("should throw UsageError for unknown --framework", async () => {
    const command = new KitInitCommand();
    command.cwd = tempDir;
    command.framework = "nightwatch";

    await expect(command.execute()).rejects.toBeInstanceOf(UsageError);
  });

  it("should wire the reporter into the framework config by default", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "demo" }));
    await writeFile(
      join(tempDir, "playwright.config.ts"),
      `export default defineConfig({\n  testDir: "./tests",\n});\n`,
    );

    const command = new KitInitCommand();
    command.cwd = tempDir;
    command.framework = "playwright";

    await command.execute();

    const text = await readFile(join(tempDir, "playwright.config.ts"), "utf-8");
    expect(text).toContain('reporter: [["allure-playwright"]]');
  });

  it("should skip wiring the framework config when --no-wire-config is passed", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "demo" }));
    const original = `export default defineConfig({\n  testDir: "./tests",\n});\n`;
    await writeFile(join(tempDir, "playwright.config.ts"), original);

    const command = new KitInitCommand();
    command.cwd = tempDir;
    command.framework = "playwright";
    command.wireConfig = false;

    await command.execute();

    const text = await readFile(join(tempDir, "playwright.config.ts"), "utf-8");
    expect(text).toBe(original);

    const configPath = join(tempDir, "allurerc.json");
    expect(await fileExists(configPath)).toBe(true);
  });

  it("should not generate any demo test files", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "demo" }));

    const command = new KitInitCommand();
    command.cwd = tempDir;
    command.framework = "vitest";

    await command.execute();

    expect(await fileExists(join(tempDir, "tests"))).toBe(false);
    expect(await fileExists(join(tempDir, "test"))).toBe(false);
    expect(await fileExists(join(tempDir, "src", "__tests__"))).toBe(false);
  });
});
