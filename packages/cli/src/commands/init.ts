import * as console from "node:console";
import { resolve } from "node:path";

import {
  type ConfigFormat,
  type EcosystemAdapter,
  type FrameworkDescriptor,
  buildAllureConfig,
  executeCommand,
  fileExists,
  findExistingConfig,
  logError,
  logInfo,
  logSuccess,
  logWarning,
  REPORT_PLUGIN_REGISTRY,
  writeAllureConfig,
} from "@todti/allure-kit-core";
import { Command, Option, UsageError } from "clipanion";
import prompts from "prompts";

import { ECOSYSTEMS } from "../ecosystems.js";

/**
 * Without an explicit --lang, check each ecosystem's manifest files in
 * registration order (ECOSYSTEMS[0] = npm, matching the long-standing
 * default-to-npm behavior) and default to the first ecosystem if none match.
 */
const resolveEcosystem = async (cwd: string, lang: string | undefined): Promise<EcosystemAdapter> => {
  if (lang) {
    const match = ECOSYSTEMS.find((ecosystem) => ecosystem.langAliases.includes(lang));

    if (match) {
      return match;
    }
  }

  for (const ecosystem of ECOSYSTEMS) {
    for (const filename of ecosystem.manifestFiles) {
      if (await fileExists(resolve(cwd, filename))) {
        return ecosystem;
      }
    }
  }

  return ECOSYSTEMS[0];
};

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

  cwd = Option.String("--cwd", {
    description: "Working directory (default: current directory)",
  });

  async execute() {
    const workingDir = typeof this.cwd === "string" ? this.cwd : cwdDefault();

    console.log("\n  Allure 3 Setup\n");

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

    if (existingConfig) {
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

    if (packagesToInstall.length > 0) {
      const installCommand = ecosystem.getInstallCommand(packageManager, packagesToInstall, true);
      const result = await executeCommand(installCommand, workingDir);

      if (result.exitCode !== 0) {
        logError("Package installation failed:");
        console.log(result.stderr);
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

    const config = buildAllureConfig(reportName, selectedPluginIds);
    const createdFilename = await writeAllureConfig(workingDir, config, configFormat);

    const verifyConfig = await findExistingConfig(workingDir);

    if (!verifyConfig) {
      logError(`Failed to write ${createdFilename}`);
      return;
    }

    logSuccess(`created ${createdFilename}`);
  }
}
