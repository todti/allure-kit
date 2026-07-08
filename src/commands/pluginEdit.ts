import { cwd as processCwd } from "node:process";

import { Command, Option } from "clipanion";
import prompts from "prompts";

import { findExistingConfig, readAllureConfig, updateConfigPlugins } from "./utils/config-io.js";
import type { PluginOptionDescriptor } from "./utils/registry.js";
import { findReportPluginById } from "./utils/registry.js";
import { logHint, logInfo, logNewLine, logStep, logSuccess, logWarning } from "./utils/ui.js";

const promptForOption = async (opt: PluginOptionDescriptor, currentValue: unknown): Promise<unknown> => {
  const envHint = opt.envVar ? ` (env: ${opt.envVar})` : "";
  const initialValue = currentValue !== undefined ? currentValue : opt.defaultValue;

  if (opt.type === "select" && opt.choices) {
    const initial = opt.choices.findIndex((c) => c.value === initialValue);
    const response = await prompts({
      type: "select",
      name: "value",
      message: `${opt.description}${envHint}`,
      choices: opt.choices,
      initial: initial >= 0 ? initial : 0,
    });

    return response.value;
  }

  if (opt.type === "boolean") {
    const response = await prompts({
      type: "confirm",
      name: "value",
      message: `${opt.description}${envHint}`,
      initial: initialValue === true,
    });

    return response.value;
  }

  const response = await prompts({
    type: "text",
    name: "value",
    message: `${opt.description}${envHint}`,
    initial: typeof initialValue === "string" ? initialValue : undefined,
  });

  return response.value || undefined;
};

export class KitPluginEditCommand extends Command {
  static paths = [["plugin", "edit"]];

  static usage = Command.Usage({
    description: "Update the settings of an already configured report plugin",
    examples: [["plugin edit slack", "Update the Slack plugin's configured options"]],
  });

  pluginName = Option.String({ required: true, name: "plugin" });

  cwd = Option.String("--cwd", {
    description: "Working directory (default: current directory)",
  });

  async execute() {
    const workingDir = this.cwd ?? processCwd();
    const pluginId = this.pluginName;

    const existingConfig = await findExistingConfig(workingDir);

    if (!existingConfig) {
      logWarning("No allurerc config found. Run 'allure-kit init' first to create one.");
      return;
    }

    if (existingConfig.format === "mjs") {
      logWarning("Cannot auto-modify ESM config (allurerc.mjs).");
      logHint(`Edit the "${pluginId}" entry in your plugins section manually.`);
      logNewLine();
      return;
    }

    const config = await readAllureConfig(workingDir);
    const currentEntry = config?.plugins?.[pluginId];

    if (!currentEntry) {
      logWarning(`Plugin "${pluginId}" is not configured yet.`);
      logHint(`Use "allure-kit plugin add ${pluginId}" to add it first.`);
      return;
    }

    const pluginDescriptor = findReportPluginById(pluginId);
    const pluginOptions = pluginDescriptor?.options ?? [];
    const currentOptions = currentEntry.options ?? {};

    if (pluginOptions.length === 0) {
      logWarning(`Plugin "${pluginId}" has no configurable options.`);
      return;
    }

    logStep(`Edit ${pluginId} plugin:`);
    logHint("Press Enter to keep the current value, leave empty to clear optional fields");
    logNewLine();

    const options: Record<string, unknown> = {};

    for (const opt of pluginOptions) {
      const value = await promptForOption(opt, currentOptions[opt.name]);

      if (value !== undefined && value !== "") {
        options[opt.name] = value;
      }
    }

    const updated = await updateConfigPlugins(workingDir, pluginId, { ...currentEntry, options });

    if (updated) {
      logSuccess(`Updated "${pluginId}" in ${existingConfig.path}`);

      if (Object.keys(options).length > 0) {
        logInfo("Configured options:");

        for (const [key, value] of Object.entries(options)) {
          logHint(`${key}: ${JSON.stringify(value)}`);
        }
      }
    } else {
      logWarning("Failed to update config file.");
    }
  }
}
