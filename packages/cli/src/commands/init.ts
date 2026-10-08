import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildAllureConfig,
  type ConfigFormat,
  diffLines,
  type EcosystemAdapter,
  executeCommand,
  findExistingConfig,
  type FrameworkDescriptor,
  getConfigFilename,
  logError,
  logHint,
  logInfo,
  logSuccess,
  logWarning,
  print,
  REPORT_PLUGIN_REGISTRY,
  serializeConfig,
  writeAllureConfig,
} from "@todti/allure-kit-core";
import { detectWorkspaceFrameworks } from "@todti/allure-kit-npm";
import { Command, Option, UsageError } from "clipanion";
import prompts from "prompts";

import { ECOSYSTEMS, resolveEcosystem } from "../ecosystems.js";


const findFrameworkByIdOrPackage = (value: string, registry: FrameworkDescriptor[]) => {
  const lowered = value.toLowerCase();

  return registry.find((framework) => {
    if (framework.id === lowered) {
      return true;
    }

    if (framework.packageName.toLowerCase() === lowered) {
      return true;
    }

    return framework.detectPackageNames?.some((name) => name.toLowerCase() === lowered) ?? false;
  });
};

const cwdDefault = (): string => process.cwd();

export class KitInitCommand extends Command {
  static paths = [["init"]];

  static usage = Command.Usage({
    description: "Initialize Allure 3 in your project",
    details:
      "Detects test frameworks (by dependencies, config files, and existing tests), installs adapters, and creates an allurerc config. Exits early if Allure is already configured.",
    examples: [
      ["init", "Interactive setup with auto-detection"],
      ["init --lang=js --framework=playwright", "Non-interactive setup for a single framework"],
      ["init --lang=python --framework=pytest", "Non-interactive setup for a Python project"],
      ["init --format json", "Use JSON config format"],
      ["init --yes", "Accept all defaults without prompts"],
    ],
  });

  format = Option.String("--format,-f", {
    description: "Config file format: json, yaml, or mjs (default: json)",
  });

  yes = Option.Boolean("--yes,-y", false, {
    description: "Accept all defaults without prompts",
  });

  lang = Option.String("--lang", {
    description: "Project language: js, ts, or python (js/ts are treated the same in this version)",
  });

  framework = Option.String("--framework", {
    description: "Force-select a single framework (e.g. playwright, vitest, wdio, pytest, behave)",
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Show what would be installed and changed without touching any files",
  });

  cwd = Option.String("--cwd", {
    description: "Working directory (default: current directory)",
  });

  async execute() {
    const workingDir = typeof this.cwd === "string" ? this.cwd : cwdDefault();
    const dryRun = this.dryRun === true;

    print(`\n  Allure 3 Setup${dryRun ? " (dry run — nothing will be changed)" : ""}\n`);

    const supportedLangs = ECOSYSTEMS.flatMap((ecosystem) => ecosystem.langAliases);

    if (typeof this.lang === "string" && !supportedLangs.includes(this.lang)) {
      throw new UsageError(
        `Unsupported --lang value ${JSON.stringify(this.lang)}. Supported: ${supportedLangs.join(", ")}.`,
      );
    }

    const ecosystem = await resolveEcosystem(workingDir, typeof this.lang === "string" ? this.lang : undefined);
    const registry = ecosystem.frameworkRegistry;

    let forcedFramework;

    if (typeof this.framework === "string") {
      forcedFramework = findFrameworkByIdOrPackage(this.framework, registry);

      if (!forcedFramework) {
        const available = registry.map((f) => f.id).join(", ");
        const otherEcosystem = ECOSYSTEMS.find(
          (candidate) => candidate !== ecosystem && findFrameworkByIdOrPackage(this.framework!, candidate.frameworkRegistry),
        );

        if (otherEcosystem) {
          throw new UsageError(
            `${JSON.stringify(this.framework)} is a ${otherEcosystem.displayName} framework, but this project resolved to ${
              ecosystem.displayName
            }. Pass --lang=${otherEcosystem.langAliases[0]} explicitly. Available for the current language: ${available}.`,
          );
        }

        throw new UsageError(`Unknown --framework value ${JSON.stringify(this.framework)}. Available: ${available}.`);
      }
    }

    const existingConfig = await findExistingConfig(workingDir);

    if (existingConfig && !ecosystem.setupViaBuildFile) {
      logSuccess(`Allure is already configured (${existingConfig.path}).`);
      logInfo('Run "allure-kit doctor" to verify or "allure-kit update" to upgrade.');
      return;
    }

    const detectedFrameworks = await ecosystem.detectFrameworks(workingDir);

    if (detectedFrameworks.length > 0) {
      for (const { framework, version } of detectedFrameworks) {
        const versionStr = version !== "unknown" ? ` ${version}` : "";
        const configPath = framework.configFilePatterns[0] ?? "";

        logInfo(`${framework.id}${versionStr}${configPath ? ` ${configPath}` : ""}`);
      }
    } else if (!forcedFramework) {
      logWarning("No test frameworks detected");

      if (ecosystem.id === "npm") {
        for (const { dir, frameworks } of await detectWorkspaceFrameworks(workingDir)) {
          logHint(`Monorepo package ${dir} uses ${frameworks.map(({ framework }) => framework.displayName).join(", ")} — run: allure-kit init --cwd ${dir}`);
        }
      }
    }

    const nonInteractive = this.yes === true || forcedFramework !== undefined;
    let selectedFrameworkIds: string[];
    let selectedPluginIds: string[];
    let configFormat: ConfigFormat = typeof this.format === "string" ? (this.format as ConfigFormat) : "json";
    let reportName = "Allure Report";

    if (forcedFramework) {
      selectedFrameworkIds = [forcedFramework.id];
      selectedPluginIds = REPORT_PLUGIN_REGISTRY.filter((plugin) => plugin.isDefault).map((plugin) => plugin.id);
    } else if (nonInteractive) {
      selectedFrameworkIds = detectedFrameworks.map(({ framework }) => framework.id);
      selectedPluginIds = REPORT_PLUGIN_REGISTRY.filter((plugin) => plugin.isDefault).map((plugin) => plugin.id);
    } else {
      let frameworkChoices = detectedFrameworks.map(({ framework, version }) => ({
        title: `${framework.displayName} → ${framework.adapterPackage}${version !== "unknown" ? ` (${version})` : ""}`,
        value: framework.id,
        selected: true,
      }));

      const detectedIds = new Set(detectedFrameworks.map((d) => d.framework.id));
      const undetected = registry.filter((f) => !detectedIds.has(f.id));

      if (undetected.length > 0) {
        frameworkChoices = [
          ...frameworkChoices,
          ...undetected.map((framework) => ({
            title: `${framework.displayName} → ${framework.adapterPackage}`,
            value: framework.id,
            selected: false,
          })),
        ];
      }

      const frameworkResponse = await prompts({
        type: "multiselect",
        name: "frameworks",
        message: "Select frameworks to integrate",
        choices: frameworkChoices,
        hint: "- Space to toggle. Return to submit",
      });

      selectedFrameworkIds = frameworkResponse.frameworks ?? [];

      const pluginChoices = REPORT_PLUGIN_REGISTRY.map((plugin) => ({
        title: `${plugin.id} — ${plugin.description}`,
        value: plugin.id,
        selected: plugin.isDefault,
      }));

      const pluginResponse = await prompts({
        type: "multiselect",
        name: "plugins",
        message: "Select report plugins",
        choices: pluginChoices,
        hint: "- Space to toggle. Return to submit",
      });

      selectedPluginIds = pluginResponse.plugins ?? ["awesome"];

      if (typeof this.format !== "string") {
        const formatResponse = await prompts({
          type: "select",
          name: "format",
          message: "Config file format",
          choices: [
            { title: "JSON (allurerc.json) — easy to edit programmatically", value: "json" },
            { title: "YAML (allurerc.yaml) — human-friendly", value: "yaml" },
            { title: "ESM (allurerc.mjs) — supports functions and imports", value: "mjs" },
          ],
          initial: 0,
        });

        configFormat = formatResponse.format ?? "json";
      }

      const nameResponse = await prompts({
        type: "text",
        name: "reportName",
        message: "Report name",
        initial: "Allure Report",
      });

      reportName = nameResponse.reportName ?? "Allure Report";
    }

    if (selectedFrameworkIds.length === 0 && !forcedFramework) {
      logWarning("No frameworks selected — only the Allure CLI will be installed.");
    }

    const selectedAdapters = selectedFrameworkIds
      .map((id) => registry.find((f) => f.id === id))
      .filter(Boolean)
      .map((f) => f!.adapterPackage);

    const packageManager = await ecosystem.detectPackageManager(workingDir);
    const packagesToInstall = [...ecosystem.alwaysInstallPackages, ...selectedAdapters];

    if (ecosystem.setupViaBuildFile) {
      // Dependencies come from the build file edit below; there is no install command to run.
    } else if (packagesToInstall.length > 0 && dryRun) {
      logInfo(`would run: ${ecosystem.getInstallCommand(packageManager, packagesToInstall, true)}`);
    } else if (packagesToInstall.length > 0) {
      const installCommand = ecosystem.getInstallCommand(packageManager, packagesToInstall, true);
      const result = await executeCommand(installCommand, workingDir);

      if (result.exitCode !== 0) {
        logError("Package installation failed:");
        print(result.stderr);
        return;
      }

      await ecosystem.afterInstall?.(workingDir, packageManager, selectedAdapters);

      for (const adapter of selectedAdapters) {
        logSuccess(`added ${adapter}`);
      }
    }

    if (ecosystem.postInstallHint) {
      logInfo(ecosystem.postInstallHint);
    }

    const docsLinks: string[] = [];

    for (const id of selectedFrameworkIds) {
      const framework = registry.find((f) => f.id === id);

      if (!framework) {
        continue;
      }

      if (framework.docsUrl) {
        docsLinks.push(`${framework.displayName}: ${framework.docsUrl}`);
      }

      const plannedWrites: { path: string; content: string }[] = [];
      const outcome = await ecosystem.patchFrameworkConfig?.(
        workingDir,
        framework,
        dryRun ? async (path, content) => void plannedWrites.push({ path, content }) : undefined,
      );

      for (const { path, content } of plannedWrites) {
        const before = await readFile(path, "utf-8").catch(() => "");

        logInfo(`would ${before === "" ? "create" : "modify"} ${path}:`);
        print(diffLines(before, content));
      }

      if (!outcome) {
        logHint(`${framework.displayName}: ${framework.setupHint}`);
        continue;
      }

      if (outcome.status === "patched" && dryRun) {
        continue;
      }

      if (outcome.status === "patched") {
        logSuccess(`wired ${framework.adapterPackage} into ${outcome.configPath}`);

        if (outcome.note) {
          logWarning(outcome.note);
        }
      } else if (outcome.status === "already-configured") {
        logInfo(`${framework.displayName} config already has the Allure reporter`);
      } else {
        if (outcome.reason) {
          logWarning(`${framework.displayName}: config left untouched — ${outcome.reason}`);
        }

        logHint(`${framework.displayName}: ${framework.setupHint}`);
      }
    }

    if (docsLinks.length > 0 && !dryRun) {
      logInfo("Adapter options and examples:");

      for (const link of docsLinks) {
        logHint(link);
      }
    }

    if (ecosystem.setupViaBuildFile) {
      return;
    }

    const config = buildAllureConfig(reportName, selectedPluginIds);

    if (dryRun) {
      logInfo(`would create ${getConfigFilename(configFormat)}:`);
      print(diffLines("", serializeConfig(config, configFormat)));

      return;
    }

    const createdFilename = await writeAllureConfig(workingDir, config, configFormat);

    const verifyConfig = await findExistingConfig(workingDir);

    if (!verifyConfig) {
      logError(`Failed to write ${createdFilename}`);
      return;
    }

    logSuccess(`created ${createdFilename}`);
  }
}
