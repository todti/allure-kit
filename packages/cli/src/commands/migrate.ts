import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd as processCwd } from "node:process";

import {
  buildAllureConfig,
  executeCommand,
  findExistingConfig,
  logError,
  logHint,
  logInfo,
  logNewLine,
  logStep,
  logSuccess,
  logWarning,
  print,
  writeAllureConfig,
} from "@todti/allure-kit-core";
import { detectPackageManager, getInstallCommand, getRemoveCommand } from "@todti/allure-kit-npm";
import { Command, Option } from "clipanion";

import { migrateGradle, migratePom } from "../migrate-java.js";
import { migrateScripts } from "../migrate-scripts.js";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  [key: string]: unknown;
}

export class KitMigrateCommand extends Command {
  static paths = [["migrate"]];

  static usage = Command.Usage({
    description: "Migrate a project from Allure 2 to Allure 3 (JS/TS: allure-commandline; Java: allure-junit5)",
    details:
      'Replaces the "allure-commandline" package with "allure", rewrites package.json scripts that use Allure 2 commands or flags ("allure serve", "--clean"), and creates an allurerc if there is none. Anything it can\'t rewrite safely is listed for manual review.',
    examples: [
      ["migrate --dry-run", "Show what would change"],
      ["migrate", "Apply the migration"],
    ],
  });

  dryRun = Option.Boolean("--dry-run", false, { description: "Show what would change without touching any files" });

  cwd = Option.String("--cwd", { description: "Working directory (default: current directory)" });

  /** Java builds: allure-junit5 → allure-jupiter. Returns false when the directory has no Maven/Gradle build file. */
  private async migrateJava(workingDir: string, dryRun: boolean): Promise<boolean> {
    const targets = [
      { file: "pom.xml", migrate: migratePom },
      { file: "build.gradle.kts", migrate: migrateGradle },
      { file: "build.gradle", migrate: migrateGradle },
    ];
    let found = false;

    for (const { file, migrate } of targets) {
      let text: string;

      try {
        text = await readFile(resolve(workingDir, file), "utf-8");
      } catch {
        continue;
      }

      found = true;
      logStep(file);

      const { content, changes, warnings } = migrate(text);

      if (changes.length === 0) {
        logInfo("Nothing to migrate (no allure-junit5 artifacts)");
      }

      for (const change of changes) {
        logInfo(`${dryRun ? "would change " : "changed "}${change}`);
      }

      if (changes.length > 0 && !dryRun) {
        await writeFile(resolve(workingDir, file), content, "utf-8");
      }

      for (const warning of warnings) {
        logWarning(warning);
      }
    }

    return found;
  }

  async execute() {
    const workingDir = typeof this.cwd === "string" ? this.cwd : processCwd();
    const dryRun = this.dryRun === true;
    const packageJsonPath = resolve(workingDir, "package.json");
    let raw: string;

    print(`\n  Allure 2 → 3 Migration${dryRun ? " (dry run — nothing will be changed)" : ""}\n`);

    try {
      raw = await readFile(packageJsonPath, "utf-8");
    } catch {
      if (await this.migrateJava(workingDir, dryRun)) {
        return;
      }

      logError("No package.json, pom.xml or build.gradle(.kts) found — nothing to migrate.");

      return;
    }

    const pkg = JSON.parse(raw) as PackageJson;
    const hasLegacy = Boolean(pkg.devDependencies?.["allure-commandline"] ?? pkg.dependencies?.["allure-commandline"]);
    const { scripts, changes, warnings } = migrateScripts(pkg.scripts ?? {});

    if (!hasLegacy && changes.length === 0 && warnings.length === 0) {
      logSuccess("Nothing to migrate: no allure-commandline and no Allure 2 commands in package.json scripts.");

      return;
    }

    const packageManager = await detectPackageManager(workingDir);

    logStep("Packages");

    if (hasLegacy) {
      const isDev = Boolean(pkg.devDependencies?.["allure-commandline"]);
      const removeCommand = getRemoveCommand(packageManager, ["allure-commandline"]);
      const installCommand = getInstallCommand(packageManager, ["allure"], isDev);

      if (dryRun) {
        logInfo(`would run: ${removeCommand}`);
        logInfo(`would run: ${installCommand}`);
      } else {
        for (const command of [removeCommand, installCommand]) {
          const result = await executeCommand(command, workingDir);

          if (result.exitCode !== 0) {
            logError(`${command} failed:`);
            print(result.stderr);

            return;
          }
        }

        logSuccess("Replaced allure-commandline with allure");
      }
    } else {
      logInfo("allure-commandline is not installed — packages left as they are");
    }

    logStep("package.json scripts");

    if (changes.length === 0) {
      logInfo("No scripts needed rewriting");
    }

    for (const change of changes) {
      logInfo(`${dryRun ? "would rewrite " : "rewrote "}${change}`);
    }

    if (changes.length > 0 && !dryRun) {
      // The package manager may have rewritten package.json above, so re-read it before saving the scripts.
      const current = JSON.parse(await readFile(packageJsonPath, "utf-8")) as PackageJson;
      const indent = /^\{\n( +)"/.exec(raw)?.[1].length ?? 2;

      current.scripts = scripts;
      await writeFile(packageJsonPath, `${JSON.stringify(current, null, indent)}\n`, "utf-8");
    }

    logStep("Config");

    if (await findExistingConfig(workingDir)) {
      logInfo("allurerc already exists");
    } else if (dryRun) {
      logInfo("would create allurerc.json with the awesome report plugin");
    } else {
      await writeAllureConfig(workingDir, buildAllureConfig("Allure Report", ["awesome"]), "json");
      logSuccess("created allurerc.json");
    }

    if (warnings.length > 0) {
      logNewLine();
      logStep("Review manually");

      for (const warning of warnings) {
        logWarning(warning);
      }
    }

    logNewLine();
    logStep("Also keep in mind:");
    logHint("History: Allure 2 copied the previous report's history folder; Allure 3 uses historyPath in allurerc (JSONL file).");
    logHint("Run 'allure-kit doctor' afterwards to check adapters and config.");
  }
}
