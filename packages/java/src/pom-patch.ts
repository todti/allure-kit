import { appendChild, findElement, lineIndent, parseXmlElements, type XmlElement } from "./pom-xml.js";

export const ALLURE_JAVA_VERSION = "3.0.0";
export const ASPECTJ_VERSION = "1.9.25";
const SUREFIRE_VERSION = "3.2.3";

export interface PomPatch {
  content: string;
  /** What was added, for the user. */
  added: string[];
}

export type PomPatchResult = PomPatch | { reason: string };

type Tree = (string | Tree)[];

const lines = (indent: string, unit: string, tree: Tree): string => {
  const render = (nodes: Tree, level: number): string[] =>
    nodes.flatMap((node) => (typeof node === "string" ? [`${indent}${unit.repeat(level)}${node}`] : render(node, level + 1)));

  return render(tree, 0).join("\n");
};

const dependencyXml = (group: string, artifact: string, extra: string[]): Tree => [
  "<dependency>",
  [`<groupId>${group}</groupId>`, `<artifactId>${artifact}</artifactId>`, ...extra],
  "</dependency>",
];

/**
 * Adds the Maven setup from https://allurereport.org/docs/junit5/ — version properties, `allure-bom`, `allure-jupiter`,
 * and the AspectJ agent in `maven-surefire-plugin`'s `argLine` — as text insertions that leave the rest of the pom alone.
 * Backs off with a reason when an existing surefire plugin would have to be merged into.
 */
export const patchPom = (pom: string): PomPatchResult => {
  if (/allure-(jupiter|junit5|testng|bom)/.test(pom)) {
    return { reason: "the pom already references Allure artifacts" };
  }

  let content = pom;
  const added: string[] = [];
  const reparse = () => parseXmlElements(content);
  const project = findElement(reparse(), ["project"]);

  if (!project || project.selfClosing) {
    return { reason: "no <project> element with content found" };
  }

  const modelVersion = findElement(reparse(), ["project", "modelVersion"]);
  const unit = (modelVersion && lineIndent(content, modelVersion.openStart)) || "    ";

  if (/<artifactId>\s*maven-surefire-plugin\s*<\/artifactId>/.test(content)) {
    return { reason: "maven-surefire-plugin is already configured — add the AspectJ -javaagent to its argLine by hand" };
  }

  if (/<argLine>/.test(content) || /<jacoco|jacoco-maven-plugin/.test(content)) {
    return { reason: "an existing argLine (or JaCoCo agent) would have to be merged with the AspectJ agent by hand" };
  }

  const child = (parent: string[], blockFor: (indent: string) => string, create?: { name: string; wrapper: (inner: string, indent: string) => string }) => {
    let element: XmlElement | undefined = findElement(reparse(), parent);

    if (!element && create) {
      const grandparent = findElement(reparse(), parent.slice(0, -1));

      if (!grandparent) {
        return false;
      }

      content = appendChild(content, grandparent, (indent) => create.wrapper(blockFor(`${indent}${unit}`), indent), unit);

      return true;
    }

    if (!element) {
      return false;
    }

    content = appendChild(content, element, (indent) => blockFor(indent), unit);

    return true;
  };

  // 1. <properties>
  const propertyLines = (indent: string) =>
    [
      ...(content.includes("<allure.version>") ? [] : [`${indent}<allure.version>${ALLURE_JAVA_VERSION}</allure.version>`]),
      ...(content.includes("<aspectj.version>") ? [] : [`${indent}<aspectj.version>${ASPECTJ_VERSION}</aspectj.version>`]),
    ].join("\n");

  if (propertyLines("").length > 0) {
    const ok = child(["project", "properties"], propertyLines, {
      name: "properties",
      wrapper: (inner, indent) => `${indent}<properties>\n${inner}\n${indent}</properties>`,
    });

    if (!ok) {
      return { reason: "couldn't place <properties>" };
    }

    added.push("allure.version and aspectj.version properties");
  }

  // 2. allure-bom in dependencyManagement
  const bomBlock = (indent: string) =>
    lines(indent, unit, dependencyXml("io.qameta.allure", "allure-bom", ["<version>${allure.version}</version>", "<type>pom</type>", "<scope>import</scope>"]));

  const managed = findElement(reparse(), ["project", "dependencyManagement", "dependencies"]);

  if (managed) {
    content = appendChild(content, managed, (indent) => bomBlock(indent), unit);
  } else if (
    !child(
      ["project", "dependencyManagement"],
      (indent) => `${indent}<dependencies>\n${bomBlock(`${indent}${unit}`)}\n${indent}</dependencies>`,
      { name: "dependencyManagement", wrapper: (inner, indent) => `${indent}<dependencyManagement>\n${inner}\n${indent}</dependencyManagement>` },
    )
  ) {
    return { reason: "couldn't place <dependencyManagement>" };
  }

  added.push("allure-bom import");

  // 3. allure-jupiter test dependency
  const jupiter = (indent: string) => lines(indent, unit, dependencyXml("io.qameta.allure", "allure-jupiter", ["<scope>test</scope>"]));

  if (
    !child(["project", "dependencies"], jupiter, {
      name: "dependencies",
      wrapper: (inner, indent) => `${indent}<dependencies>\n${inner}\n${indent}</dependencies>`,
    })
  ) {
    return { reason: "couldn't place <dependencies>" };
  }

  added.push("allure-jupiter (test scope)");

  // 4. surefire with the AspectJ agent
  const surefire = (indent: string) =>
    lines(indent, unit, [
      "<plugin>",
      [
        "<groupId>org.apache.maven.plugins</groupId>",
        "<artifactId>maven-surefire-plugin</artifactId>",
        `<version>${SUREFIRE_VERSION}</version>`,
        "<configuration>",
        ['<argLine>-javaagent:"${settings.localRepository}/org/aspectj/aspectjweaver/${aspectj.version}/aspectjweaver-${aspectj.version}.jar"</argLine>'],
        "</configuration>",
        "<dependencies>",
        dependencyXml("org.aspectj", "aspectjweaver", ["<version>${aspectj.version}</version>"]),
        "</dependencies>",
      ],
      "</plugin>",
    ]);

  const plugins = findElement(reparse(), ["project", "build", "plugins"]);

  if (plugins) {
    content = appendChild(content, plugins, (indent) => surefire(indent), unit);
  } else {
    const ok = child(
      ["project", "build"],
      (indent) => `${indent}<plugins>\n${surefire(`${indent}${unit}`)}\n${indent}</plugins>`,
      { name: "build", wrapper: (inner, indent) => `${indent}<build>\n${inner}\n${indent}</build>` },
    );

    if (!ok) {
      return { reason: "couldn't place <build><plugins>" };
    }
  }

  added.push("maven-surefire-plugin with the AspectJ -javaagent");

  return { content, added };
};
