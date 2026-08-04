import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { npmAdapter } from "../src/adapter.js";
import { FRAMEWORK_REGISTRY } from "../src/registry.js";

describe("kit/npm/adapter", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "allure-kit-npm-adapter-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should describe the npm ecosystem", () => {
    expect(npmAdapter.id).toBe("npm");
    expect(npmAdapter.displayName).toBe("JS/TS");
    expect(npmAdapter.langAliases).toEqual(["js", "ts"]);
    expect(npmAdapter.manifestFiles).toEqual(["package.json"]);
    expect(npmAdapter.alwaysInstallPackages).toEqual(["allure"]);
    expect(npmAdapter.afterInstall).toBeUndefined();
    expect(npmAdapter.postInstallHint).toBeUndefined();
  });

  it("should expose the full FRAMEWORK_REGISTRY", () => {
    expect(npmAdapter.frameworkRegistry).toBe(FRAMEWORK_REGISTRY);
  });

  it("should detect the package manager for a real directory", async () => {
    await writeFile(join(tempDir, "yarn.lock"), "");

    const result = await npmAdapter.detectPackageManager(tempDir);

    expect(result).toBe("yarn");
  });

  it("should detect frameworks for a real directory", async () => {
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ devDependencies: { vitest: "^2.0.0" } }));

    const detected = await npmAdapter.detectFrameworks(tempDir);

    expect(detected).toHaveLength(1);
    expect(detected[0].framework.id).toBe("vitest");
  });

  it("should generate install and remove commands", () => {
    expect(npmAdapter.getInstallCommand("npm", ["allure"], true)).toBe("npm install --save-dev allure");
    expect(npmAdapter.getRemoveCommand("npm", ["allure"])).toBe("npm uninstall allure");
  });
});
