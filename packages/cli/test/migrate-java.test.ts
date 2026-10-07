import { describe, expect, it } from "vitest";

import { migrateGradle, migratePom } from "../src/migrate-java.js";

describe("kit/migrate-java", () => {
  const pom = `<project>
  <properties><allure.version>2.29.0</allure.version></properties>
  <dependencies>
    <dependency><groupId>io.qameta.allure</groupId><artifactId>allure-junit5</artifactId></dependency>
    <dependency><groupId>io.qameta.allure</groupId><artifactId>allure-junit5-assert</artifactId></dependency>
  </dependencies>
</project>`;

  it("renames the Maven artifacts and bumps the shared allure.version", () => {
    const { content, changes, warnings } = migratePom(pom);

    expect(content).toContain("<artifactId>allure-jupiter</artifactId>");
    expect(content).toContain("<artifactId>allure-jupiter-assert</artifactId>");
    expect(content).toContain("<allure.version>3.0.0</allure.version>");
    expect(content).not.toContain("allure-junit5");
    expect(changes).toHaveLength(3);
    expect(warnings.some((w) => w.includes("Java 17"))).toBe(true);
  });

  it("leaves a pom without allure-junit5 untouched and silent", () => {
    const clean = "<project><artifactId>allure-jupiter</artifactId></project>";

    expect(migratePom(clean)).toEqual({ content: clean, changes: [], warnings: [] });
  });

  it("warns instead of guessing when there is no allure.version property or a dependency pins 2.x", () => {
    const { content, warnings } = migratePom(
      "<dependency><artifactId>allure-junit5</artifactId><version>2.29.0</version></dependency>",
    );

    expect(content).toContain("<artifactId>allure-jupiter</artifactId><version>2.29.0</version>");
    expect(warnings.some((w) => w.includes("No <allure.version> property"))).toBe(true);
    expect(warnings.some((w) => w.includes("still has its own <version> 2.x"))).toBe(true);
  });

  it("does not touch a property that is already 3.x", () => {
    const { content } = migratePom(pom.replace("2.29.0", "3.0.0"));

    expect(content).toContain("<allure.version>3.0.0</allure.version>");
  });

  it("renames Gradle coordinates in both DSLs without touching similar names", () => {
    const { content, changes } = migrateGradle(
      `testImplementation("io.qameta.allure:allure-junit5:2.29.0")\ntestImplementation 'io.qameta.allure:allure-junit5-assert'\ntestImplementation("io.qameta.allure:allure-java-commons")`,
    );

    expect(content).toContain("io.qameta.allure:allure-jupiter:2.29.0");
    expect(content).toContain("io.qameta.allure:allure-jupiter-assert");
    expect(content).toContain("allure-java-commons");
    expect(changes).toHaveLength(2);
  });
});
