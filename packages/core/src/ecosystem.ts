export interface FrameworkDescriptor {
  id: string;
  displayName: string;
  /**
   * Primary package name used for display and adapter mapping.
   * Detection may include additional package names via `detectPackageNames`.
   */
  packageName: string;
  /**
   * Additional package names that indicate this framework is used in the project.
   * Useful when a framework is typically installed as a set of packages (e.g. WebdriverIO).
   */
  detectPackageNames?: string[];
  adapterPackage: string;
  setupHint: string;
  configFilePatterns: string[];
  testFilePatterns: string[];
}

export interface DetectedFramework {
  framework: FrameworkDescriptor;
  source: "dependencies" | "devDependencies" | "config-file" | "test-files";
  version: string;
}

/**
 * The contract every language/ecosystem plugs into. `init` (and, in the
 * npm-only case, `doctor`/`update`) drive their logic entirely through this
 * interface instead of branching on the language by name, so adding a new
 * ecosystem (e.g. Java/Maven) means implementing one adapter, not editing
 * the CLI's control flow.
 */
export interface EcosystemAdapter<PackageManager extends string = string> {
  id: string;
  displayName: string;
  /** Values accepted by `--lang` that select this ecosystem. */
  langAliases: string[];
  frameworkRegistry: FrameworkDescriptor[];
  /** Presence of any of these files in `cwd` signals this ecosystem applies, checked in array order for auto-detection. */
  manifestFiles: string[];
  detectPackageManager(cwd: string): Promise<PackageManager>;
  detectFrameworks(cwd: string): Promise<DetectedFramework[]>;
  getInstallCommand(packageManager: PackageManager, packages: string[], isDev: boolean): string;
  getRemoveCommand(packageManager: PackageManager, packages: string[]): string;
  /** Packages always installed regardless of selected frameworks (e.g. the "allure" CLI itself for the npm ecosystem). */
  alwaysInstallPackages: string[];
  /** For package managers that don't self-persist installed packages to a manifest (e.g. plain pip). */
  afterInstall?(cwd: string, packageManager: PackageManager, packages: string[]): Promise<void>;
  /** Extra guidance printed after setup completes. */
  postInstallHint?: string;
}
