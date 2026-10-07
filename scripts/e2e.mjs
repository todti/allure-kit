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
  if (skip) {
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
