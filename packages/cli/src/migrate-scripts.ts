export interface ScriptMigration {
  scripts: Record<string, string>;
  /** What was rewritten, one line per script. */
  changes: string[];
  /** Things that look like Allure 2 usage but can't be rewritten safely. */
  warnings: string[];
}

const ALLURE_CALL = /(?:^|[\s&;|(])(?:npx\s+)?allure\s+(serve|generate|open)\b/;

/**
 * Allure 2 -> 3 command differences, verified against `allure --help` of Allure 3:
 * - `allure serve <results>` doesn't exist; `allure generate <results> --open` generates and serves.
 * - `--clean` isn't a `generate` option (the unknown flag is a syntax error). `-c` meant "clean" in Allure 2
 *   but means `--config` in Allure 3, so it is only flagged, never rewritten.
 */
export const migrateScripts = (scripts: Record<string, string>): ScriptMigration => {
  const migrated: Record<string, string> = {};
  const changes: string[] = [];
  const warnings: string[] = [];

  for (const [name, command] of Object.entries(scripts)) {
    let next = command;

    if (ALLURE_CALL.test(command)) {
      next = next.replace(/(\ballure\s+)serve\b([^&;|]*)/g, (_match, prefix: string, rest: string) => `${prefix}generate${rest.trimEnd()} --open`);
      next = next.replace(/\s--clean\b/g, "");

      if (/\ballure\s+generate\b[^&;|]*\s-c(\s|$)/.test(next)) {
        warnings.push(`${name}: "-c" meant --clean in Allure 2 but is --config in Allure 3 — review: ${command}`);
      }
    }

    if (next !== command) {
      changes.push(`${name}: ${command}  →  ${next}`);
    }

    migrated[name] = next;
  }

  return { scripts: migrated, changes, warnings };
};
