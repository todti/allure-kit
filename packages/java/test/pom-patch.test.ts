import { describe, expect, it } from "vitest";

import { patchPom } from "../src/pom-patch.js";
import { findElement, parseXmlElements } from "../src/pom-xml.js";

const patched = (pom: string) => {
  const result = patchPom(pom);

  if ("reason" in result) {
    throw new Error(result.reason);
  }

  return result.content;
};

const text = (content: string, path: string[]) => {
  const element = findElement(parseXmlElements(content), path);

  return element ? content.slice(element.contentStart, element.contentEnd) : null;
};

const MINIMAL = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <groupId>demo</groupId>
    <artifactId>demo</artifactId>
    <version>1.0</version>
    <properties>
        <maven.compiler.release>17</maven.compiler.release>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>5.10.0</version>
            <scope>test</scope>
        </dependency>
    </dependencies>
</project>
`;

describe("java/pom-patch", () => {
  it("adds properties, BOM, allure-jupiter and the surefire agent in the right places", () => {
    const content = patched(MINIMAL);
    const elements = parseXmlElements(content);

    expect(text(content, ["project", "properties"])).toContain("<allure.version>3.0.0</allure.version>");
    expect(text(content, ["project", "properties"])).toContain("<maven.compiler.release>17</maven.compiler.release>");
    expect(text(content, ["project", "dependencyManagement", "dependencies"])).toContain("<artifactId>allure-bom</artifactId>");
    expect(text(content, ["project", "dependencyManagement", "dependencies"])).toContain("<scope>import</scope>");
    expect(text(content, ["project", "dependencies"])).toContain("<artifactId>allure-jupiter</artifactId>");
    expect(text(content, ["project", "dependencies"])).toContain("<artifactId>junit-jupiter</artifactId>");
    expect(text(content, ["project", "build", "plugins", "plugin", "configuration", "argLine"])).toContain(
      '-javaagent:"${settings.localRepository}/org/aspectj/aspectjweaver/${aspectj.version}/aspectjweaver-${aspectj.version}.jar"',
    );
    expect(elements.filter((element) => element.path.join("/") === "project/dependencyManagement/dependencies/dependency")).toHaveLength(1);
  });

  it("keeps the original text and indentation intact", () => {
    const content = patched(MINIMAL);

    expect(content.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns=')).toBe(true);
    expect(content).toContain("        <maven.compiler.release>17</maven.compiler.release>\n");
    expect(content).toContain("\n        <allure.version>3.0.0</allure.version>\n");
    expect(content.endsWith("</project>\n")).toBe(true);
  });

  it("creates every missing container and uses a 2-space unit when the pom does", () => {
    const content = patched("<project>\n  <modelVersion>4.0.0</modelVersion>\n</project>\n");

    expect(text(content, ["project", "properties"])).toContain("<aspectj.version>1.9.25</aspectj.version>");
    expect(text(content, ["project", "dependencyManagement", "dependencies", "dependency", "artifactId"])).toBe("allure-bom");
    expect(text(content, ["project", "dependencies", "dependency", "artifactId"])).toBe("allure-jupiter");
    expect(text(content, ["project", "build", "plugins", "plugin", "artifactId"])).toBe("maven-surefire-plugin");
    expect(content).toContain("\n  <properties>\n    <allure.version>");
  });

  it("appends to an existing dependencyManagement and ignores tags inside comments", () => {
    const content = patched(`<project>
  <modelVersion>4.0.0</modelVersion>
  <!-- <dependencies><dependency/></dependencies> -->
  <dependencyManagement>
    <dependencies>
      <dependency><groupId>x</groupId><artifactId>y</artifactId></dependency>
    </dependencies>
  </dependencyManagement>
</project>`);

    expect(text(content, ["project", "dependencyManagement", "dependencies"])).toContain("<artifactId>y</artifactId>");
    expect(text(content, ["project", "dependencyManagement", "dependencies"])).toContain("<artifactId>allure-bom</artifactId>");
    expect(text(content, ["project", "dependencies", "dependency", "artifactId"])).toBe("allure-jupiter");
  });

  it("does not duplicate version properties that already exist", () => {
    const content = patched("<project><modelVersion>4.0.0</modelVersion><properties><allure.version>3.1.0</allure.version></properties></project>");

    expect(content.match(/<allure\.version>/g)).toHaveLength(1);
    expect(content).toContain("<aspectj.version>1.9.25</aspectj.version>");
  });

  it("backs off for an existing surefire plugin, argLine or JaCoCo agent, and for an empty project", () => {
    expect(patchPom("<project><build><plugins><plugin><artifactId>maven-surefire-plugin</artifactId></plugin></plugins></build></project>")).toHaveProperty("reason");
    expect(patchPom("<project><properties><argLine>-Xmx1g</argLine></properties></project>")).toHaveProperty("reason");
    expect(patchPom("<project><build><plugins><plugin><artifactId>jacoco-maven-plugin</artifactId></plugin></plugins></build></project>")).toHaveProperty("reason");
    expect(patchPom("<project/>")).toHaveProperty("reason");
  });
});
