import { access, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);

    return true;
  } catch {
    return false;
  }
};

export const matchesGlob = (filename: string, pattern: string): boolean => {
  let regexStr = "";
  let i = 0;

  while (i < pattern.length) {
    if (pattern[i] === "*" && pattern[i + 1] === "*") {
      if (pattern[i + 2] === "/") {
        regexStr += "(?:.+/)?";
        i += 3;
      } else {
        regexStr += ".*";
        i += 2;
      }
    } else if (pattern[i] === "*") {
      regexStr += "[^/]*";
      i++;
    } else if (".+^${}()|[]\\".includes(pattern[i])) {
      regexStr += `\\${pattern[i]}`;
      i++;
    } else {
      regexStr += pattern[i];
      i++;
    }
  }

  return new RegExp(`^${regexStr}$`).test(filename);
};

export const scanDirectoryShallow = async (dir: string, maxDepth: number, currentDepth = 0): Promise<string[]> => {
  if (currentDepth > maxDepth) {
    return [];
  }

  const results: string[] = [];

  try {
    const entries = await readdir(dir);

    for (const entry of entries) {
      if (entry === "node_modules" || entry === ".git" || entry === "dist" || entry === "build") {
        continue;
      }

      const fullPath = join(dir, entry);

      try {
        const entryStat = await stat(fullPath);

        if (entryStat.isFile()) {
          results.push(entry);
        } else if (entryStat.isDirectory() && currentDepth < maxDepth) {
          const subEntries = await scanDirectoryShallow(fullPath, maxDepth, currentDepth + 1);

          for (const subEntry of subEntries) {
            results.push(join(entry, subEntry));
          }
        }
      } catch {
        // skip inaccessible entries
      }
    }
  } catch {
    // skip inaccessible directories
  }

  return results;
};
