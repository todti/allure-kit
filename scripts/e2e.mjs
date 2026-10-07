#!/usr/bin/env node
// End-to-end check of the built CLI against real (temporary) projects with real npm installs:
//   npm run build && node scripts/e2e.mjs
// Used by .github/workflows/e2e.yml (nightly) so a broken release of allure, an adapter or a framework shows up here first.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../packages/cli/bin/allure-kit.js");
const failures = [];

// E2E_LATEST=1 swaps every pinned framework range for "latest": new projects install the newest majors, so the nightly
// run exercises both the ranges below and whatever has just been released.
const version = (range) => (process.env.E2E_LATEST ? "latest" : range);

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
  write(dir, "package.json", JSON.stringify({ name: "e2e-vitest", private: true, type: "module", devDependencies: { vitest: version("^3.0.0") } }));
  write(dir, "vitest.config.ts", 'import { defineConfig } from "vitest/config";\n\nexport default defineConfig({\n  test: {},\n});\n');
  run(dir, "npm", ["install", "--no-audit", "--no-fund"]);

  kit(dir, "init", "--yes");
  kit(dir, "demo", "--framework", "vitest");
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
const frameworkScenario = ({ id, devDependencies, files, command, demo = true }) =>
  scenario(`${id}: init wires the reporter and tests produce allure-results`, (dir) => {
    write(dir, "package.json", JSON.stringify({ name: `e2e-${id}`, private: true, devDependencies }));

    for (const [file, content] of Object.entries(files)) {
      write(dir, file, content);
    }

    run(dir, "npm", ["install", "--no-audit", "--no-fund"]);
    kit(dir, "init", "--yes");

    const doctor = JSON.parse(kit(dir, "doctor", "--json").output);

    assert(doctor.ok === true, `doctor reports no issues (got ${JSON.stringify(doctor.checks.filter((c) => c.level === "error"))})`);

    // The test comes from `allure-kit demo` where a template exists, so the templates are verified on real frameworks too.
    if (demo) {
      kit(dir, "demo", "--framework", id);
    }

    run(dir, command[0], command.slice(1));
    assert(existsSync(join(dir, "allure-results")), "allure-results were written");
  });

frameworkScenario({
  id: "jest",
  devDependencies: { jest: version("^29.7.0") },
  files: {
    "jest.config.js": "module.exports = {};\n",
  },
  command: ["npx", "jest"],
});

frameworkScenario({
  id: "mocha",
  devDependencies: { mocha: version("^10.8.2") },
  files: {
    ".mocharc.json": JSON.stringify({ spec: "test/*.js" }),
  },
  command: ["npx", "mocha"],
});

frameworkScenario({
  id: "playwright",
  devDependencies: { "@playwright/test": version("^1.50.0") },
  files: {
    "playwright.config.ts": 'import { defineConfig } from "@playwright/test";\n\nexport default defineConfig({\n  testDir: "./tests",\n});\n',
  },
  command: ["npx", "playwright", "test"],
});

frameworkScenario({
  id: "jasmine",
  devDependencies: { jasmine: version("^5.4.0") },
  files: {
    "spec/support/jasmine.json": JSON.stringify({ spec_dir: "spec", spec_files: ["**/*[sS]pec.js"], helpers: ["helpers/**/*.js"] }),
  },
  command: ["npx", "jasmine"],
});

frameworkScenario({
  id: "cucumberjs",
  devDependencies: { "@cucumber/cucumber": version("^11.0.0") },
  files: {
    "cucumber.js": "module.exports = { default: {} };\n",
  },
  command: ["npx", "cucumber-js"],
});

frameworkScenario({
  id: "codeceptjs",
  devDependencies: { codeceptjs: version("^3.6.0") },
  files: {
    "codecept.conf.js": 'exports.config = {\n  tests: "./*_test.js",\n  output: "./output",\n  helpers: { FileSystem: {} },\n  include: {},\n  name: "e2e",\n};\n',
    "sum_test.js": 'Feature("sum");\n\nScenario("add", ({ I }) => {\n  I.say("hello");\n});\n',
  },
  demo: false,
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
    inVenv(process.execPath, [cli, "demo", "--framework", id, "--lang", "python"]);

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
  files: {},
  command: ["pytest", "--alluredir=allure-results"],
});

pythonScenario({
  id: "behave",
  requirements: ["behave"],
  files: {},
  command: ["behave", "-f", "allure_behave.formatter:AllureFormatter", "-o", "allure-results"],
});

pythonScenario({
  id: "robotframework",
  requirements: ["robotframework"],
  files: {},
  command: ["robot", "--listener", "allure_robotframework:allure-results", "allure_demo.robot"],
});

pythonScenario({
  id: "pytest-bdd",
  requirements: ["pytest-bdd"],
  files: {},
  command: ["pytest", "--alluredir=allure-results"],
});

// Newman has no config file to patch: `init` only installs newman-reporter-allure and the user adds `-r allure`.
// A local server gives the collection a real request to run, so the scenario needs no network.
scenario("newman: init installs the reporter and `-r allure` produces allure-results", (dir) => {
  const port = 38000 + Math.floor(Math.random() * 1000);

  write(dir, "package.json", JSON.stringify({ name: "e2e-newman", private: true, devDependencies: { newman: version("^6.2.1") } }));
  write(
    dir,
    "collection.json",
    JSON.stringify({
      info: { name: "e2e", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
      item: [
        {
          name: "ping",
          event: [{ listen: "test", script: { exec: ['pm.test("status is 200", () => pm.response.to.have.status(200));'] } }],
          request: { method: "GET", url: `http://127.0.0.1:${port}/` },
        },
      ],
    }),
  );
  run(dir, "npm", ["install", "--no-audit", "--no-fund"]);
  kit(dir, "init", "--yes");
  assert(existsSync(join(dir, "node_modules", "newman-reporter-allure")), "newman-reporter-allure was installed");

  const server = spawn(
    process.execPath,
    ["-e", `require("node:http").createServer((req, res) => res.end("ok")).listen(${port}, "127.0.0.1")`],
    { stdio: "ignore" },
  );

  try {
    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
      const probe = spawnSync(process.execPath, ["-e", `require("node:net").connect(${port}, "127.0.0.1").on("connect", () => process.exit(0)).on("error", () => process.exit(1))`]);

      if (probe.status === 0) {
        break;
      }
    }

    run(dir, "npx", ["newman", "run", "collection.json", "-r", "allure"]);
  } finally {
    server.kill();
  }

  assert(existsSync(join(dir, "allure-results")), "allure-results were written");
});

// Cypress needs a ~200 MB binary we don't download here, so this checks what `init` can break without running a browser:
// the patched config must still load as CommonJS and its setupNodeEvents must register the Allure hooks.
scenario("cypress: init wires a CommonJS config that still loads", (dir) => {
  write(dir, "package.json", JSON.stringify({ name: "e2e-cypress", private: true, devDependencies: { cypress: version("^13.17.0") } }));
  write(
    dir,
    "cypress.config.js",
    'const { defineConfig } = require("cypress");\n\nmodule.exports = defineConfig({\n  e2e: {\n    setupNodeEvents(on, config) {\n      return config;\n    },\n  },\n});\n',
  );
  write(dir, "cypress/support/e2e.js", "// support\n");
  spawnSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: dir, env: { ...process.env, CYPRESS_INSTALL_BINARY: "0" }, encoding: "utf-8" });
  kit(dir, "init", "--yes");
  assert(readFileSync(join(dir, "cypress/support/e2e.js"), "utf-8").includes('import "allure-cypress"'), "the support file imports allure-cypress");

  // Newer Node versions tolerate a stray `import` in a CommonJS file; Node 18/20 and Cypress' own loader may not.
  assert(!/^import\s/m.test(readFileSync(join(dir, "cypress.config.js"), "utf-8")), "no ES import was injected into the CommonJS config");

  const registered = run(dir, process.execPath, [
    "-e",
    'const events = []; const config = require("./cypress.config.js"); config.e2e.setupNodeEvents((name) => events.push(name), { env: {}, projectRoot: process.cwd() }); console.log(events.join(","));',
  ]);

  assert(/task|after:|before:/.test(registered.output), `setupNodeEvents registered Allure hooks (got ${JSON.stringify(registered.output)})`);
});

// WebdriverIO can't run here without a browser session, so check what `init` controls: the reporter entry in the
// config (which must still load) and that the reporter package resolves.
scenario("wdio: init adds the allure reporter to a CommonJS config that still loads", (dir) => {
  write(dir, "package.json", JSON.stringify({ name: "e2e-wdio", private: true, devDependencies: { webdriverio: version("^9.0.0") } }));
  write(dir, "wdio.conf.js", "exports.config = {\n  runner: 'local',\n  specs: [],\n  reporters: ['spec'],\n};\n");
  run(dir, "npm", ["install", "--no-audit", "--no-fund"]);
  kit(dir, "init", "--yes");

  const doctor = JSON.parse(kit(dir, "doctor", "--json").output);

  assert(doctor.ok === true, `doctor reports no issues (got ${JSON.stringify(doctor.checks.filter((c) => c.level === "error"))})`);

  const loaded = run(dir, process.execPath, [
    "-e",
    'const { config } = require("./wdio.conf.js"); require.resolve("@wdio/allure-reporter"); console.log(JSON.stringify(config.reporters));',
  ]);

  assert(/allure/.test(loaded.output), `the reporters list contains allure (got ${loaded.output.trim()})`);
  assert(/spec/.test(loaded.output), "the existing reporter was kept");
});

// `config set` must never write a field Allure refuses ("The provided Allure config contains unsupported fields").
scenario("config set: every supported key yields a config that allure generate accepts", (dir) => {
  const values = {
    name: "Named report",
    output: "./out",
    resultsDir: "./allure-results",
    historyPath: "./history.jsonl",
    appendHistory: "true",
    historyLimit: "5",
    historyBaseUrl: "https://example.com/report/",
    environment: "e2e",
    port: "8080",
    "flakyDetection.historyDepth": "3",
    "flakyDetection.includePassedTests": "true",
  };

  write(dir, "package.json", JSON.stringify({ name: "e2e-config-keys", private: true }));
  write(
    dir,
    "allure-results/a-result.json",
    JSON.stringify({ uuid: "11111111-1111-1111-1111-111111111111", historyId: "a", name: "t", status: "passed", stage: "finished", start: 1, stop: 2, labels: [], steps: [], parameters: [], links: [] }),
  );
  run(dir, "npm", ["install", "--no-audit", "--no-fund", "allure"]);
  kit(dir, "init", "--yes");

  const listed = kit(dir, "config", "list").output;

  for (const [key, value] of Object.entries(values)) {
    kit(dir, "config", "set", key, value);

    const result = run(dir, "npx", ["allure", "generate"], { allowFailure: true });

    assert(result.status === 0, `allure generate failed after \`config set ${key} ${value}\`:\n${result.output.split("\n").slice(0, 3).join("\n")}`);
    kit(dir, "config", "unset", key);
  }

  assert(typeof listed === "string", "config list works");
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
