import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pythonAdapter } from "../src/adapter.js";
import { PYTHON_FRAMEWORK_REGISTRY } from "../src/registry.js";

describe("kit/python/adapter", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "allure-kit-python-adapter-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should describe the python ecosystem", () => {
    expect(pythonAdapter.id).toBe("pip");
    expect(pythonAdapter.displayName).toBe("Python");
    expect(pythonAdapter.langAliases).toEqual(["python", "py"]);
    expect(pythonAdapter.manifestFiles).toEqual([
      "pyproject.toml",
      "requirements.txt",
      "requirements-dev.txt",
      "Pipfile",
      "setup.py",
      "setup.cfg",
    ]);
    // No top-level "allure" package — that's the Node CLI, never auto-installed here.
    expect(pythonAdapter.alwaysInstallPackages).toEqual([]);
    expect(pythonAdapter.postInstallHint).toContain("npx allure generate");
  });

  it("should expose the full PYTHON_FRAMEWORK_REGISTRY", () => {
    expect(pythonAdapter.frameworkRegistry).toBe(PYTHON_FRAMEWORK_REGISTRY);
  });

  it("should detect the package manager for a real directory", async () => {
    await writeFile(join(tempDir, "poetry.lock"), "");

    const result = await pythonAdapter.detectPackageManager(tempDir);

    expect(result).toBe("poetry");
  });

  it("should detect frameworks for a real directory", async () => {
    await writeFile(join(tempDir, "requirements.txt"), "pytest==8.0.0\n");

    const detected = await pythonAdapter.detectFrameworks(tempDir);

    expect(detected).toHaveLength(1);
    expect(detected[0].framework.id).toBe("pytest");
  });

  it("should generate install and remove commands", () => {
    expect(pythonAdapter.getInstallCommand("poetry", ["allure-pytest"], true)).toBe(
      "poetry add --group dev allure-pytest",
    );
    expect(pythonAdapter.getRemoveCommand("poetry", ["allure-pytest"])).toBe("poetry remove allure-pytest");
  });

  describe("afterInstall", () => {
    it("should append to requirements.txt when the manager is pip", async () => {
      await pythonAdapter.afterInstall?.(tempDir, "pip", ["allure-pytest"]);

      const content = await readFile(join(tempDir, "requirements.txt"), "utf-8");

      expect(content).toBe("allure-pytest\n");
    });

    it("should not touch requirements.txt for poetry", async () => {
      await pythonAdapter.afterInstall?.(tempDir, "poetry", ["allure-pytest"]);

      await expect(readFile(join(tempDir, "requirements.txt"), "utf-8")).rejects.toThrow();
    });

    it("should not touch requirements.txt for pdm", async () => {
      await pythonAdapter.afterInstall?.(tempDir, "pdm", ["allure-pytest"]);

      await expect(readFile(join(tempDir, "requirements.txt"), "utf-8")).rejects.toThrow();
    });

    it("should not touch requirements.txt for pipenv", async () => {
      await pythonAdapter.afterInstall?.(tempDir, "pipenv", ["allure-pytest"]);

      await expect(readFile(join(tempDir, "requirements.txt"), "utf-8")).rejects.toThrow();
    });
  });
});
