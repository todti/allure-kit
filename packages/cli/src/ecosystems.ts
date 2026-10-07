import { resolve } from "node:path";

import { type EcosystemAdapter, fileExists } from "@todti/allure-kit-core";
import { npmAdapter } from "@todti/allure-kit-npm";
import { javaAdapter } from "@todti/allure-kit-java";
import { pythonAdapter } from "@todti/allure-kit-python";

/**
 * Array order = auto-detection priority when --lang isn't passed, and the
 * default when no manifest matches. npm stays first, matching the
 * long-standing default-to-npm behavior. Adding a new ecosystem (e.g. Java)
 * means implementing one more EcosystemAdapter and appending it here — no
 * other change to init.ts's control flow.
 */
export const ECOSYSTEMS: EcosystemAdapter[] = [npmAdapter, pythonAdapter, javaAdapter];

/**
 * Without an explicit --lang, check each ecosystem's manifest files in
 * registration order (ECOSYSTEMS[0] = npm, matching the long-standing
 * default-to-npm behavior) and default to the first ecosystem if none match.
 */
export const resolveEcosystem = async (cwd: string, lang: string | undefined): Promise<EcosystemAdapter> => {
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
