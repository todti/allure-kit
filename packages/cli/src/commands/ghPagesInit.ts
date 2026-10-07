import * as console from "node:console";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { cwd as processCwd } from "node:process";

import {
  findExistingConfig,
  logHint,
  logInfo,
  logNewLine,
  logStep,
  logSuccess,
  logWarning,
  readAllureConfig,
  writeAllureConfig,
} from "@todti/allure-kit-core";
import { detectPackageManager } from "@todti/allure-kit-npm";
import { Command, Option, UsageError } from "clipanion";
import prompts from "prompts";

import { getInstallCommand, getPythonInstallCommand, getPythonTestCommand, getTestCommand } from "./ciShared.js";
import { resolveEcosystem } from "../ecosystems.js";

export { getInstallCommand, getTestCommand };

const WORKFLOW_FILE_RELATIVE_PATH = join(".github", "workflows", "allure-gh-pages.yml");


const DEFAULT_HISTORY_PATH = "./history.jsonl";

/**
 * Allure 3 keeps history in a single JSONL file named by `historyPath` in allurerc (there is no CLI flag for
 * `allure generate`), so the workflow caches that file between runs. Returns the path the workflow should cache.
 */
const ensureHistoryPath = async (workingDir: string, customConfigPath?: string): Promise<string> => {
  if (customConfigPath) {
    logHint(`Set "historyPath": "${DEFAULT_HISTORY_PATH}" in ${customConfigPath} so the cached history is used.`);

    return DEFAULT_HISTORY_PATH;
  }

  const existing = await findExistingConfig(workingDir);

  if (!existing) {
    logHint(`No allurerc found — run 'allure-kit init', then set historyPath to ${DEFAULT_HISTORY_PATH}.`);

    return DEFAULT_HISTORY_PATH;
  }

  if (existing.format === "mjs") {
    logHint(`Add historyPath: "${DEFAULT_HISTORY_PATH}" to your ESM allurerc so the cached history is used.`);

    return DEFAULT_HISTORY_PATH;
  }

  const config = await readAllureConfig(workingDir);

  if (!config) {
    return DEFAULT_HISTORY_PATH;
  }

  if (typeof config.historyPath === "string") {
    return config.historyPath;
  }

  await writeAllureConfig(workingDir, { ...config, historyPath: DEFAULT_HISTORY_PATH }, existing.format);
  logSuccess(`Set historyPath to ${DEFAULT_HISTORY_PATH} in allurerc`);

  return DEFAULT_HISTORY_PATH;
};

const buildWorkflowYaml = (params: {
  defaultBranch: string;
  packageManager: string;
  allureConfigPath?: string;
  testCommand: string;
  historyPath: string;
  python?: boolean;
}): string => {
  const installCommand = params.python ? getPythonInstallCommand(params.packageManager) : getInstallCommand(params.packageManager);
  const generateCommand = params.python ? "npx --yes allure generate" : "npx allure generate";
  const setupSteps = params.python
    ? `      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - uses: actions/setup-node@v6
        with:
          node-version: "20.x"`
    : `      - uses: actions/setup-node@v6
        with:
          node-version: "20.x"
          cache: "${params.packageManager}"`;
  const cachePath = params.historyPath.replace(/^\.\//, "");
  const allureConfigArgument = params.allureConfigPath ? ` --config=${params.allureConfigPath}` : "";

  return `name: Allure Report (GitHub Pages)

on:
  push:
    branches: [${params.defaultBranch}]
  workflow_dispatch: {}

permissions:
  contents: write

concurrency:
  group: allure-gh-pages-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
${setupSteps}
      - name: Install dependencies
        run: ${installCommand}
      - name: Restore Allure history
        uses: actions/cache/restore@v4
        with:
          path: ${cachePath}
          key: allure-history-\${{ github.run_id }}
          restore-keys: allure-history-
      - name: Run tests (produce allure-results)
        run: ${params.testCommand} || echo "TESTS_FAILED=1" >> "$GITHUB_ENV"
      - name: Generate Allure report
        run: ${generateCommand}${allureConfigArgument} --output ./allure-report
      - name: Save Allure history
        if: \${{ !cancelled() }}
        uses: actions/cache/save@v4
        with:
          path: ${cachePath}
          key: allure-history-\${{ github.run_id }}
      - name: Deploy to GitHub Pages (gh-pages branch)
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: \${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./allure-report
          publish_branch: gh-pages
      - name: Fail the job if tests failed
        if: env.TESTS_FAILED == '1'
        run: exit 1
`;
};

export class KitGhPagesInitCommand extends Command {
  static paths = [["gh-pages", "init"]];

  static usage = Command.Usage({
    description: "Initialize GitHub Pages deployment for Allure reports",
    details:
      "Creates a GitHub Actions workflow that runs your tests, generates an Allure report, and deploys it to the gh-pages branch.",
    examples: [
      ["gh-pages init", "Interactive setup"],
      ["gh-pages init --yes", "Create workflow without prompts"],
      ["gh-pages init --branch main", "Use custom default branch"],
      ["gh-pages init --config ./allurerc.mjs", "Use a specific Allure config file"],
    ],
  });

  lang = Option.String("--lang", {
    description: "Project language: js, ts, or python (default: auto-detect)",
  });

  yes = Option.Boolean("--yes,-y", false, {
    description: "Accept all defaults without prompts",
  });

  cwd = Option.String("--cwd", {
    description: "Working directory (default: current directory)",
  });

  defaultBranch = Option.String("--branch", {
    description: "Default branch to deploy from (default: main)",
  });

  allureConfig = Option.String("--config", {
    description: "Path to Allure config file to use in CI (optional)",
  });

  testCommand = Option.String("--test-command", {
    description: "Test command to run in CI (default: inferred from package manager)",
  });

  async execute() {
    const workingDir = typeof this.cwd === "string" ? this.cwd : processCwd();
    const targetWorkflowPath = resolve(workingDir, WORKFLOW_FILE_RELATIVE_PATH);

    console.log("\n  Allure GitHub Pages Setup\n");

    logStep("Preparing GitHub Pages workflow...");

    const ecosystem = await resolveEcosystem(workingDir, typeof this.lang === "string" ? this.lang : undefined);
    if (ecosystem.setupViaBuildFile) {
      throw new UsageError(
        `CI scaffolding isn't available for ${ecosystem.displayName} projects yet. With Gradle the report task is "./gradlew test allureReport", publishing build/reports/allure-report/allureReport/.`,
      );
    }

    const python = ecosystem.id !== "npm";
    const packageManager = python ? await ecosystem.detectPackageManager(workingDir) : await detectPackageManager(workingDir);
    const defaultBranch = typeof this.defaultBranch === "string" ? this.defaultBranch : "main";
    const defaultTestCommand = python
      ? getPythonTestCommand(packageManager, (await ecosystem.detectFrameworks(workingDir))[0]?.framework.id)
      : getTestCommand(packageManager);
    const selectedTestCommand = typeof this.testCommand === "string" ? this.testCommand : defaultTestCommand;

    if (existsSync(targetWorkflowPath)) {
      logWarning(`Workflow already exists: ${WORKFLOW_FILE_RELATIVE_PATH}`);

      if (this.yes !== true) {
        const { shouldOverwrite } = await prompts({
          type: "confirm",
          name: "shouldOverwrite",
          message: "Overwrite existing workflow?",
          initial: false,
        });

        if (!shouldOverwrite) {
          logInfo("Setup cancelled.");
          return;
        }
      }
    }

    if (this.yes !== true) {
      const response = await prompts([
        {
          type: "text",
          name: "branch",
          message: "Deploy from branch",
          initial: defaultBranch,
        },
        {
          type: "text",
          name: "testCommand",
          message: "Test command (must produce allure-results)",
          initial: selectedTestCommand,
        },
      ]);

      const branch = (response.branch as string | undefined) ?? defaultBranch;
      const testCommand = (response.testCommand as string | undefined) ?? selectedTestCommand;

      this.defaultBranch = branch;
      this.testCommand = testCommand;
    }

    const allureConfigPath = typeof this.allureConfig === "string" ? this.allureConfig : undefined;
    const resolvedBranch = typeof this.defaultBranch === "string" ? this.defaultBranch : defaultBranch;
    const resolvedTestCommand = typeof this.testCommand === "string" ? this.testCommand : selectedTestCommand;

    const historyPath = await ensureHistoryPath(workingDir, allureConfigPath);

    const workflowYaml = buildWorkflowYaml({
      defaultBranch: resolvedBranch,
      packageManager,
      allureConfigPath,
      testCommand: resolvedTestCommand,
      historyPath,
      python,
    });

    const workflowsDir = resolve(workingDir, ".github", "workflows");
    mkdirSync(workflowsDir, { recursive: true });

    await writeFile(targetWorkflowPath, workflowYaml, "utf-8");

    logSuccess(`Created ${WORKFLOW_FILE_RELATIVE_PATH}`);
    logNewLine();

    logStep("Next steps (GitHub repo settings):");
    logHint('Go to "Settings" → "Pages"');
    logHint('Set "Build and deployment" → "Source" to "Deploy from a branch"');
    logHint('Select branch "gh-pages" and folder "/"');
    logNewLine();

    logStep("How to use:");
    logHint("Commit and push the workflow to your repository");
    logHint("Wait for the GitHub Actions workflow to finish");
    logHint("Open your GitHub Pages URL to view the report");
    logNewLine();

    logStep("Notes:");
    logHint('If your tests do not generate "allure-results", update the workflow test command.');
    logHint('If you use a non-default Allure config, pass it via "--config".');
  }
}
