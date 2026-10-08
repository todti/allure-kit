import { cwd as processCwd } from "node:process";

import {
  executeCommand,
  logError,
  logInfo,
  logNewLine,
  logStep,
  logSuccess,
  logWarning,
  print,
} from "@todti/allure-kit-core";
import { detectInstalledAllurePackages, detectPackageManager, getInstallCommand } from "@todti/allure-kit-npm";
import { Command, Option } from "clipanion";
import prompts from "prompts";

import { buildUpdatePlan } from "../update-plan.js";

export class KitUpdateCommand extends Command {
  static paths = [["update"]];

  static usage = Command.Usage({
    description: "Update all Allure packages to the latest version",
    examples: [
      ["update", "Check and update all Allure packages"],
      ["update --yes", "Update without confirmation"],
    ],
  });

  yes = Option.Boolean("--yes,-y", false, {
    description: "Update without confirmation",
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Only show which packages would be updated",
  });

  cwd = Option.String("--cwd", {
    description: "Working directory (default: current directory)",
  });

  async execute() {
    const workingDir = this.cwd ?? processCwd();

    logStep("Scanning for Allure packages...");

    const installedPackages = await detectInstalledAllurePackages(workingDir);

    if (installedPackages.length === 0) {
      logWarning("No Allure packages found in package.json");
      return;
    }

    const fetchLatest = async (name: string): Promise<string | null> => {
      const result = await executeCommand(`npm view ${name} version`, workingDir);
      const version = result.stdout.trim();

      return result.exitCode === 0 && /^\d+\.\d+\.\d+/.test(version) ? version : null;
    };
    const plan = await buildUpdatePlan(workingDir, installedPackages, fetchLatest);

    print();

    for (const { name, version, isDev, current, latest, status, majorBump } of plan) {
      const scope = isDev ? "dev" : "prod";

      if (status === "current") {
        logInfo(`${name}@${current} (${scope}) — up to date`);
      } else if (status === "outdated") {
        logInfo(`${name}@${current} → ${latest} (${scope})${majorBump ? " — MAJOR upgrade, check the changelog" : ""}`);
      } else {
        logInfo(`${name}@${version} (${scope}) — latest version unknown`);
      }
    }

    logNewLine();

    const toUpdate = plan.filter((pkg) => pkg.status !== "current");

    if (toUpdate.length === 0) {
      logSuccess("All Allure packages are up to date");
      return;
    }

    if (this.dryRun === true) {
      logInfo(`Would update ${toUpdate.length} package(s). Run without --dry-run to apply.`);
      return;
    }

    if (!this.yes) {
      const { shouldUpdate } = await prompts({
        type: "confirm",
        name: "shouldUpdate",
        message: `Update ${toUpdate.length} package(s) to latest?`,
        initial: true,
      });

      if (!shouldUpdate) {
        logInfo("Update cancelled.");
        return;
      }
    }

    const packageManager = await detectPackageManager(workingDir);
    const devPackages = toUpdate.filter((pkg) => pkg.isDev).map((pkg) => `${pkg.name}@latest`);
    const prodPackages = toUpdate.filter((pkg) => !pkg.isDev).map((pkg) => `${pkg.name}@latest`);

    if (devPackages.length > 0) {
      const installDevCommand = getInstallCommand(packageManager, devPackages, true);

      logInfo(installDevCommand);

      const result = await executeCommand(installDevCommand, workingDir);

      if (result.exitCode !== 0) {
        logError("Failed to update dev packages:");
        print(result.stderr);
        return;
      }
    }

    if (prodPackages.length > 0) {
      const installProdCommand = getInstallCommand(packageManager, prodPackages, false);

      logInfo(installProdCommand);

      const result = await executeCommand(installProdCommand, workingDir);

      if (result.exitCode !== 0) {
        logError("Failed to update prod packages:");
        print(result.stderr);
        return;
      }
    }

    logSuccess("All Allure packages updated successfully");
    logNewLine();
  }
}
