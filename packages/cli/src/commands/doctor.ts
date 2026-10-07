import * as console from "node:console";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd as processCwd } from "node:process";

import {
  findExistingConfig,
  findReportPluginById,
  logError,
  logHint,
  logInfo,
  logNewLine,
  logStep,
  logSuccess,
  logWarning,
  readAllureConfig,
} from "@todti/allure-kit-core";
import {
  checkFrameworkWiring,
  detectFrameworks,
  detectInstalledAllurePackages,
  detectPackageManager,
  FRAMEWORK_REGISTRY,
} from "@todti/allure-kit-npm";
import { Command, Option } from "clipanion";

import {
  checkAdapterCompat,
  checkAllureCliGeneration,
  checkAllureJsVersionAlignment,
  checkFrameworkCaveats,
  checkConfigCombinations,
  checkTestPlanEnv,
  type DoctorFinding,
} from "../doctor-checks.js";

const moduleExists = async (moduleName: string, cwd: string): Promise<boolean> => {
  try {
    const modulePath = resolve(cwd, "node_modules", moduleName);

    await access(modulePath);

    return true;
  } catch {
    return false;
  }
};

type CheckLevel = "success" | "info" | "warning" | "error";

interface CheckEntry {
  step: string;
  level: CheckLevel;
  message: string;
  hint?: string;
}

const LOGGERS: Record<CheckLevel, (message: string) => void> = {
  success: logSuccess,
  info: logInfo,
  warning: logWarning,
  error: logError,
};

/** Collects every check result; prints as it goes unless the output is JSON. */
const createReporter = (json: boolean) => {
  const entries: CheckEntry[] = [];
  let currentStep = "";

  return {
    entries,
    step(message: string) {
      currentStep = message.replace(/\.\.\.$/, "");

      if (!json) {
        logStep(message);
      }
    },
    add(level: CheckLevel, message: string) {
      entries.push({ step: currentStep, level, message });

      if (!json) {
        LOGGERS[level](message);
      }
    },
    hint(message: string) {
      const last = entries[entries.length - 1];

      if (last) {
        last.hint = message;
      }

      if (!json) {
        logHint(message);
      }
    },
  };
};

export class KitDoctorCommand extends Command {
  static paths = [["doctor"]];

  static usage = Command.Usage({
    description: "Diagnose your Allure 3 configuration",
    examples: [
      ["doctor", "Run all diagnostic checks"],
      ["doctor --json --strict", "Machine-readable output; non-zero exit code when issues are found"],
    ],
  });

  cwd = Option.String("--cwd", {
    description: "Working directory (default: current directory)",
  });

  json = Option.Boolean("--json", false, {
    description: "Print the results as JSON instead of text",
  });

  strict = Option.Boolean("--strict", false, {
    description: "Exit with code 1 when issues are found",
  });

  async execute() {
    const workingDir = this.cwd ?? processCwd();
    let issuesFound = 0;

    const report = createReporter(this.json === true);

    if (this.json !== true) {
      console.log("\n  Allure Doctor\n");
    }

    report.step("Checking environment...");

    const packageManager = await detectPackageManager(workingDir);

    report.add("success", `Package manager: ${packageManager}`);

    report.step("Checking config file...");

    const existingConfig = await findExistingConfig(workingDir);

    if (!existingConfig) {
      report.add("error", "No allurerc config file found");
      report.hint("Run 'allure-kit init' to create one");
      issuesFound++;
    } else {
      report.add("success", `Config found: ${existingConfig.path} (${existingConfig.format})`);

      const config = await readAllureConfig(workingDir);

      if (config) {
        const pluginCount = Object.keys(config.plugins ?? {}).length;

        if (pluginCount === 0) {
          report.add("warning", "No plugins configured (the 'awesome' plugin will be used by default)");
        } else {
          report.add("success", `${pluginCount} plugin(s) configured`);
        }

        if (config.output) {
          report.add("info", `Output directory: ${config.output}`);
        }
      } else if (existingConfig.format === "mjs") {
        report.add("info", "ESM config detected — skipping content validation (dynamic imports are not analyzed)");
      }
    }

    report.step("Checking test framework adapters...");

    const detectedFrameworks = await detectFrameworks(workingDir);

    if (detectedFrameworks.length === 0) {
      report.add("warning", "No test frameworks detected in package.json");
    } else {
      for (const { framework } of detectedFrameworks) {
        const adapterInstalled = await moduleExists(framework.adapterPackage, workingDir);

        if (!adapterInstalled) {
          report.add("error", `${framework.displayName} detected but ${framework.adapterPackage} is not installed`);
          report.hint(`Run: allure-kit init or install ${framework.adapterPackage} manually`);
          issuesFound++;
          continue;
        }

        report.add("success", `${framework.displayName} → ${framework.adapterPackage} installed`);

        const wiring = await checkFrameworkWiring(workingDir, framework);

        if (wiring === "wired") {
          report.add("success", `${framework.displayName} reporter is wired into its config`);
        } else if (wiring === "not-wired") {
          report.add("error", `${framework.displayName} adapter is installed but the reporter isn't wired into its config`);
          report.hint(framework.setupHint);
          issuesFound++;
        } else if (wiring === "no-config-file") {
          report.add("warning", `${framework.displayName} config file not found — can't verify the reporter is wired`);
        }
      }
    }

    report.step("Checking Allure CLI...");

    const allureCliInstalled = await moduleExists("allure", workingDir);

    if (allureCliInstalled) {
      report.add("success", "allure CLI package is installed");
    } else {
      report.add("error", "allure CLI package is not installed");
      report.hint("Run: allure-kit init");
      issuesFound++;
    }

    report.step("Checking installed plugin packages...");

    const config = await readAllureConfig(workingDir);

    if (config?.plugins) {
      for (const pluginId of Object.keys(config.plugins)) {
        const pluginDescriptor = findReportPluginById(pluginId);
        const packageName = pluginDescriptor?.packageName ?? `@allurereport/plugin-${pluginId}`;
        const isInstalled = await moduleExists(packageName, workingDir);

        if (isInstalled) {
          report.add("success", `Plugin package ${packageName} is installed`);
        } else {
          report.add("warning", `Plugin "${pluginId}" is in config but ${packageName} may not be installed`);
          report.hint("The allure CLI bundles built-in plugins, so this might be fine");
        }
      }
    }

    report.step("Checking compatibility...");

    const compatFindings = [
      ...(await checkAdapterCompat(workingDir)),
      ...(await checkAllureCliGeneration(workingDir)),
      ...(await checkAllureJsVersionAlignment(workingDir)),
      ...(existingConfig ? checkConfigCombinations(await readFile(existingConfig.path, "utf-8")) : []),
      ...(await checkTestPlanEnv(process.env, workingDir)),
      ...checkFrameworkCaveats(detectedFrameworks.map(({ framework }) => framework.id)),
    ];

    if (compatFindings.length === 0) {
      report.add("success", "No compatibility problems found");
    } else {

      for (const { level, message, hint } of compatFindings) {
        report.add(level, message);

        if (hint) {
          report.hint(hint);
        }

        if (level === "error") {
          issuesFound++;
        }
      }
    }

    report.step("Checking for unused adapters...");

    const allurePackages = await detectInstalledAllurePackages(workingDir);
    const adapterPackages = allurePackages.filter((pkg) =>
      FRAMEWORK_REGISTRY.some((framework) => framework.adapterPackage === pkg.name),
    );

    for (const adapterPkg of adapterPackages) {
      const matchingFramework = FRAMEWORK_REGISTRY.find((framework) => framework.adapterPackage === adapterPkg.name);

      if (matchingFramework) {
        const frameworkDetected = detectedFrameworks.some((detected) => detected.framework.id === matchingFramework.id);

        if (!frameworkDetected) {
          report.add("warning", 
            `${adapterPkg.name} is installed but ${matchingFramework.packageName} was not found in dependencies`,
          );
        }
      }
    }

    if (this.json === true) {
      this.context.stdout.write(`${JSON.stringify({ ok: issuesFound === 0, issues: issuesFound, checks: report.entries }, null, 2)}\n`);
    } else {
      logNewLine();

      if (issuesFound === 0) {
        logSuccess("No issues found. Your Allure setup looks good!");
      } else {
        logWarning(`Found ${issuesFound} issue(s). See above for details.`);
      }

      logNewLine();
    }

    return this.strict === true && issuesFound > 0 ? 1 : 0;
  }
}
