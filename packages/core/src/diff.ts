/**
 * Minimal line diff for previewing file changes (`init --dry-run`). Prints changed lines with `+`/`-` and
 * `context` unchanged lines around each change; returns an empty string when nothing differs.
 */
export const diffLines = (before: string, after: string, context = 2): string => {
  const toLines = (text: string) => (text === "" ? [] : text.replace(/\n$/, "").split("\n"));
  const a = toLines(before);
  const b = toLines(after);
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const ops: { kind: " " | "+" | "-"; line: string }[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: " ", line: a[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ kind: "-", line: a[i++] });
    } else {
      ops.push({ kind: "+", line: b[j++] });
    }
  }

  while (i < a.length) {
    ops.push({ kind: "-", line: a[i++] });
  }

  while (j < b.length) {
    ops.push({ kind: "+", line: b[j++] });
  }

  const keep = ops.map(() => false);

  ops.forEach((op, index) => {
    if (op.kind !== " ") {
      for (let k = Math.max(0, index - context); k <= Math.min(ops.length - 1, index + context); k++) {
        keep[k] = true;
      }
    }
  });

  const out: string[] = [];

  ops.forEach((op, index) => {
    if (keep[index]) {
      out.push(`${op.kind} ${op.line}`);
    } else if (out.length > 0 && out[out.length - 1] !== "  …") {
      out.push("  …");
    }
  });

  while (out.length > 0 && out[out.length - 1] === "  …") {
    out.pop();
  }

  return ops.some((op) => op.kind !== " ") ? out.join("\n") : "";
};
