import { compareVersions, FRAMEWORK_TOO_OLD_RULES, parseVersion, readInstalledVersion } from "./doctor-checks.js";

export interface InstalledAllurePackage {
  name: string;
  version: string;
  isDev: boolean;
}

export interface PackagePlan extends InstalledAllurePackage {
  /** Version actually installed in node_modules, falling back to the base of the declared range. */
  current: string | null;
  latest: string | null;
  /** `unknown` means the registry couldn't be queried — such packages are still updated, as before. */
  status: "outdated" | "current" | "unknown";
  majorBump: boolean;
  /** Why the package is not updated even though a newer release exists (it would stop writing results). */
  heldBack?: string;
}

const findHoldBack = async (cwd: string, name: string): Promise<string | undefined> => {
  const rule = FRAMEWORK_TOO_OLD_RULES.find(({ adapterPackage }) => adapterPackage === name);
  const frameworkVersion = rule ? await readInstalledVersion(cwd, rule.frameworkPackage) : null;
  const comparison = rule && frameworkVersion ? compareVersions(frameworkVersion, rule.frameworkBelow) : null;

  return rule && comparison !== null && comparison < 0
    ? `${rule.frameworkPackage} ${frameworkVersion} works only with ${name} ${rule.adapterPin} or older — upgrade ${rule.frameworkPackage} to ${rule.frameworkBelow}+ first`
    : undefined;
};

export const buildUpdatePlan = async (
  cwd: string,
  packages: InstalledAllurePackage[],
  fetchLatest: (name: string) => Promise<string | null>,
): Promise<PackagePlan[]> =>
  Promise.all(
    packages.map(async (pkg) => {
      const [installed, latest] = await Promise.all([readInstalledVersion(cwd, pkg.name), fetchLatest(pkg.name)]);
      const parsedRange = parseVersion(pkg.version);
      const current = installed ?? (parsedRange ? parsedRange.join(".") : null);
      const comparison = current && latest ? compareVersions(current, latest) : null;
      const status = comparison === null ? "unknown" : comparison < 0 ? "outdated" : "current";
      const majorBump = status === "outdated" && parseVersion(current!)![0] < parseVersion(latest!)![0];

      const heldBack = status === "outdated" ? await findHoldBack(cwd, pkg.name) : undefined;

      return { ...pkg, current, latest, status, majorBump, heldBack } as PackagePlan;
    }),
  );
