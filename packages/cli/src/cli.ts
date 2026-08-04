import { readFileSync } from "node:fs";
import { join } from "node:path";
import { argv } from "node:process";

import { Builtins, Cli } from "clipanion";

import {
  KitDefaultCommand,
  KitDoctorCommand,
  KitGhPagesInitCommand,
  KitInitCommand,
  KitPluginAddCommand,
  KitPluginEditCommand,
  KitPluginListCommand,
  KitPluginRemoveCommand,
  KitUpdateCommand,
} from "./commands/index.js";

const [, , ...args] = argv;

// __dirname: this file is only ever run through the esbuild CJS bundle (dist/cli.cjs), never
// the raw tsc ESM output, so the CJS-native __dirname is always available at runtime.
const pkg: { name: string; version: string } = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8"));

const cli = new Cli({
  binaryName: "allure-kit",
  binaryLabel: pkg.name,
  binaryVersion: pkg.version,
});

cli.register(KitDefaultCommand);
cli.register(KitInitCommand);
cli.register(KitUpdateCommand);
cli.register(KitDoctorCommand);
cli.register(KitGhPagesInitCommand);
cli.register(KitPluginAddCommand);
cli.register(KitPluginEditCommand);
cli.register(KitPluginRemoveCommand);
cli.register(KitPluginListCommand);

cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);

cli.runExit(args);
