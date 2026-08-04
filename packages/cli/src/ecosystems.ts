import type { EcosystemAdapter } from "@todti/allure-kit-core";
import { npmAdapter } from "@todti/allure-kit-npm";
import { pythonAdapter } from "@todti/allure-kit-python";

/**
 * Array order = auto-detection priority when --lang isn't passed, and the
 * default when no manifest matches. npm stays first, matching the
 * long-standing default-to-npm behavior. Adding a new ecosystem (e.g. Java)
 * means implementing one more EcosystemAdapter and appending it here — no
 * other change to init.ts's control flow.
 */
export const ECOSYSTEMS: EcosystemAdapter[] = [npmAdapter, pythonAdapter];
