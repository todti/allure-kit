import type { EcosystemAdapter } from "@todti/allure-kit-core";

import { detectFrameworks } from "./detect-frameworks.js";
import { detectPackageManager, getInstallCommand, getRemoveCommand, type PackageManager } from "./detect-package-manager.js";
import { FRAMEWORK_REGISTRY } from "./registry.js";

export const npmAdapter: EcosystemAdapter<PackageManager> = {
  id: "npm",
  displayName: "JS/TS",
  langAliases: ["js", "ts"],
  frameworkRegistry: FRAMEWORK_REGISTRY,
  manifestFiles: ["package.json"],
  detectPackageManager,
  detectFrameworks,
  getInstallCommand,
  getRemoveCommand,
  // The "allure" CLI is always npm — it's the report-generation engine, always installed alongside adapters.
  alwaysInstallPackages: ["allure"],
};
