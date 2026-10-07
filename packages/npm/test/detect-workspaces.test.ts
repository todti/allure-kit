import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { detectWorkspaceFrameworks } from "../src/detect-workspaces.js";

describe("npm/detect-workspaces", () => {
  let dir: string;

  const pkg = async (relDir: string, content: object) => {
    await mkdir(join(dir, relDir), { recursive: true });
    await writeFile(join(dir, relDir, "package.json"), JSON.stringify(content));
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "allure-kit-workspaces-"));
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("finds frameworks in `packages/*` workspaces and skips packages without one", async () => {
    await pkg(".", { workspaces: ["packages/*"] });
    await pkg("packages/web", { devDependencies: { "@playwright/test": "^1.50.0" } });
    await pkg("packages/api", { devDependencies: { vitest: "^2.0.0" } });
    await pkg("packages/docs", { dependencies: { react: "^18.0.0" } });

    const result = await detectWorkspaceFrameworks(dir);

    expect(result.map((entry) => entry.dir)).toEqual(["packages/api", "packages/web"]);
    expect(result[0].frameworks[0].framework.id).toBe("vitest");
  });

  it("reads the yarn `workspaces.packages` form and pnpm-workspace.yaml", async () => {
    await pkg(".", { workspaces: { packages: ["apps/e2e"] } });
    await pkg("apps/e2e", { devDependencies: { cypress: "^13.0.0" } });
    await writeFile(join(dir, "pnpm-workspace.yaml"), "packages:\n  - 'libs/*'\n  - '!libs/legacy'\n");
    await pkg("libs/unit", { devDependencies: { jest: "^29.0.0" } });

    expect((await detectWorkspaceFrameworks(dir)).map((entry) => entry.dir)).toEqual(["apps/e2e", "libs/unit"]);
  });

  it("returns nothing for a project without workspaces", async () => {
    await pkg(".", { devDependencies: { vitest: "^2.0.0" } });

    expect(await detectWorkspaceFrameworks(dir)).toEqual([]);
  });
});
