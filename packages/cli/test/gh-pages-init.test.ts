import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { KitGhPagesInitCommand } from "../src/commands/ghPagesInit.js";
import { detectPackageManager } from "../../npm/src/detect-package-manager.js";

vi.mock("../../npm/src/detect-package-manager.js", async () => {
  const actual = await vi.importActual<typeof import("../../npm/src/detect-package-manager.js")>(
    "../../npm/src/detect-package-manager.js",
  );

  return {
    ...actual,
    detectPackageManager: vi.fn(),
  };
});

describe("kit/gh-pages-init", () => {
  it("should create a gh-pages workflow in the target cwd", async () => {
    vi.mocked(detectPackageManager).mockResolvedValue("yarn");

    const tempDir = await mkdtemp(join(tmpdir(), "allure-kit-gh-pages-"));

    try {
      const command = new KitGhPagesInitCommand();
      command.cwd = tempDir;
      command.yes = true;

      await command.execute();

      const workflowPath = join(tempDir, ".github", "workflows", "allure-gh-pages.yml");
      const workflow = await readFile(workflowPath, "utf-8");

      expect(workflow).toContain("name: Allure Report (GitHub Pages)");
      expect(workflow).toContain("publish_branch: gh-pages");
      expect(workflow).toContain("run: yarn test");
      expect(workflow).toContain("branches: [main]");
      expect(workflow).toContain('|| echo "TESTS_FAILED=1" >> "$GITHUB_ENV"');
      expect(workflow).toContain("if: env.TESTS_FAILED == '1'");
      expect(workflow).toContain("uses: actions/cache/restore@v4");
      expect(workflow).toContain("uses: actions/cache/save@v4");
      expect(workflow).toContain("path: history.jsonl");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("should respect --branch, --config, and --test-command", async () => {
    vi.mocked(detectPackageManager).mockResolvedValue("npm");

    const tempDir = await mkdtemp(join(tmpdir(), "allure-kit-gh-pages-"));

    try {
      const command = new KitGhPagesInitCommand();
      command.cwd = tempDir;
      command.yes = true;
      command.defaultBranch = "develop";
      command.allureConfig = "./allurerc.mjs";
      command.testCommand = "npm run test:e2e";

      await command.execute();

      const workflowPath = join(tempDir, ".github", "workflows", "allure-gh-pages.yml");
      const workflow = await readFile(workflowPath, "utf-8");

      expect(workflow).toContain("branches: [develop]");
      expect(workflow).toContain("run: npm run test:e2e");
      expect(workflow).toContain("npx allure generate --config=./allurerc.mjs --output ./allure-report");
      expect(workflow).toContain("run: npm ci");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("should enable historyPath in an existing JSON allurerc and cache that file", async () => {
    vi.mocked(detectPackageManager).mockResolvedValue("npm");

    const tempDir = await mkdtemp(join(tmpdir(), "allure-kit-gh-pages-"));

    try {
      await writeFile(join(tempDir, "allurerc.json"), JSON.stringify({ name: "Report", historyPath: "./h/history.jsonl" }));

      const command = new KitGhPagesInitCommand();
      command.cwd = tempDir;
      command.yes = true;

      await command.execute();

      const workflow = await readFile(join(tempDir, ".github", "workflows", "allure-gh-pages.yml"), "utf-8");

      expect(workflow).toContain("path: h/history.jsonl");

      await writeFile(join(tempDir, "allurerc.json"), JSON.stringify({ name: "Report" }));
      await command.execute();

      expect(JSON.parse(await readFile(join(tempDir, "allurerc.json"), "utf-8")).historyPath).toBe("./history.jsonl");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
