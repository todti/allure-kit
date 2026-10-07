import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";
import { describe, expect, it, vi } from "vitest";

import { KitGitlabInitCommand } from "../src/commands/gitlabInit.js";
import { detectPackageManager } from "../../npm/src/detect-package-manager.js";

vi.mock("../../npm/src/detect-package-manager.js", async () => ({
  ...(await vi.importActual<typeof import("../../npm/src/detect-package-manager.js")>(
    "../../npm/src/detect-package-manager.js",
  )),
  detectPackageManager: vi.fn(),
}));

const run = async (setup?: (dir: string) => Promise<void>, configure?: (c: KitGitlabInitCommand) => void) => {
  vi.mocked(detectPackageManager).mockResolvedValue("npm");
  const dir = await mkdtemp(join(tmpdir(), "allure-kit-gitlab-"));
  await setup?.(dir);
  const command = new KitGitlabInitCommand();
  command.cwd = dir;
  command.yes = true;
  configure?.(command);
  await command.execute();

  return dir;
};

describe("kit/gitlab-init", () => {
  it("creates the job file and a .gitlab-ci.yml that includes it", async () => {
    const dir = await run();

    try {
      const job = await readFile(join(dir, ".gitlab", "allure-report.gitlab-ci.yml"), "utf-8");

      expect(job).toContain("npx allure gitlab ./allure-results");
      expect(job).toContain("- npm test || TESTS_FAILED=1");
      expect(job).toContain("history.jsonl");
      expect(await readFile(join(dir, ".gitlab-ci.yml"), "utf-8")).toContain(
        "local: .gitlab/allure-report.gitlab-ci.yml",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not touch an existing .gitlab-ci.yml and honors options", async () => {
    const dir = await run(
      (d) => writeFile(join(d, ".gitlab-ci.yml"), "stages: [test]\n"),
      (c) => {
        c.image = "node:22";
        c.allureConfig = "./allurerc.mjs";
        c.testCommand = "npm run e2e";
      },
    );

    try {
      expect(await readFile(join(dir, ".gitlab-ci.yml"), "utf-8")).toBe("stages: [test]\n");

      const job = await readFile(join(dir, ".gitlab", "allure-report.gitlab-ci.yml"), "utf-8");

      expect(job).toContain("image: node:22");
      expect(job).toContain("--config ./allurerc.mjs");
      expect(job).toContain("npm run e2e || TESTS_FAILED=1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("scaffolds a Python job: python image, Node from NodeSource, the project's installer and framework command", async () => {
    const dir = await run(
      (d) => writeFile(join(d, "requirements.txt"), "pytest\nallure-pytest\n"),
      () => undefined,
    );

    try {
      const job = parseYaml(await readFile(join(dir, ".gitlab", "allure-report.gitlab-ci.yml"), "utf-8"));
      const script: string[] = job["allure-report"].script;

      expect(job["allure-report"].image).toBe("python:3.12");
      expect(script).toContain("curl -fsSL https://deb.nodesource.com/setup_20.x | bash -");
      expect(script.indexOf("apt-get install -y -qq nodejs")).toBeLessThan(script.indexOf("pip install -r requirements.txt"));
      expect(script).toContain("pytest --alluredir=allure-results || TESTS_FAILED=1");
      expect(script.some((line) => line.startsWith("npx --yes allure gitlab ./allure-results"))).toBe(true);
      expect(script.at(-1)).toBe('test -z "$TESTS_FAILED"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
