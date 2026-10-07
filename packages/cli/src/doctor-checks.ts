import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

export interface DoctorFinding {
  level: "error" | "warning" | "info";
  message: string;
  hint?: string;
}

export const parseVersion = (version: string): [number, number, number] | null => {
  const match = /^[\^~>=v\s]*(\d+)\.(\d+)\.(\d+)/.exec(version);

  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

/** Negative when `a` < `b`, 0 when equal, positive when `a` > `b`; `null` if either is unparsable. */
export const compareVersions = (a: string, b: string): number | null => {
  const left = parseVersion(a);
  const right = parseVersion(b);

  if (!left || !right) {
    return null;
  }

  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
};

export const readInstalledVersion = async (cwd: string, packageName: string): Promise<string | null> => {
  try {
    const content = await readFile(resolve(cwd, "node_modules", packageName, "package.json"), "utf-8");
    const { version } = JSON.parse(content) as { version?: unknown };

    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
};

interface AdapterCompatRule {
  frameworkPackage: string;
  adapterPackage: string;
  /** From this framework version on, the adapter needs at least `adapterMin`. */
  frameworkFrom: string;
  adapterMin: string;
  problem: string;
}

/** Only rules confirmed by a released fix belong here — don't guess ranges. */
export const ADAPTER_COMPAT_RULES: AdapterCompatRule[] = [
  {
    frameworkPackage: "@playwright/test",
    adapterPackage: "allure-playwright",
    frameworkFrom: "1.60.0",
    adapterMin: "3.9.0",
    problem: "Playwright 1.60 removed the API used for test plans, so selective runs ignore the plan (allure-js#1515)",
  },
];

interface FrameworkTooOldRule {
  frameworkPackage: string;
  adapterPackage: string;
  /** The framework is broken below this version... */
  frameworkBelow: string;
  /** ...when combined with the adapter at this version or newer. */
  adapterFrom: string;
  problem: string;
}

/** Reproduced by running the combination in a clean project, not taken from an issue tracker. */
export const FRAMEWORK_TOO_OLD_RULES: FrameworkTooOldRule[] = [
  {
    frameworkPackage: "vitest",
    adapterPackage: "allure-vitest",
    frameworkBelow: "3.0.0",
    adapterFrom: "3.13.0",
    problem: "the reporter writes no allure-results at all, and nothing reports an error (reproduced with vitest 2.1.9)",
  },
];

export const checkAdapterCompat = async (cwd: string): Promise<DoctorFinding[]> => {
  const findings: DoctorFinding[] = [];

  for (const rule of ADAPTER_COMPAT_RULES) {
    const [frameworkVersion, adapterVersion] = await Promise.all([
      readInstalledVersion(cwd, rule.frameworkPackage),
      readInstalledVersion(cwd, rule.adapterPackage),
    ]);

    if (!frameworkVersion || !adapterVersion) {
      continue;
    }

    const frameworkCmp = compareVersions(frameworkVersion, rule.frameworkFrom);
    const adapterCmp = compareVersions(adapterVersion, rule.adapterMin);

    if (frameworkCmp !== null && adapterCmp !== null && frameworkCmp >= 0 && adapterCmp < 0) {
      findings.push({
        level: "error",
        message: `${rule.adapterPackage}@${adapterVersion} is too old for ${rule.frameworkPackage}@${frameworkVersion}: ${rule.problem}`,
        hint: `Upgrade: ${rule.adapterPackage}@>=${rule.adapterMin} (allure-kit update)`,
      });
    }
  }

  for (const rule of FRAMEWORK_TOO_OLD_RULES) {
    const [frameworkVersion, adapterVersion] = await Promise.all([
      readInstalledVersion(cwd, rule.frameworkPackage),
      readInstalledVersion(cwd, rule.adapterPackage),
    ]);

    if (!frameworkVersion || !adapterVersion) {
      continue;
    }

    const frameworkCmp = compareVersions(frameworkVersion, rule.frameworkBelow);
    const adapterCmp = compareVersions(adapterVersion, rule.adapterFrom);

    if (frameworkCmp !== null && adapterCmp !== null && frameworkCmp < 0 && adapterCmp >= 0) {
      findings.push({
        level: "error",
        message: `${rule.frameworkPackage}@${frameworkVersion} with ${rule.adapterPackage}@${adapterVersion}: ${rule.problem}`,
        hint: `Upgrade ${rule.frameworkPackage} to ${rule.frameworkBelow} or newer, or pin ${rule.adapterPackage} to an older release`,
      });
    }
  }

  return findings;
};

/** allure-js adapters are released in lockstep with allure-js-commons; mixed minors cause hard-to-trace failures. */
const ALLURE_JS_ADAPTERS = [
  "allure-vitest",
  "allure-playwright",
  "allure-jest",
  "allure-mocha",
  "allure-cypress",
  "allure-cucumberjs",
  "allure-jasmine",
  "allure-codeceptjs",
];

export const checkAllureJsVersionAlignment = async (cwd: string): Promise<DoctorFinding[]> => {
  const commons = await readInstalledVersion(cwd, "allure-js-commons");
  const parsedCommons = commons ? parseVersion(commons) : null;

  if (!commons || !parsedCommons) {
    return [];
  }

  const findings: DoctorFinding[] = [];

  for (const adapter of ALLURE_JS_ADAPTERS) {
    const version = await readInstalledVersion(cwd, adapter);
    const parsed = version ? parseVersion(version) : null;

    if (version && parsed && (parsed[0] !== parsedCommons[0] || parsed[1] !== parsedCommons[1])) {
      findings.push({
        level: "warning",
        message: `${adapter}@${version} and allure-js-commons@${commons} are on different minor versions`,
        hint: "Keep allure-js adapters and allure-js-commons on the same version (allure-js#1336)",
      });
    }
  }

  return findings;
};

const hasKey = (source: string, key: string) => new RegExp(`(^|[^\\w.])["']?${key}["']?\\s*:`, "m").test(source);

/**
 * Config-level combinations that silently misbehave. Works on the raw config text so it also covers
 * `allurerc.mjs`, which can't be parsed back; comments may cause a false positive, hence warnings only.
 */
export const checkConfigCombinations = (configSource: string): DoctorFinding[] => {
  const findings: DoctorFinding[] = [];
  const hasHistory = hasKey(configSource, "historyPath");

  if (hasHistory && hasKey(configSource, "qualityGate")) {
    findings.push({
      level: "warning",
      message: "qualityGate together with historyPath: 'allure quality-gate' may evaluate no rules and exit 0",
      hint: "Known issue allure-framework/allure3#895 — verify with a deliberately failing rule, or drop historyPath for the gate run",
    });
  }

  if (hasHistory) {
    findings.push({
      level: "info",
      message: "History is stored inside the Awesome report (<output>/awesome/data/history)",
      hint: "Serve <output>/awesome, not <output>, or the History tab stays empty (allure3#691)",
    });
  }

  return findings;
};

export const checkTestPlanEnv = async (env: NodeJS.ProcessEnv, cwd: string): Promise<DoctorFinding[]> => {
  const testPlanPath = env.ALLURE_TESTPLAN_PATH;

  if (!testPlanPath) {
    return [];
  }

  const absolute = resolve(cwd, testPlanPath);

  if (!existsSync(absolute)) {
    return [
      {
        level: "warning",
        message: `ALLURE_TESTPLAN_PATH points to a missing file: ${testPlanPath}`,
        hint: "Unset it if you don't use a test plan — adapters log 'could not parse test plan' otherwise (allure-js#1338)",
      },
    ];
  }

  try {
    JSON.parse(await readFile(absolute, "utf-8"));
  } catch {
    return [
      {
        level: "warning",
        message: `ALLURE_TESTPLAN_PATH file is not valid JSON: ${testPlanPath}`,
        hint: "Regenerate the test plan (allurectl or TestOps) or unset the variable",
      },
    ];
  }

  return [];
};

/** `allure-commandline` is the Allure 2 npm distribution; `allurerc` and the plugins here are Allure 3 only. */
export const checkAllureCliGeneration = async (cwd: string): Promise<DoctorFinding[]> => {
  const findings: DoctorFinding[] = [];
  const allureVersion = await readInstalledVersion(cwd, "allure");
  const parsed = allureVersion ? parseVersion(allureVersion) : null;

  if (allureVersion && parsed && parsed[0] < 3) {
    findings.push({
      level: "error",
      message: `allure@${allureVersion} is not Allure 3 — allurerc and report plugins need allure@3 or newer`,
      hint: "Run: allure-kit update",
    });
  }

  const legacy = await readInstalledVersion(cwd, "allure-commandline");

  if (legacy) {
    findings.push({
      level: "warning",
      message: `allure-commandline@${legacy} (Allure 2) is installed next to Allure 3`,
      hint: "It ignores allurerc; run reports with 'npx allure …' and remove allure-commandline to avoid mixing the two",
    });
  }

  return findings;
};

const FRAMEWORK_CAVEATS: Record<string, string[]> = {
  jest: ["Retried attempts are not marked in the results, so flaky detection can't tell them apart from fresh runs"],
  vitest: ["Retried attempts are not marked in the results, so flaky detection can't tell them apart from fresh runs"],
  codeceptjs: ["ALLURE_TESTPLAN_PATH (test plan / selective runs) is not supported by the CodeceptJS adapter"],
  newman: [
    "ALLURE_TESTPLAN_PATH (test plan / selective runs) is not supported by the Newman adapter",
    "environmentInfo and categories are accepted but never written — add environment.properties / categories.json to the results directory yourself",
  ],
};

/** Verified limitations of specific adapters; informational only, nothing the user can fix in their config. */
export const checkFrameworkCaveats = (frameworkIds: string[]): DoctorFinding[] =>
  frameworkIds.flatMap((id) => (FRAMEWORK_CAVEATS[id] ?? []).map((message) => ({ level: "info" as const, message: `${id}: ${message}` })));

/** A custom plugin's `import` that points at a missing local file only fails later, deep inside `allure generate` (allure3#598). */
export const checkPluginImports = (config: { plugins?: Record<string, { import?: unknown }> }, cwd: string): DoctorFinding[] =>
  Object.entries(config.plugins ?? {}).flatMap(([id, entry]) => {
    const target = entry?.import;

    if (typeof target !== "string" || !(target.startsWith(".") || isAbsolute(target))) {
      return [];
    }

    return existsSync(resolve(cwd, target))
      ? []
      : [
          {
            level: "error" as const,
            message: `Plugin "${id}" imports ${target}, but that file doesn't exist`,
            hint: "Fix the path in allurerc (it is resolved from the directory you run allure in)",
          },
        ];
  });
