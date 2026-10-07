#!/usr/bin/env node
// End-to-end check of the built CLI against real (temporary) projects with real npm installs:
//   npm run build && node scripts/e2e.mjs
// Used by .github/workflows/e2e.yml (nightly) so a broken release of allure, an adapter or a framework shows up here first.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../packages/cli/bin/allure-kit.js");
const failures = [];

const run = (cwd, command, args, { allowFailure = false } = {}) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf-8", shell: process.platform === "win32", timeout: 10 * 60 * 1000 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}\n${output}`);
  }

  return { status: result.status, output };
};

const kit = (cwd, ...args) => run(cwd, process.execPath, [cli, ...args]);

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
};

const scenario = (name, body, { skip = false } = {}) => {
  if (skip || (process.env.E2E_ONLY && !name.startsWith(process.env.E2E_ONLY))) {
    console.log(`- ${name} (skipped)`);

    return;
  }

  // A ':' (or space) in the directory name would end up in PATH via node_modules/.bin and break npx.
  const dir = mkdtempSync(join(tmpdir(), `allure-kit-e2e-${name.split(":")[0].replace(/[^\w-]/g, "")}-`));
  const started = Date.now();

  try {
    body(dir);
    console.log(`✓ ${name} (${Math.round((Date.now() - started) / 1000)}s)`);
  } catch (error) {
    failures.push(name);
    console.error(`✗ ${name}\n${error.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const write = (dir, file, content) => {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), content);
};

scenario("vitest: init, doctor, run tests, generate report", (dir) => {
  write(dir, "package.json", JSON.stringify({ name: "e2e-vitest", private: true, type: "module", devDependencies: { vitest: "^3.0.0" } }));
  write(dir, "vitest.config.ts", 'import { defineConfig } from "vitest/config";\n\nexport default defineConfig({\n  test: {},\n});\n');
  write(dir, "sum.test.ts", 'import { expect, test } from "vitest";\n\ntest("sum", () => {\n  expect(1 + 1).toBe(2);\n});\n');
  run(dir, "npm", ["install", "--no-audit", "--no-fund"]);

  kit(dir, "init", "--yes");
  assert(existsSync(join(dir, "allurerc.json")), "allurerc.json was created");
  assert(readFileSync(join(dir, "vitest.config.ts"), "utf-8").includes("allure-vitest/reporter"), "vitest config was wired");

  const doctor = JSON.parse(kit(dir, "doctor", "--json").output);
  assert(doctor.ok === true, `doctor reports no issues (got ${JSON.stringify(doctor.checks.filter((c) => c.level === "error"))})`);

  run(dir, "npx", ["vitest", "run"]);
  assert(existsSync(join(dir, "allure-results")), "allure-results were written");

  run(dir, "npx", ["allure", "generate", "--output", "allure-report"]);
  assert(existsSync(join(dir, "allure-report", "index.html")), "the report was generated");
});

// Every framework follows the same path: install it, `init`, `doctor` is clean, run a trivial passing test, results appear.
const frameworkScenario = ({ id, devDependencies, files, command }) =>
  scenario(`${id}: init wires the reporter and tests produce allure-results`, (dir) => {
    write(dir, "package.json", JSON.stringify({ name: `e2e-${id}`, private: true, devDependencies }));

    for (const [file, content] of Object.entries(files)) {
      write(dir, file, content);
    }

    run(dir, "npm", ["install", "--no-audit", "--no-fund"]);
    kit(dir, "init", "--yes");

    const doctor = JSON.parse(kit(dir, "doctor", "--json").output);

    assert(doctor.ok === true, `doctor reports no issues (got ${JSON.stringify(doctor.checks.filter((c) => c.level === "error"))})`);

    run(dir, command[0], command.slice(1));
    assert(existsSync(join(dir, "allure-results")), "allure-results were written");
  });

frameworkScenario({
  id: "jest",
  devDependencies: { jest: "^29.7.0" },
  files: {
    "jest.config.js": "module.exports = {};\n",
    "sum.test.js": 'test("sum", () => {\n  expect(1 + 1).toBe(2);\n});\n',
  },
  command: ["npx", "jest"],
});

frameworkScenario({
  id: "mocha",
  devDependencies: { mocha: "^10.8.2" },
  files: {
    ".mocharc.json": JSON.stringify({ spec: "test/*.js" }),
    "test/sum.js": 'const assert = require("node:assert");\n\nit("sum", () => {\n  assert.equal(1 + 1, 2);\n});\n',
  },
  command: ["npx", "mocha"],
});

frameworkScenario({
  id: "playwright",
  devDependencies: { "@playwright/test": "^1.50.0" },
  files: {
    "playwright.config.ts": 'import { defineConfig } from "@playwright/test";\n\nexport default defineConfig({\n  testDir: "./tests",\n});\n',
    "tests/sum.spec.ts": 'import { expect, test } from "@playwright/test";\n\ntest("sum", () => {\n  expect(1 + 1).toBe(2);\n});\n',
  },
  command: ["npx", "playwright", "test"],
});

frameworkScenario({
  id: "jasmine",
  devDependencies: { jasmine: "^5.4.0" },
  files: {
    "spec/support/jasmine.json": JSON.stringify({ spec_dir: "spec", spec_files: ["**/*[sS]pec.js"], helpers: ["helpers/**/*.js"] }),
    "spec/sum.spec.js": 'describe("suite", () => {\n  it("sum", () => {\n    expect(1 + 1).toBe(2);\n  });\n});\n',
  },
  command: ["npx", "jasmine"],
});

frameworkScenario({
  id: "cucumberjs",
  devDependencies: { "@cucumber/cucumber": "^11.0.0" },
  files: {
    "cucumber.js": "module.exports = { default: {} };\n",
    "features/sum.feature": "Feature: sum\n  Scenario: add\n    Given a number\n",
    "features/steps.js": 'const { Given } = require("@cucumber/cucumber");\n\nGiven("a number", function () {});\n',
  },
  command: ["npx", "cucumber-js"],
});

frameworkScenario({
  id: "codeceptjs",
  devDependencies: { codeceptjs: "^3.6.0" },
  files: {
    "codecept.conf.js": 'exports.config = {\n  tests: "./*_test.js",\n  output: "./output",\n  helpers: { FileSystem: {} },\n  include: {},\n  name: "e2e",\n};\n',
    "sum_test.js": 'Feature("sum");\n\nScenario("add", ({ I }) => {\n  I.say("hello");\n});\n',
  },
  command: ["npx", "codeceptjs", "run"],
});

// Python: a throwaway virtualenv so `pip install` (run by `init`) never touches the machine's Python.
const pythonScenario = ({ id, requirements, files, command, extraAssert }) =>
  scenario(`${id}: init declares the adapter and the framework command produces allure-results`, (dir) => {
    const bin = join(dir, ".venv", process.platform === "win32" ? "Scripts" : "bin");

    write(dir, "requirements.txt", `${requirements.join("\n")}\n`);

    for (const [file, content] of Object.entries(files)) {
      write(dir, file, content);
    }

    run(dir, "python3", ["-m", "venv", ".venv"]);

    const env = { ...process.env, VIRTUAL_ENV: join(dir, ".venv"), PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}` };
    const inVenv = (cmd, args) => {
      const result = spawnSync(cmd, args, { cwd: dir, env, encoding: "utf-8", timeout: 10 * 60 * 1000 });

      if (result.status !== 0) {
        throw new Error(`${cmd} ${args.join(" ")} exited with ${result.status}\n${result.stdout}${result.stderr}`);
      }

      return `${result.stdout}${result.stderr}`;
    };

    inVenv("pip", ["install", "-q", "-r", "requirements.txt"]);
    inVenv(process.execPath, [cli, "init", "--yes", "--lang", "python"]);

    const doctor = JSON.parse(inVenv(process.execPath, [cli, "doctor", "--json", "--lang", "python"]));

    assert(doctor.ok === true, `doctor reports no issues (got ${JSON.stringify(doctor.checks.filter((c) => c.level === "error"))})`);
    assert(readFileSync(join(dir, "requirements.txt"), "utf-8").includes(`allure-${id}`), "the adapter was added to requirements.txt");

    inVenv(command[0], command.slice(1));
    assert(existsSync(join(dir, "allure-results")), "allure-results were written");
    extraAssert?.(dir);
  });

pythonScenario({
  id: "pytest",
  requirements: ["pytest"],
  files: { "test_sum.py": "def test_sum():\n    assert 1 + 1 == 2\n" },
  command: ["pytest", "--alluredir=allure-results"],
});

pythonScenario({
  id: "behave",
  requirements: ["behave"],
  files: {
    "features/sum.feature": "Feature: sum\n  Scenario: add\n    Given a number\n",
    "features/steps/steps.py": "from behave import given\n\n\n@given('a number')\ndef step_impl(context):\n    pass\n",
  },
  command: ["behave", "-f", "allure_behave.formatter:AllureFormatter", "-o", "allure-results"],
});

pythonScenario({
  id: "robotframework",
  requirements: ["robotframework"],
  files: { "sum.robot": "*** Test Cases ***\nAdd\n    Log    hello\n" },
  command: ["robot", "--listener", "allure_robotframework:allure-results", "sum.robot"],
});

pythonScenario({
  id: "pytest-bdd",
  requirements: ["pytest-bdd"],
  files: {
    "features/sum.feature": "Feature: sum\n  Scenario: add\n    Given a number\n",
    "test_sum.py": 'from pytest_bdd import given, scenarios\n\nscenarios("features/sum.feature")\n\n\n@given("a number")\ndef _():\n    pass\n',
  },
  command: ["pytest", "--alluredir=allure-results"],
});

scenario("migrate: Allure 2 project to Allure 3", (dir) => {
  write(
    dir,
    "package.json",
    JSON.stringify({ name: "e2e-migrate", private: true, scripts: { report: "allure serve allure-results" }, devDependencies: { "allure-commandline": "^2.30.0" } }),
  );

  kit(dir, "migrate", "--dry-run");
  assert(JSON.parse(readFileSync(join(dir, "package.json"), "utf-8")).scripts.report === "allure serve allure-results", "--dry-run changed nothing");

  kit(dir, "migrate");

  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));

  assert(pkg.scripts.report === "allure generate allure-results --open", "the script was rewritten");
  assert(!pkg.devDependencies["allure-commandline"] && pkg.devDependencies.allure, "allure-commandline was replaced by allure");
  assert(existsSync(join(dir, "allurerc.json")), "allurerc.json was created");
});

const javaSupported = existsSync(resolve(dirname(fileURLToPath(import.meta.url)), "../packages/java/src/index.ts"));

scenario("gradle: init wires the Allure plugin (no Gradle needed)", (dir) => {
  write(dir, "build.gradle.kts", 'plugins {\n    java\n}\n\nrepositories {\n    mavenCentral()\n}\n\ntasks.test {\n    useJUnitPlatform()\n}\n');

  kit(dir, "init", "--yes", "--lang", "java");
  assert(readFileSync(join(dir, "build.gradle.kts"), "utf-8").includes('id("io.qameta.allure")'), "the plugin was added");
  assert(JSON.parse(kit(dir, "doctor", "--json", "--lang", "java").output).ok === true, "doctor is happy afterwards");
}, { skip: !javaSupported });

if (failures.length > 0) {
  console.error(`\n${failures.length} scenario(s) failed: ${failures.join(", ")}`);
  process.exit(1);
}

console.log("\nAll e2e scenarios passed");
