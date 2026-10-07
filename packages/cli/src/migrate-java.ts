export interface JavaMigration {
  content: string;
  changes: string[];
  warnings: string[];
}

const ALLURE_JAVA_3 = "3.0.0";

const RENAMES: [string, string][] = [
  ["allure-junit5-assert", "allure-jupiter-assert"],
  ["allure-junit5", "allure-jupiter"],
];

/**
 * Allure Java 3.0 stopped publishing allure-junit5 / allure-junit5-assert (allure-jupiter replaces them and needs Java 17+,
 * https://allurereport.org/docs/junit5/). The artifact rename only makes sense together with a 3.x version, so the shared
 * `allure.version` property is bumped too; versions pinned on the dependency itself are left for the user.
 */
export const migratePom = (pom: string): JavaMigration => {
  const changes: string[] = [];
  const warnings: string[] = [];
  let content = pom;

  for (const [from, to] of RENAMES) {
    const artifact = new RegExp(`<artifactId>${from}</artifactId>`, "g");

    if (artifact.test(content)) {
      content = content.replace(artifact, `<artifactId>${to}</artifactId>`);
      changes.push(`artifactId ${from} → ${to}`);
    }
  }

  if (changes.length === 0) {
    return { content, changes, warnings };
  }

  const versionProperty = /<allure\.version>\s*(\d+)\.[^<]*<\/allure\.version>/.exec(content);

  if (versionProperty && Number(versionProperty[1]) < 3) {
    content = content.replace(versionProperty[0], `<allure.version>${ALLURE_JAVA_3}</allure.version>`);
    changes.push(`allure.version ${versionProperty[0].replace(/<[^>]+>/g, "")} → ${ALLURE_JAVA_3}`);
  } else if (!versionProperty) {
    warnings.push(`No <allure.version> property found — make sure the allure-jupiter dependency resolves to ${ALLURE_JAVA_3} or newer (import io.qameta.allure:allure-bom)`);
  }

  if (/<artifactId>allure-jupiter(-assert)?<\/artifactId>\s*<version>\s*2\./.test(content)) {
    warnings.push("A renamed dependency still has its own <version> 2.x — allure-jupiter only exists from Allure Java 3.0; use the BOM or ${allure.version}");
  }

  warnings.push("Allure Java 3 needs Java 17 or newer; also check the aspectjweaver version (docs use 1.9.25) and re-run `allure-kit doctor`");

  return { content, changes, warnings };
};

/** Gradle build scripts: coordinates like `io.qameta.allure:allure-junit5` (the Allure Gradle plugin makes them unnecessary). */
export const migrateGradle = (script: string): JavaMigration => {
  const changes: string[] = [];
  const warnings: string[] = [];
  let content = script;

  for (const [from, to] of RENAMES) {
    const coordinate = new RegExp(`(io\\.qameta\\.allure:)${from}(?![\\w-])`, "g");

    if (coordinate.test(content)) {
      content = content.replace(coordinate, `$1${to}`);
      changes.push(`io.qameta.allure:${from} → ${to}`);
    }
  }

  if (changes.length > 0) {
    warnings.push(
      "Check that the dependency version is 3.x (allure-jupiter doesn't exist in 2.x). With the io.qameta.allure Gradle plugin the adapter dependency can be dropped entirely.",
    );
  }

  return { content, changes, warnings };
};
