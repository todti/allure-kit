/**
 * Just enough XML to insert Maven configuration without disturbing the rest of a pom: a tag tokenizer that
 * understands comments, CDATA, processing instructions and quoted attribute values, and reports each element's
 * position and path. It does not validate the document.
 */

export interface XmlElement {
  name: string;
  path: string[];
  /** Index of the opening tag's `<`. */
  openStart: number;
  /** Index just past the opening tag's `>`. */
  contentStart: number;
  /** Index of the closing tag's `<`; equals `contentStart` for self-closing tags. */
  contentEnd: number;
  selfClosing: boolean;
}

export const parseXmlElements = (text: string): XmlElement[] => {
  const elements: XmlElement[] = [];
  const stack: { name: string; contentStart: number; index: number }[] = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] !== "<") {
      i++;
      continue;
    }

    if (text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);

      i = end === -1 ? text.length : end + 3;
    } else if (text.startsWith("<![CDATA[", i)) {
      const end = text.indexOf("]]>", i + 9);

      i = end === -1 ? text.length : end + 3;
    } else if (text.startsWith("<?", i) || text.startsWith("<!", i)) {
      const end = text.indexOf(">", i + 2);

      i = end === -1 ? text.length : end + 1;
    } else if (text.startsWith("</", i)) {
      const end = text.indexOf(">", i);
      const open = stack.pop();

      if (open) {
        elements[open.index].contentEnd = i;
      }

      i = end === -1 ? text.length : end + 1;
    } else {
      const name = /^<([^\s/>]+)/.exec(text.slice(i, i + 200))?.[1] ?? "";
      let j = i + 1 + name.length;
      let quote = "";

      while (j < text.length && (quote || text[j] !== ">")) {
        if (quote) {
          if (text[j] === quote) {
            quote = "";
          }
        } else if (text[j] === '"' || text[j] === "'") {
          quote = text[j];
        }

        j++;
      }

      const selfClosing = text[j - 1] === "/";
      const path = [...stack.map((entry) => entry.name), name];

      elements.push({ name, path, openStart: i, contentStart: j + 1, contentEnd: j + 1, selfClosing });

      if (!selfClosing) {
        stack.push({ name, contentStart: j + 1, index: elements.length - 1 });
      }

      i = j + 1;
    }
  }

  return elements;
};

export const findElement = (elements: XmlElement[], path: string[]): XmlElement | undefined =>
  elements.find((element) => element.path.length === path.length && element.path.every((segment, n) => segment === path[n]));

/** Whitespace-only indentation of the line that starts at or contains `index`, or null if other text precedes it. */
export const lineIndent = (text: string, index: number): string | null => {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  const prefix = text.slice(lineStart, index);

  return /^[ \t]*$/.test(prefix) ? prefix : null;
};

/** Appends a block (already indented relative to column 0 of its first line) as the last child of `element`. */
export const appendChild = (text: string, element: XmlElement, block: (childIndent: string, unit: string) => string, unit: string): string => {
  const closeIndent = lineIndent(text, element.contentEnd);
  const baseIndent = closeIndent ?? lineIndent(text, element.openStart) ?? "";
  const childIndent = `${baseIndent}${unit}`;
  const rendered = block(childIndent, unit);

  if (closeIndent !== null) {
    // `\n<closeIndent></tag>`: put the child on its own line right before the closing tag's line.
    const lineStart = element.contentEnd - closeIndent.length;

    return `${text.slice(0, lineStart)}${rendered}\n${text.slice(lineStart)}`;
  }

  return `${text.slice(0, element.contentEnd)}\n${rendered}\n${baseIndent}${text.slice(element.contentEnd)}`;
};
