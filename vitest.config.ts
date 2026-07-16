import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@todti/allure-kit-core": resolvePath("./packages/core/src/index.ts"),
      "@todti/allure-kit-npm": resolvePath("./packages/npm/src/index.ts"),
      "@todti/allure-kit-python": resolvePath("./packages/python/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
  },
});
