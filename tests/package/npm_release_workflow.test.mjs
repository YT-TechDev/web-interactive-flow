import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const WORKFLOW = new URL(
  "../../.github/workflows/npm-release.yml",
  import.meta.url,
);

test("npm release workflow preserves the qualified publication boundary", async () => {
  const source = await readFile(WORKFLOW, "utf8");

  assert.match(source, /release:\s*\n\s*types:\s*\n\s*- published/);
  assert.doesNotMatch(source, /\n\s*push:\s*(?:\n|$)/);
  assert.match(source, /permissions: \{\}/);
  assert.match(
    source,
    /concurrency:\s*\n\s*group: npm-release\s*\n\s*cancel-in-progress: false/,
  );
  assert.match(source, /if: github\.event\.release\.prerelease == false/);

  assert.match(source, /permissions:\s*\n\s*contents: read\s*\n\s*id-token: write/);
  assert.match(
    source,
    /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/,
  );
  assert.match(
    source,
    /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/,
  );
  assert.match(source, /node-version: 22\.14\.0/);
  assert.match(source, /npm install --global npm@11\.5\.1/);

  assert.match(source, /INPUT_TAG: \$\{\{ github\.event\.release\.tag_name \}\}/);
  assert.match(source, /tag="\$INPUT_TAG"/);
  assert.doesNotMatch(
    source,
    /tag="\$\{\{ github\.event\.release\.tag_name \}\}"/,
  );
  assert.match(source, /\^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$/);
  assert.match(source, /grep -Fx "version = \\"\$version\\""/);
  assert.match(source, /git merge-base --is-ancestor HEAD origin\/main/);

  assert.match(source, /stagePackageArtifact\(\{/);
  assert.match(source, /name: "web-interactive-flow"/);
  assert.match(source, /r3fPeerVersion: "9\.8\.0"/);
  assert.match(
    source,
    /cmp \.release-stage\/core\.wasm _build\/wasm\/debug\/build\/core\/core\.wasm/,
  );

  assert.match(
    source,
    /\.release-pack\/web-interactive-flow-\$RELEASE_VERSION\.tgz/,
  );
  assert.match(
    source,
    /npm view "web-interactive-flow@\$RELEASE_VERSION" version --json/,
  );
  assert.match(source, /grep -Eq 'E404\|404 Not Found'/);
  assert.match(source, /npm registry identity lookup failed/);
  assert.match(source, /npm registry version lookup failed/);
  assert.match(
    source,
    /npm publish "\$RELEASE_TARBALL" --access public --provenance/,
  );
  assert.match(source, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/);
  assert.match(
    source,
    /remove registry-url together with the NODE_AUTH_TOKEN publish env/,
  );

  assert.doesNotMatch(source, /npm publish\s+\.\s/);
  assert.doesNotMatch(source, /permissions:\s*write-all/);
});
