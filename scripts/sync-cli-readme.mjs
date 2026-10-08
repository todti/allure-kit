#!/usr/bin/env node
// packages/cli/README.md is what npmjs.com shows for the package, so it is generated from the root README:
// relative links and images are made absolute (they would be broken on npm), everything else is copied as is.
//   node scripts/sync-cli-readme.mjs          writes packages/cli/README.md
//   node scripts/sync-cli-readme.mjs --check  exits 1 if it is out of date
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "https://github.com/todti/allure-kit";
const BRANCH = "master";
const IMAGE = /\.(svg|png|gif|jpe?g|webp)$/i;

export const toNpmReadme = (markdown) => {
  const body = markdown.replace(/\]\(((?!https?:|mailto:|#)[^)\s]+)\)/g, (_match, target) => {
    const path = target.replace(/^\.\//, "");

    return IMAGE.test(path)
      ? `](https://raw.githubusercontent.com/todti/allure-kit/${BRANCH}/${path})`
      : `](${REPO}/${/\.[a-z]+$/i.test(path) || path === "LICENSE" ? "blob" : "tree"}/${BRANCH}/${path})`;
  });

  return `${body.replace(/\s+$/, "")}\n`;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = join(root, "packages/cli/README.md");
  const generated = toNpmReadme(readFileSync(join(root, "README.md"), "utf-8"));

  if (process.argv.includes("--check")) {
    if (readFileSync(target, "utf-8") !== generated) {
      console.error("packages/cli/README.md is out of date: run `node scripts/sync-cli-readme.mjs`");
      process.exit(1);
    }
  } else {
    writeFileSync(target, generated);
    console.log("packages/cli/README.md updated");
  }
}
