import { readFileSync } from "node:fs";
import { argv } from "node:process";

import { Builtins, Cli } from "clipanion";

import {
  KitDefaultCommand,
  KitDoctorCommand,
  KitGhPagesInitCommand,
  KitInitCommand,
  KitPluginAddCommand,
  KitPluginListCommand,
  KitPluginRemoveCommand,
  KitUpdateCommand,
} from "./commands/index.js";

const [, , ...args] = argv;

const pkg: { name: string; version: string } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

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
cli.register(KitPluginRemoveCommand);
cli.register(KitPluginListCommand);

cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);

cli.runExit(args);
