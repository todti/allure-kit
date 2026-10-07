import { readFile, writeFile } from "node:fs/promises";

import { findExistingConfig } from "@todti/allure-kit-core";

/** Applies a text edit to an ESM/CJS `allurerc`. Returns false when the file is missing or the edit isn't possible. */
export const editMjsConfig = async (cwd: string, edit: (source: string) => string | null): Promise<boolean> => {
  const existing = await findExistingConfig(cwd);

  if (!existing || existing.format !== "mjs") {
    return false;
  }

  const source = await readFile(existing.path, "utf-8");
  const edited = edit(source);

  if (edited === null) {
    return false;
  }

  if (edited !== source) {
    await writeFile(existing.path, edited, "utf-8");
  }

  return true;
};
