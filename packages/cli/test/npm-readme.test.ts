import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// @ts-expect-error plain ES module script without type declarations
import { toNpmReadme } from "../../../scripts/sync-cli-readme.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("npm README", () => {
  it("packages/cli/README.md (what npmjs.com shows) is generated from the root README and up to date", () => {
    const generated = toNpmReadme(readFileSync(join(root, "README.md"), "utf-8"));

    expect(readFileSync(join(root, "packages/cli/README.md"), "utf-8")).toBe(generated);
  });

  it("makes relative images and links absolute and leaves absolute ones alone", () => {
    const out = toNpmReadme(
      "![x](docs/screenshots/a.svg) [c](CHANGELOG.md) [d](packages/cli) [l](LICENSE) [w](https://example.com/a) [h](#anchor)\n",
    );

    expect(out).toBe(
      "![x](https://raw.githubusercontent.com/todti/allure-kit/master/docs/screenshots/a.svg) [c](https://github.com/todti/allure-kit/blob/master/CHANGELOG.md) [d](https://github.com/todti/allure-kit/tree/master/packages/cli) [l](https://github.com/todti/allure-kit/blob/master/LICENSE) [w](https://example.com/a) [h](#anchor)\n",
    );
  });
});
