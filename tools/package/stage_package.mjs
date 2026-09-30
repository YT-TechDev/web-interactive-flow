import {
  copyFile,
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const PACKAGE_DESCRIPTION =
  "Deterministic, host-independent interaction-flow runtime for the Web, powered by MoonBit and WebAssembly.";
const PACKAGE_REPOSITORY_URL =
  "git+https://github.com/YT-TechDev/web-interactive-flow.git";
const PACKAGE_HOMEPAGE =
  "https://github.com/YT-TechDev/web-interactive-flow#readme";
const PACKAGE_BUGS_URL =
  "https://github.com/YT-TechDev/web-interactive-flow/issues";

const PRODUCTION_COPY_PATHS = [
  "bridge/runtime.mjs",
  "bridge/module_compiler.mjs",
  "bridge/frame_scheduler.mjs",
  "bridge/clock.mjs",
  "bridge/wheel_ownership.mjs",
  "bridge/internal.mjs",
  "adapters/r3f/use_flow_frame.mjs",
];

const ROOT_FACADE = `export { createFlowRuntime } from "./bridge/runtime.mjs";
export { compileFlowModule } from "./bridge/module_compiler.mjs";
export { createFrameScheduler } from "./bridge/frame_scheduler.mjs";
export { applyWheelNavigationIntent } from "./bridge/wheel_ownership.mjs";
`;

const R3F_FACADE =
  'export { useFlowFrame } from "./adapters/r3f/use_flow_frame.mjs";\n';

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`invalid ${label}`);
  }
}

async function copyRepositoryFile(relativePath, destinationRoot) {
  const source = path.join(REPOSITORY_ROOT, relativePath);
  const destination = path.join(destinationRoot, relativePath);

  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

export async function stagePackageArtifact({
  destination,
  name,
  version,
  r3fPeerVersion,
}) {
  requireNonEmptyString(destination, "destination");
  requireNonEmptyString(name, "package name");
  requireNonEmptyString(version, "package version");
  requireNonEmptyString(r3fPeerVersion, "R3F peer version");

  const stageRoot = path.resolve(destination);

  await rm(stageRoot, { recursive: true, force: true });
  await mkdir(stageRoot, { recursive: true });

  for (const relativePath of PRODUCTION_COPY_PATHS) {
    await copyRepositoryFile(relativePath, stageRoot);
  }

  await copyRepositoryFile(
    "_build/wasm/debug/build/core/core.wasm",
    stageRoot,
  );
  await copyFile(
    path.join(stageRoot, "_build/wasm/debug/build/core/core.wasm"),
    path.join(stageRoot, "core.wasm"),
  );
  await rm(path.join(stageRoot, "_build"), { recursive: true, force: true });

  for (const relativePath of [
    "README.md",
    "LICENSE",
    "CHANGELOG.md",
    "docs/USAGE.md",
    "docs/PUBLIC_API.md",
  ]) {
    await copyRepositoryFile(relativePath, stageRoot);
  }

  await writeFile(path.join(stageRoot, "index.mjs"), ROOT_FACADE, "utf8");
  await writeFile(path.join(stageRoot, "r3f.mjs"), R3F_FACADE, "utf8");

  const manifest = {
    name,
    version,
    type: "module",
    description: PACKAGE_DESCRIPTION,
    license: "MIT",
    repository: {
      type: "git",
      url: PACKAGE_REPOSITORY_URL,
    },
    homepage: PACKAGE_HOMEPAGE,
    bugs: {
      url: PACKAGE_BUGS_URL,
    },
    publishConfig: {
      access: "public",
    },
    exports: {
      ".": "./index.mjs",
      "./r3f": "./r3f.mjs",
      "./core.wasm": "./core.wasm",
    },
    files: [
      "index.mjs",
      "r3f.mjs",
      "bridge/",
      "adapters/",
      "core.wasm",
      "README.md",
      "LICENSE",
      "CHANGELOG.md",
      "docs/USAGE.md",
      "docs/PUBLIC_API.md",
    ],
    peerDependencies: {
      "@react-three/fiber": r3fPeerVersion,
    },
    peerDependenciesMeta: {
      "@react-three/fiber": {
        optional: true,
      },
    },
  };

  await writeFile(
    path.join(stageRoot, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return stageRoot;
}
