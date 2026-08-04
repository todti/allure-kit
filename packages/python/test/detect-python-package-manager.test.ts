import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  appendToRequirementsTxt,
  detectPythonPackageManager,
  getInstallCommand,
  getRemoveCommand,
} from "../src/detect-python-package-manager.js";

describe("kit/detect-python-package-manager", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "allure-kit-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("detectPythonPackageManager", () => {
    it("should detect poetry when poetry.lock exists", async () => {
      await writeFile(join(tempDir, "poetry.lock"), "");

      const result = await detectPythonPackageManager(tempDir);

      expect(result).toBe("poetry");
    });

    it("should detect pdm when pdm.lock exists", async () => {
      await writeFile(join(tempDir, "pdm.lock"), "");

      const result = await detectPythonPackageManager(tempDir);

      expect(result).toBe("pdm");
    });

    it("should detect pipenv when Pipfile.lock exists", async () => {
      await writeFile(join(tempDir, "Pipfile.lock"), "{}");

      const result = await detectPythonPackageManager(tempDir);

      expect(result).toBe("pipenv");
    });

    it("should detect pipenv when Pipfile exists", async () => {
      await writeFile(join(tempDir, "Pipfile"), "");

      const result = await detectPythonPackageManager(tempDir);

      expect(result).toBe("pipenv");
    });

    it("should detect pip when requirements.txt exists", async () => {
      await writeFile(join(tempDir, "requirements.txt"), "pytest==8.0.0\n");

      const result = await detectPythonPackageManager(tempDir);

      expect(result).toBe("pip");
    });

    it("should default to pip when nothing is found", async () => {
      const result = await detectPythonPackageManager(tempDir);

      expect(result).toBe("pip");
    });

    it("should detect poetry from pyproject.toml [tool.poetry] section", async () => {
      await writeFile(
        join(tempDir, "pyproject.toml"),
        '[tool.poetry]\nname = "demo"\n\n[tool.poetry.dependencies]\npython = "^3.11"\n',
      );

      const result = await detectPythonPackageManager(tempDir);

      expect(result).toBe("poetry");
    });

    it("should detect pdm from pyproject.toml [tool.pdm] section", async () => {
      await writeFile(join(tempDir, "pyproject.toml"), '[project]\nname = "demo"\n\n[tool.pdm]\n');

      const result = await detectPythonPackageManager(tempDir);

      expect(result).toBe("pdm");
    });

    it("should prefer poetry.lock over a Pipfile in the same directory", async () => {
      await writeFile(join(tempDir, "poetry.lock"), "");
      await writeFile(join(tempDir, "Pipfile"), "");

      const result = await detectPythonPackageManager(tempDir);

      expect(result).toBe("poetry");
    });

    it("should find poetry.lock in a parent directory", async () => {
      await writeFile(join(tempDir, "poetry.lock"), "");

      const subDir = join(tempDir, "packages", "my-app");
      await mkdir(subDir, { recursive: true });

      const result = await detectPythonPackageManager(subDir);

      expect(result).toBe("poetry");
    });
  });

  describe("getInstallCommand", () => {
    it("should generate poetry dev install command", () => {
      const command = getInstallCommand("poetry", ["allure-pytest"], true);

      expect(command).toBe("poetry add --group dev allure-pytest");
    });

    it("should generate poetry prod install command", () => {
      const command = getInstallCommand("poetry", ["allure-pytest"], false);

      expect(command).toBe("poetry add allure-pytest");
    });

    it("should generate pdm dev install command", () => {
      const command = getInstallCommand("pdm", ["allure-pytest"], true);

      expect(command).toBe("pdm add -d allure-pytest");
    });

    it("should generate pipenv dev install command", () => {
      const command = getInstallCommand("pipenv", ["allure-pytest"], true);

      expect(command).toBe("pipenv install --dev allure-pytest");
    });

    it("should generate pip install command (no dev distinction)", () => {
      const command = getInstallCommand("pip", ["allure-pytest", "allure-behave"], true);

      expect(command).toBe("pip install allure-pytest allure-behave");
    });
  });

  describe("getRemoveCommand", () => {
    it("should generate poetry remove command", () => {
      expect(getRemoveCommand("poetry", ["allure-pytest"])).toBe("poetry remove allure-pytest");
    });

    it("should generate pdm remove command", () => {
      expect(getRemoveCommand("pdm", ["allure-pytest"])).toBe("pdm remove allure-pytest");
    });

    it("should generate pipenv uninstall command", () => {
      expect(getRemoveCommand("pipenv", ["allure-pytest"])).toBe("pipenv uninstall allure-pytest");
    });

    it("should generate pip uninstall command", () => {
      expect(getRemoveCommand("pip", ["allure-pytest"])).toBe("pip uninstall -y allure-pytest");
    });
  });

  describe("appendToRequirementsTxt", () => {
    it("should create requirements.txt when missing", async () => {
      await appendToRequirementsTxt(tempDir, ["allure-pytest"]);

      const content = await readFile(join(tempDir, "requirements.txt"), "utf-8");

      expect(content).toBe("allure-pytest\n");
    });

    it("should append to an existing requirements.txt", async () => {
      await writeFile(join(tempDir, "requirements.txt"), "pytest==8.0.0\n");

      await appendToRequirementsTxt(tempDir, ["allure-pytest"]);

      const content = await readFile(join(tempDir, "requirements.txt"), "utf-8");

      expect(content).toBe("pytest==8.0.0\nallure-pytest\n");
    });

    it("should not duplicate a package that is already listed", async () => {
      await writeFile(join(tempDir, "requirements.txt"), "allure-pytest==2.0.0\n");

      await appendToRequirementsTxt(tempDir, ["allure-pytest"]);

      const content = await readFile(join(tempDir, "requirements.txt"), "utf-8");

      expect(content).toBe("allure-pytest==2.0.0\n");
    });

    it("should add a trailing newline before appending if missing", async () => {
      await writeFile(join(tempDir, "requirements.txt"), "pytest==8.0.0");

      await appendToRequirementsTxt(tempDir, ["allure-pytest"]);

      const content = await readFile(join(tempDir, "requirements.txt"), "utf-8");

      expect(content).toBe("pytest==8.0.0\nallure-pytest\n");
    });
  });
});
