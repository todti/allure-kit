import * as console from "node:console";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd as processCwd } from "node:process";

import {
  type EcosystemAdapter,
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
  detectWorkspaceFrameworks,
  FRAMEWORK_REGISTRY,
  npmAdapter,
} from "@todti/allure-kit-npm";
import { readProjectPythonDependencies } from "@todti/allure-kit-python";
import { Command, Option } from "clipanion";

import { resolveEcosystem } from "../ecosystems.js";

import {
  checkAdapterCompat,
  checkAllureCliGeneration,
  checkAllureJsVersionAlignment,
  checkFrameworkCaveats,
  checkPluginImports,
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

type Reporter = ReturnType<typeof createReporter>;

const checkNpmEcosystem = async (workingDir: string, report: Reporter) => {
  let issues = 0;

    report.step("Checking test framework adapters...");

    const detectedFrameworks = await detectFrameworks(workingDir);

    if (detectedFrameworks.length === 0) {
      report.add("warning", "No test frameworks detected in package.json");

      const workspaces = await detectWorkspaceFrameworks(workingDir);

      if (workspaces.length > 0) {
        report.hint(
          workspaces
            .map(({ dir, frameworks }) => `${dir} uses ${frameworks.map(({ framework }) => framework.displayName).join(", ")} — run: allure-kit doctor --cwd ${dir}`)
            .join("\n    "),
        );
      }
    } else {
      for (const { framework } of detectedFrameworks) {
        const adapterInstalled = await moduleExists(framework.adapterPackage, workingDir);

        if (!adapterInstalled) {
          report.add("error", `${framework.displayName} detected but ${framework.adapterPackage} is not installed`);
          report.hint(`Run: allure-kit init or install ${framework.adapterPackage} manually`);
          issues++;
          continue;
        }

        report.add("success", `${framework.displayName} → ${framework.adapterPackage} installed`);

        const wiring = await checkFrameworkWiring(workingDir, framework);

        if (wiring === "wired") {
          report.add("success", `${framework.displayName} reporter is wired into its config`);
        } else if (wiring === "not-wired") {
          report.add("error", `${framework.displayName} adapter is installed but the reporter isn't wired into its config`);
          report.hint(framework.setupHint);
          issues++;
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
      issues++;
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

  return { issues, detectedFrameworks };
};

const declaredPackages = (deps: { name: string }[]) => new Set(deps.map(({ name }) => normalizePythonName(name)));

const normalizePythonName = (name: string) => name.toLowerCase().replace(/[-_.]+/g, "-");

/** Ecosystems without node_modules: adapters are checked against the project's declared dependencies. */
const checkManifestEcosystem = async (workingDir: string, report: Reporter, ecosystem: EcosystemAdapter) => {
  let issues = 0;

  report.step("Checking test framework adapters...");

  const detectedFrameworks = await ecosystem.detectFrameworks(workingDir);
  const declared = declaredPackages(await readProjectPythonDependencies(workingDir));
  const packageManager = await ecosystem.detectPackageManager(workingDir);

  if (detectedFrameworks.length === 0) {
    report.add("warning", `No ${ecosystem.displayName} test frameworks detected`);
  }

  for (const { framework } of detectedFrameworks) {
    if (declared.has(normalizePythonName(framework.adapterPackage))) {
      report.add("success", `${framework.displayName} → ${framework.adapterPackage} is declared in your dependencies`);
      report.hint(framework.setupHint);
    } else {
      report.add("error", `${framework.displayName} detected but ${framework.adapterPackage} is not in your dependencies`);
      report.hint(`Run: ${ecosystem.getInstallCommand(packageManager, [framework.adapterPackage], true)}`);
      issues++;
    }
  }

  report.step("Checking Allure CLI...");
  report.add("info", ecosystem.postInstallHint ?? "Reports are generated by the Node.js-based Allure CLI (npx allure generate)");

  report.step("Checking for unused adapters...");

  const detectedIds = new Set(detectedFrameworks.map(({ framework }) => framework.id));

  for (const framework of ecosystem.frameworkRegistry) {
    if (declared.has(normalizePythonName(framework.adapterPackage)) && !detectedIds.has(framework.id)) {
      report.add("warning", `${framework.adapterPackage} is declared but ${framework.packageName} was not found in dependencies`);
    }
  }

  return { issues, detectedFrameworks };
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

  lang = Option.String("--lang", {
    description: "Project language: js, ts, or python (default: auto-detect)",
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

    const ecosystem = await resolveEcosystem(workingDir, typeof this.lang === "string" ? this.lang : undefined);
    const packageManager = await ecosystem.detectPackageManager(workingDir);

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

    const isNpm = ecosystem.id === npmAdapter.id;
    const { issues, detectedFrameworks } = isNpm
      ? await checkNpmEcosystem(workingDir, report)
      : await checkManifestEcosystem(workingDir, report, ecosystem);

    issuesFound += issues;

    report.step("Checking compatibility...");

    const parsedConfig = existingConfig ? await readAllureConfig(workingDir) : null;

    const compatFindings = [
      ...(await checkAdapterCompat(workingDir)),
      ...(await checkAllureCliGeneration(workingDir)),
      ...(await checkAllureJsVersionAlignment(workingDir)),
      ...(existingConfig ? checkConfigCombinations(await readFile(existingConfig.path, "utf-8")) : []),
      ...(parsedConfig ? checkPluginImports(parsedConfig, workingDir) : []),
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
