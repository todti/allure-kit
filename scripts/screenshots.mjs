#!/usr/bin/env node
// Regenerates docs/screenshots/*.svg: runs real allure-kit commands on small throwaway projects (no network, nothing is
// installed) with colours forced on and draws the output as a terminal window.
//   npm run build && node scripts/screenshots.mjs
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "packages/cli/bin/allure-kit.js");
const outDir = join(root, "docs/screenshots");

mkdirSync(outDir, { recursive: true });

const write = (dir, file, content) => {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), content);
};

/** A package in node_modules that only has a version: enough for doctor, which reads versions and presence. */
const stub = (dir, name, version) => write(dir, `node_modules/${name}/package.json`, JSON.stringify({ name, version }));

const fixtures = {
  empty: () => {},
  vitest: (dir) => {
    write(dir, "package.json", JSON.stringify({ name: "my-app", devDependencies: { vitest: "^3.2.0" } }, null, 2));
    write(dir, "vitest.config.ts", 'import { defineConfig } from "vitest/config";\n\nexport default defineConfig({\n  test: {},\n});\n');
  },
  playwrightWithProblems: (dir) => {
    write(dir, "package.json", JSON.stringify({ name: "my-app", devDependencies: { "@playwright/test": "^1.60.0", "allure-playwright": "^3.4.5", allure: "^3.20.0" } }, null, 2));
    write(dir, "playwright.config.ts", 'import { defineConfig } from "@playwright/test";\n\nexport default defineConfig({\n  reporter: [["allure-playwright"]],\n});\n');
    write(dir, "allurerc.json", JSON.stringify({ name: "Allure Report", output: "./allure-report", knownIssuesPath: "./known.json", plugins: { awesome: { options: {} } } }, null, 2));
    stub(dir, "@playwright/test", "1.60.1");
    stub(dir, "allure-playwright", "3.4.5");
    stub(dir, "allure", "3.20.1");
    stub(dir, "@allurereport/plugin-awesome", "3.20.1");
  },
  allure2: (dir) => {
    write(dir, "package.json", JSON.stringify({ name: "my-app", scripts: { test: "vitest run", report: "allure serve allure-results" }, devDependencies: { "allure-commandline": "^2.30.0", vitest: "^3.2.0" } }, null, 2));
  },
};

const shots = [
  { file: "help", fixture: "empty", args: [] },
  { file: "help-all", fixture: "empty", args: ["--help"] },
  { file: "help-init", fixture: "empty", args: ["init", "--help"] },
  { file: "help-doctor", fixture: "empty", args: ["doctor", "--help"] },
  { file: "plugin-list", fixture: "empty", args: ["plugin", "list"] },
  { file: "init-dry-run", fixture: "vitest", args: ["init", "--yes", "--dry-run"] },
  { file: "demo", fixture: "vitest", args: ["demo"] },
  { file: "doctor", fixture: "playwrightWithProblems", args: ["doctor"] },
  { file: "migrate", fixture: "allure2", args: ["migrate", "--dry-run"] },
  { file: "ci-init", fixture: "vitest", args: ["ci", "init", "circleci"] },
];

// --- ANSI -> SVG -----------------------------------------------------------------------------------------------

const PALETTE = { 31: "#ff7b72", 32: "#3fb950", 33: "#d29922", 36: "#56d4dd", 39: "#e6edf3" };
const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Splits a line into runs of text with the style active for them. */
const parseLine = (line) => {
  const runs = [];
  let style = { color: PALETTE[39], bold: false, dim: false };
  let last = 0;

  for (const match of line.matchAll(/\u001b\[([0-9;]*)m/g)) {
    if (match.index > last) {
      runs.push({ text: line.slice(last, match.index), ...style });
    }

    for (const code of match[1].split(";").map(Number)) {
      if (code === 0) style = { color: PALETTE[39], bold: false, dim: false };
      else if (code === 1) style = { ...style, bold: true };
      else if (code === 2) style = { ...style, dim: true };
      else if (code === 22) style = { ...style, bold: false, dim: false };
      else if (PALETTE[code]) style = { ...style, color: PALETTE[code] };
    }

    last = match.index + match[0].length;
  }

  if (last < line.length) {
    runs.push({ text: line.slice(last), ...style });
  }

  return runs;
};

/** Wraps a line (as styled characters) at word boundaries; continuation lines keep the line's indent plus two spaces. */
const MAX_COLS = 96;

const wrap = (runs) => {
  const chars = runs.flatMap((run) => [...run.text].map((ch) => ({ ch, color: run.color, bold: run.bold, dim: run.dim })));

  if (chars.length <= MAX_COLS) {
    return [runs];
  }

  const indent = chars.findIndex((c) => c.ch !== " ");
  const prefix = (chars[0] ? chars.slice(0, Math.max(indent, 0) + 2) : []).map((c) => ({ ...c, ch: " " }));
  const rows = [];
  let rest = chars;

  while (rest.length > MAX_COLS) {
    let cut = rest.slice(0, MAX_COLS + 1).map((c) => c.ch).lastIndexOf(" ");

    if (cut <= prefix.length) {
      cut = MAX_COLS;
    }

    rows.push(rest.slice(0, cut));
    rest = [...prefix, ...rest.slice(cut).filter((_, i, all) => i >= all.findIndex((c) => c.ch !== " "))];
  }

  rows.push(rest);

  return rows.map((row) => {
    const grouped = [];

    for (const c of row) {
      const last = grouped[grouped.length - 1];

      if (last && last.color === c.color && last.bold === c.bold && last.dim === c.dim) {
        last.text += c.ch;
      } else {
        grouped.push({ text: c.ch, color: c.color, bold: c.bold, dim: c.dim });
      }
    }

    return grouped;
  });
};

const FONT = 14;
const CHAR = 8.45; // advance of the monospace font at 14px
const LINE = 21;
const PAD = 22;
const BAR = 38;

const toSvg = (command, output) => {
  const lines = output.replace(/\s+$/, "").split("\n").flatMap((line) => wrap(parseLine(line)));
  const plain = lines.map((runs) => runs.map((run) => run.text).join(""));
  const cols = Math.max(command.length + 2, ...plain.map((text) => [...text].length), 60);
  const width = Math.ceil(cols * CHAR + PAD * 2);
  const height = BAR + PAD + (lines.length + 1) * LINE + PAD / 2;
  const rows = [`<text x="${PAD}" y="${BAR + PAD + FONT - 4}" fill="#8b949e">$</text><text x="${PAD + CHAR * 2}" y="${BAR + PAD + FONT - 4}" fill="#e6edf3" font-weight="600">${esc(command)}</text>`];

  lines.forEach((runs, index) => {
    const y = BAR + PAD + FONT - 4 + (index + 1) * LINE;
    const spans = runs
      .map(({ text, color, bold, dim }) => `<tspan fill="${color}"${bold ? ' font-weight="700"' : ""}${dim ? ' fill-opacity="0.62"' : ""}>${esc(text)}</tspan>`)
      .join("");

    rows.push(`<text x="${PAD}" y="${y}" xml:space="preserve">${spans}</text>`);
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Terminal: ${esc(command)}">
<rect width="${width}" height="${height}" rx="10" fill="#0d1117"/>
<rect width="${width}" height="${BAR}" rx="10" fill="#161b22"/><rect y="${BAR - 10}" width="${width}" height="10" fill="#161b22"/>
<circle cx="22" cy="19" r="6" fill="#ff5f56"/><circle cx="42" cy="19" r="6" fill="#ffbd2e"/><circle cx="62" cy="19" r="6" fill="#27c93f"/>
<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" font-size="${FONT}">
${rows.join("\n")}
</g>
</svg>
`;
};

// --- run -------------------------------------------------------------------------------------------------------

for (const { file, fixture, args } of shots) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "allure-kit-shot-")));

  try {
    fixtures[fixture](dir);

    const result = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: "utf-8", env: { ...process.env, FORCE_COLOR: "1", NO_COLOR: "" } });
    const output = `${result.stdout}${result.stderr}`.split(dir).join("/home/dev/my-app");

    writeFileSync(join(outDir, `${file}.svg`), toSvg(["allure-kit", ...args].join(" "), output));
    console.log(`✓ ${file}.svg (${output.split("\n").length} lines)`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
