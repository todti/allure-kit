import * as console from "node:console";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd as processCwd } from "node:process";

import { logError, logHint, logInfo, logNewLine, logStep, logSuccess, logWarning } from "@todti/allure-kit-core";
import { Command, Option, UsageError } from "clipanion";

import { resolveEcosystem } from "../ecosystems.js";

interface DemoTemplate {
  /** Files to create, relative to the project root. File names match each framework's default test discovery. */
  files: Record<string, string>;
  /** How to run the demo so that it writes `allure-results`. */
  run: string;
}

/** The same minimal passing tests the end-to-end suite runs for every framework (scripts/e2e.mjs). */
export const DEMO_TEMPLATES: Record<string, DemoTemplate> = {
  vitest: {
    files: { "allure-demo.test.ts": 'import { expect, test } from "vitest";\n\ntest("allure demo", () => {\n  expect(1 + 1).toBe(2);\n});\n' },
    run: "npx vitest run",
  },
  jest: {
    files: { "allure-demo.test.js": 'test("allure demo", () => {\n  expect(1 + 1).toBe(2);\n});\n' },
    run: "npx jest",
  },
  mocha: {
    files: { "test/allure-demo.js": 'const assert = require("node:assert");\n\nit("allure demo", () => {\n  assert.equal(1 + 1, 2);\n});\n' },
    run: "npx mocha",
  },
  playwright: {
    files: {
      "tests/allure-demo.spec.ts": 'import { expect, test } from "@playwright/test";\n\ntest("allure demo", () => {\n  expect(1 + 1).toBe(2);\n});\n',
    },
    run: "npx playwright test",
  },
  jasmine: {
    files: { "spec/allure-demo.spec.js": 'describe("allure demo", () => {\n  it("adds numbers", () => {\n    expect(1 + 1).toBe(2);\n  });\n});\n' },
    run: "npx jasmine",
  },
  cucumberjs: {
    files: {
      "features/allure-demo.feature": "Feature: Allure demo\n  Scenario: A passing scenario\n    Given a number\n",
      "features/step_definitions/allure-demo.js": 'const { Given } = require("@cucumber/cucumber");\n\nGiven("a number", function () {});\n',
    },
    run: "npx cucumber-js",
  },
  pytest: {
    files: { "tests/test_allure_demo.py": "def test_allure_demo():\n    assert 1 + 1 == 2\n" },
    run: "pytest --alluredir=allure-results",
  },
  "pytest-bdd": {
    files: {
      "features/allure_demo.feature": "Feature: Allure demo\n  Scenario: A passing scenario\n    Given a number\n",
      "tests/test_allure_demo_bdd.py":
        'from pytest_bdd import given, scenarios\n\nscenarios("../features/allure_demo.feature")\n\n\n@given("a number")\ndef _():\n    pass\n',
    },
    run: "pytest --alluredir=allure-results",
  },
  behave: {
    files: {
      "features/allure_demo.feature": "Feature: Allure demo\n  Scenario: A passing scenario\n    Given a number\n",
      "features/steps/allure_demo_steps.py": "from behave import given\n\n\n@given('a number')\ndef step_impl(context):\n    pass\n",
    },
    run: "behave -f allure_behave.formatter:AllureFormatter -o allure-results",
  },
  robotframework: {
    files: { "allure_demo.robot": "*** Test Cases ***\nAllure demo\n    Log    hello\n" },
    run: "robot --listener allure_robotframework:allure-results allure_demo.robot",
  },
  junit5: {
    files: {
      "src/test/java/AllureDemoTest.java":
        'import static org.junit.jupiter.api.Assertions.assertEquals;\n\nimport org.junit.jupiter.api.Test;\n\nclass AllureDemoTest {\n    @Test\n    void allureDemo() {\n        assertEquals(2, 1 + 1);\n    }\n}\n',
    },
    run: "./gradlew test allureReport   # Maven: mvn test",
  },
};

export class KitDemoCommand extends Command {
  static paths = [["demo"]];

  static usage = Command.Usage({
    description: "Create a minimal passing test so you can see an Allure report straight away",
    details: `Writes one tiny passing test for each detected test framework (or the one given with --framework), named so the framework finds it by default, and prints how to run it. Existing files are never overwritten unless you pass --force. Supported: ${Object.keys(DEMO_TEMPLATES).join(", ")}.`,
    examples: [
      ["demo", "Create a demo test for every detected framework"],
      ["demo --framework pytest", "Create the pytest demo only"],
      ["demo --dry-run", "List the files without writing them"],
    ],
  });

  framework = Option.String("--framework", { description: "Create the demo for this framework only (e.g. vitest, pytest, junit5)" });

  lang = Option.String("--lang", { description: "Project language: js, ts, python or java (default: auto-detect)" });

  force = Option.Boolean("--force", false, { description: "Overwrite files that already exist" });

  dryRun = Option.Boolean("--dry-run", false, { description: "List the files that would be created without writing them" });

  cwd = Option.String("--cwd", { description: "Working directory (default: current directory)" });

  async execute() {
    const workingDir = typeof this.cwd === "string" ? this.cwd : processCwd();
    const dryRun = this.dryRun === true;

    console.log("\n  Allure demo\n");

    const ecosystem = await resolveEcosystem(workingDir, typeof this.lang === "string" ? this.lang : undefined);
    let frameworkIds: string[];

    if (typeof this.framework === "string") {
      if (!DEMO_TEMPLATES[this.framework]) {
        throw new UsageError(
          `No demo for ${JSON.stringify(this.framework)}. Available: ${Object.keys(DEMO_TEMPLATES).join(", ")}.`,
        );
      }

      frameworkIds = [this.framework];
    } else {
      frameworkIds = (await ecosystem.detectFrameworks(workingDir)).map(({ framework }) => framework.id);
    }

    if (frameworkIds.length === 0) {
      logError("No test framework detected. Run 'allure-kit init' first, or pass --framework.");

      return;
    }

    const runnable: string[] = [];

    for (const id of frameworkIds) {
      const template = DEMO_TEMPLATES[id];

      if (!template) {
        logWarning(`No demo template for ${id} yet.`);
        continue;
      }

      logStep(id);

      for (const [file, content] of Object.entries(template.files)) {
        const target = resolve(workingDir, file);

        if (existsSync(target) && this.force !== true) {
          logWarning(`${file} already exists — left untouched (use --force to overwrite)`);
          continue;
        }

        if (dryRun) {
          logInfo(`would create ${file}`);
          continue;
        }

        mkdirSync(dirname(target), { recursive: true });
        await writeFile(target, content, "utf-8");
        logSuccess(`created ${file}`);
      }

      runnable.push(`${id}: ${template.run}`);
    }

    if (runnable.length === 0) {
      return;
    }

    logNewLine();
    logStep("Run it, then build the report:");

    for (const line of runnable) {
      logHint(line);
    }

    logHint(ecosystem.id === "java" ? "(the Gradle plugin builds the report itself)" : "npx allure generate && npx allure open");
  }
}
