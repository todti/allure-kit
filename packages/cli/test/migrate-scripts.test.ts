import { describe, expect, it } from "vitest";

import { migrateScripts } from "../src/migrate-scripts.js";

describe("kit/migrate-scripts", () => {
  it("rewrites `allure serve` to `generate --open` and drops --clean", () => {
    const { scripts, changes } = migrateScripts({
      report: "allure serve allure-results",
      build: "npx allure generate allure-results --clean -o report && echo done",
      test: "vitest run",
    });

    expect(scripts.report).toBe("allure generate allure-results --open");
    expect(scripts.build).toBe("npx allure generate allure-results -o report && echo done");
    expect(scripts.test).toBe("vitest run");
    expect(changes).toHaveLength(2);
  });

  it("warns about -c (clean in Allure 2, config in Allure 3) without rewriting it", () => {
    const { scripts, warnings } = migrateScripts({ report: "allure generate allure-results -c -o out" });

    expect(scripts.report).toBe("allure generate allure-results -c -o out");
    expect(warnings[0]).toContain("-c");
  });

  it("leaves unrelated commands that merely mention serve alone", () => {
    const { changes } = migrateScripts({ start: "vite serve", docs: "serve --clean docs" });

    expect(changes).toEqual([]);
  });
});
