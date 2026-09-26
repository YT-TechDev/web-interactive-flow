import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export async function assertExactFileBytes(expectedPath, actualPath, label) {
  assert.deepEqual(
    await readFile(actualPath),
    await readFile(expectedPath),
    label,
  );
}

export async function installLocalTarball({ run, consumerRoot, tarballPath }) {
  if (path.extname(tarballPath) !== ".tgz" || !(await stat(tarballPath)).isFile()) {
    throw new Error("qualification install target must be the produced local npm tarball");
  }
  return run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--no-save",
      tarballPath,
    ],
    consumerRoot,
  );
}

export async function findBuildOutputRoutes(outputRoot) {
  const routes = new Map([["/", "index.html"]]);

  async function visit(relativeDirectory) {
    const directory = path.join(outputRoot, relativeDirectory);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(relative);
      } else if (entry.isFile() && relative !== "index.html") {
        routes.set(`/${relative.split(path.sep).join("/")}`, relative);
      }
    }
  }

  await visit("");
  validateQualificationRoutes(routes);
  return routes;
}

export function validateQualificationRoutes(routes) {
  if (!(routes instanceof Map) || routes.get("/") !== "index.html") {
    throw new Error("qualification routes must explicitly authorize / as index.html");
  }
  for (const [route, relativePath] of routes) {
    if (
      typeof route !== "string" ||
      typeof relativePath !== "string" ||
      !route.startsWith("/") ||
      path.isAbsolute(relativePath) ||
      relativePath.split(/[\\/]/).includes("..") ||
      route === "/core.wasm" ||
      route.startsWith("/bridge/") ||
      route.startsWith("/_build/")
    ) {
      throw new Error(`forbidden qualification route: ${route}`);
    }
  }
}

export function qualificationBuildRoot(consumerRoot) {
  return path.join(consumerRoot, "dist");
}
