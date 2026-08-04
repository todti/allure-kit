import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fileExists, matchesGlob, scanDirectoryShallow } from "../src/fs-scan.js";

describe("kit/fs-scan", () => {
  describe("fileExists", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), "allure-kit-fs-scan-test-"));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it("should return true for an existing file", async () => {
      const filePath = join(tempDir, "exists.txt");
      await writeFile(filePath, "");

      expect(await fileExists(filePath)).toBe(true);
    });

    it("should return false for a missing file", async () => {
      expect(await fileExists(join(tempDir, "missing.txt"))).toBe(false);
    });
  });

  describe("matchesGlob", () => {
    it("should match an exact filename", () => {
      expect(matchesGlob("pytest.ini", "pytest.ini")).toBe(true);
      expect(matchesGlob("pytest.ini", "behave.ini")).toBe(false);
    });

    it("should match single-segment wildcards", () => {
      expect(matchesGlob("test_login.py", "test_*.py")).toBe(true);
      expect(matchesGlob("tests/test_login.py", "test_*.py")).toBe(false);
    });

    it("should match double-star across zero or more directories", () => {
      expect(matchesGlob("features/steps/login.py", "features/steps/**/*.py")).toBe(true);
      expect(matchesGlob("features/steps/auth/login.py", "features/steps/**/*.py")).toBe(true);
      expect(matchesGlob("a/b/c/d.feature", "**/*.feature")).toBe(true);
      expect(matchesGlob("d.feature", "**/*.feature")).toBe(true);
      expect(matchesGlob("d.feature", "features/**/*.feature")).toBe(false);
    });

    it("should escape regex special characters in the pattern", () => {
      expect(matchesGlob("allurerc.json", "allurerc.json")).toBe(true);
      expect(matchesGlob("config.file+name.js", "config.file+name.js")).toBe(true);
      expect(matchesGlob("configXfileYname.js", "config.file+name.js")).toBe(false);
    });
  });

  describe("scanDirectoryShallow", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), "allure-kit-fs-scan-test-"));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it("should list files at the top level", async () => {
      await writeFile(join(tempDir, "a.txt"), "");
      await writeFile(join(tempDir, "b.txt"), "");

      const results = await scanDirectoryShallow(tempDir, 1);

      expect(results.sort()).toEqual(["a.txt", "b.txt"]);
    });

    it("should recurse into subdirectories up to maxDepth", async () => {
      await mkdir(join(tempDir, "features", "steps"), { recursive: true });
      await writeFile(join(tempDir, "features", "login.feature"), "");
      await writeFile(join(tempDir, "features", "steps", "login.py"), "");

      const results = await scanDirectoryShallow(tempDir, 3);

      expect(results).toContain(join("features", "login.feature"));
      expect(results).toContain(join("features", "steps", "login.py"));
    });

    it("should not descend past maxDepth", async () => {
      await mkdir(join(tempDir, "a", "b"), { recursive: true });
      await writeFile(join(tempDir, "a", "b", "deep.txt"), "");

      const results = await scanDirectoryShallow(tempDir, 1);

      expect(results).not.toContain(join("a", "b", "deep.txt"));
    });

    it("should skip node_modules, .git, dist, and build directories", async () => {
      for (const skipped of ["node_modules", ".git", "dist", "build"]) {
        await mkdir(join(tempDir, skipped), { recursive: true });
        await writeFile(join(tempDir, skipped, "file.txt"), "");
      }
      await writeFile(join(tempDir, "kept.txt"), "");

      const results = await scanDirectoryShallow(tempDir, 2);

      expect(results).toEqual(["kept.txt"]);
    });

    it("should return an empty array for a missing directory", async () => {
      const results = await scanDirectoryShallow(join(tempDir, "does-not-exist"), 2);

      expect(results).toEqual([]);
    });
  });
});
