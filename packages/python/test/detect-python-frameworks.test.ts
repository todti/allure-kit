import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  detectPythonFrameworks,
  detectPythonFrameworksByFiles,
} from "../src/detect-python-frameworks.js";

describe("kit/detect-python-frameworks", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "allure-kit-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("detectPythonFrameworks (requirements.txt)", () => {
    it("should detect pytest from requirements.txt", async () => {
      await writeFile(join(tempDir, "requirements.txt"), "pytest==8.0.0\nrequests==2.31.0\n");

      const detected = await detectPythonFrameworks(tempDir);

      expect(detected).toHaveLength(1);
      expect(detected[0].framework.id).toBe("pytest");
      expect(detected[0].framework.adapterPackage).toBe("allure-pytest");
      expect(detected[0].source).toBe("dependencies");
      expect(detected[0].version).toBe("==8.0.0");
    });

    it("should detect behave from requirements-dev.txt as a dev dependency", async () => {
      await writeFile(join(tempDir, "requirements-dev.txt"), "behave>=1.2.6\n");

      const detected = await detectPythonFrameworks(tempDir);

      expect(detected).toHaveLength(1);
      expect(detected[0].framework.id).toBe("behave");
      expect(detected[0].source).toBe("devDependencies");
    });

    it("should detect multiple frameworks", async () => {
      await writeFile(join(tempDir, "requirements.txt"), "pytest==8.0.0\npytest-bdd==7.0.0\nrobotframework==7.0\n");

      const detected = await detectPythonFrameworks(tempDir);
      const ids = detected.map((d) => d.framework.id);

      expect(ids).toContain("pytest");
      expect(ids).toContain("pytest-bdd");
      expect(ids).toContain("robotframework");
    });

    it("should ignore comments and blank lines", async () => {
      await writeFile(join(tempDir, "requirements.txt"), "# test deps\n\npytest==8.0.0\n-r other.txt\n");

      const detected = await detectPythonFrameworks(tempDir);

      expect(detected).toHaveLength(1);
      expect(detected[0].framework.id).toBe("pytest");
    });
  });

  describe("detectPythonFrameworks (pyproject.toml, PEP 621)", () => {
    it("should detect pytest from project.dependencies", async () => {
      await writeFile(
        join(tempDir, "pyproject.toml"),
        '[project]\nname = "demo"\ndependencies = ["pytest>=8.0", "requests"]\n',
      );

      const detected = await detectPythonFrameworks(tempDir);

      expect(detected).toHaveLength(1);
      expect(detected[0].framework.id).toBe("pytest");
      expect(detected[0].version).toBe(">=8.0");
    });

    it("should detect frameworks from optional-dependencies as dev deps", async () => {
      await writeFile(
        join(tempDir, "pyproject.toml"),
        '[project]\nname = "demo"\ndependencies = []\n\n[project.optional-dependencies]\ntest = ["pytest>=8.0"]\n',
      );

      const detected = await detectPythonFrameworks(tempDir);

      expect(detected).toHaveLength(1);
      expect(detected[0].framework.id).toBe("pytest");
      expect(detected[0].source).toBe("devDependencies");
    });
  });

  describe("detectPythonFrameworks (pyproject.toml, Poetry)", () => {
    it("should detect pytest from tool.poetry.dependencies", async () => {
      await writeFile(
        join(tempDir, "pyproject.toml"),
        '[tool.poetry]\nname = "demo"\n\n[tool.poetry.dependencies]\npython = "^3.11"\npytest = "^8.0"\n',
      );

      const detected = await detectPythonFrameworks(tempDir);

      expect(detected).toHaveLength(1);
      expect(detected[0].framework.id).toBe("pytest");
      expect(detected[0].version).toBe("^8.0");
    });

    it("should detect behave from a poetry dev group", async () => {
      await writeFile(
        join(tempDir, "pyproject.toml"),
        '[tool.poetry.dependencies]\npython = "^3.11"\n\n[tool.poetry.group.dev.dependencies]\nbehave = "^1.2.6"\n',
      );

      const detected = await detectPythonFrameworks(tempDir);

      expect(detected).toHaveLength(1);
      expect(detected[0].framework.id).toBe("behave");
      expect(detected[0].source).toBe("devDependencies");
    });

    it("should handle table-form poetry dependencies with a version key", async () => {
      await writeFile(
        join(tempDir, "pyproject.toml"),
        '[tool.poetry.dependencies]\npython = "^3.11"\npytest = { version = "^8.0", extras = ["testing"] }\n',
      );

      const detected = await detectPythonFrameworks(tempDir);

      expect(detected).toHaveLength(1);
      expect(detected[0].framework.id).toBe("pytest");
      expect(detected[0].version).toBe("^8.0");
    });
  });

  describe("detectPythonFrameworks (pyproject.toml, PDM)", () => {
    it("should detect pytest from tool.pdm.dev-dependencies", async () => {
      await writeFile(
        join(tempDir, "pyproject.toml"),
        '[project]\nname = "demo"\ndependencies = []\n\n[tool.pdm.dev-dependencies]\ntest = ["pytest>=8.0"]\n',
      );

      const detected = await detectPythonFrameworks(tempDir);

      expect(detected).toHaveLength(1);
      expect(detected[0].framework.id).toBe("pytest");
      expect(detected[0].source).toBe("devDependencies");
    });
  });

  describe("detectPythonFrameworks (Pipfile)", () => {
    it("should detect pytest from Pipfile [packages]", async () => {
      await writeFile(join(tempDir, "Pipfile"), '[packages]\npytest = "*"\n');

      const detected = await detectPythonFrameworks(tempDir);

      expect(detected).toHaveLength(1);
      expect(detected[0].framework.id).toBe("pytest");
      expect(detected[0].source).toBe("dependencies");
    });

    it("should detect behave from Pipfile [dev-packages]", async () => {
      await writeFile(join(tempDir, "Pipfile"), '[dev-packages]\nbehave = "*"\n');

      const detected = await detectPythonFrameworks(tempDir);

      expect(detected).toHaveLength(1);
      expect(detected[0].framework.id).toBe("behave");
      expect(detected[0].source).toBe("devDependencies");
    });
  });

  describe("detectPythonFrameworksByFiles", () => {
    it("should detect behave from behave.ini config file", async () => {
      await writeFile(join(tempDir, "behave.ini"), "[behave]\n");

      const detected = await detectPythonFrameworksByFiles(tempDir);

      expect(detected).toHaveLength(1);
      expect(detected[0].framework.id).toBe("behave");
      expect(detected[0].source).toBe("config-file");
    });

    it("should detect pytest from pytest.ini config file", async () => {
      await writeFile(join(tempDir, "pytest.ini"), "[pytest]\n");

      const detected = await detectPythonFrameworksByFiles(tempDir);

      expect(detected).toHaveLength(1);
      expect(detected[0].framework.id).toBe("pytest");
    });

    it("should detect robotframework from .robot test files", async () => {
      await mkdir(join(tempDir, "tests"), { recursive: true });
      await writeFile(join(tempDir, "tests", "smoke.robot"), "*** Test Cases ***\n");

      const detected = await detectPythonFrameworksByFiles(tempDir);

      expect(detected).toHaveLength(1);
      expect(detected[0].framework.id).toBe("robotframework");
      expect(detected[0].source).toBe("test-files");
    });

    it("should detect behave from feature files under features/", async () => {
      await mkdir(join(tempDir, "features"), { recursive: true });
      await writeFile(join(tempDir, "features", "login.feature"), "Feature: login\n");

      const detected = await detectPythonFrameworksByFiles(tempDir);

      expect(detected).toHaveLength(1);
      expect(detected[0].framework.id).toBe("behave");
    });

    it("should return nothing when no signals are present", async () => {
      const detected = await detectPythonFrameworksByFiles(tempDir);

      expect(detected).toHaveLength(0);
    });
  });
});
