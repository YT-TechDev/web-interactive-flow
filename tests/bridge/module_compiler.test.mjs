import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compileFlowModule } from "../../bridge/module_compiler.mjs";
import { REQUIRED_ABI_FUNCTIONS } from "../../bridge/internal.mjs";
import { createFlowRuntime } from "../../bridge/runtime.mjs";

const WASM_MIME = "application/wasm";
const EMPTY_WASM = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d,
  0x01, 0x00, 0x00, 0x00,
]);
const artifactUrl = new URL(
  "../../_build/wasm/debug/build/core/core.wasm",
  import.meta.url,
);
const sourceUrl = new URL("../../bridge/module_compiler.mjs", import.meta.url);
const artifactBytesPromise = readFile(artifactUrl);

function wasmResponse(bytes, init = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.omitContentType !== true) {
    headers.set("Content-Type", WASM_MIME);
  }

  return new Response(bytes, {
    status: init.status ?? 200,
    headers,
  });
}


function encodeU32(value) {
  const bytes = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (remaining !== 0);
  return bytes;
}

function encodeString(value) {
  const bytes = [...new TextEncoder().encode(value)];
  return [...encodeU32(bytes.length), ...bytes];
}

function wasmSection(id, payload) {
  return [id, ...encodeU32(payload.length), ...payload];
}

function importingWifShapedWasm() {
  const typeSection = wasmSection(1, [1, 0x60, 0, 0]);
  const importSection = wasmSection(2, [
    1,
    ...encodeString("m"),
    ...encodeString("f"),
    0x00,
    0x00,
  ]);
  const exportEntries = REQUIRED_ABI_FUNCTIONS.flatMap((name) => [
    ...encodeString(name),
    0x00,
    0x00,
  ]);
  const exportSection = wasmSection(7, [
    ...encodeU32(REQUIRED_ABI_FUNCTIONS.length),
    ...exportEntries,
  ]);

  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d,
    0x01, 0x00, 0x00, 0x00,
    ...typeSection,
    ...importSection,
    ...exportSection,
  ]);
}

test("L01: current WIF artifact compiles from exact application/wasm Response", async () => {
  const bytes = await artifactBytesPromise;
  const response = wasmResponse(bytes);

  const module = await compileFlowModule(response);

  assert.equal(module instanceof WebAssembly.Module, true);
  assert.equal(response.bodyUsed, true);
  assert.deepEqual(WebAssembly.Module.imports(module), []);
});

test("L02: Promise<Response> composes directly with the compiler", async () => {
  const bytes = await artifactBytesPromise;
  const module = await compileFlowModule(
    Promise.resolve(wasmResponse(bytes)),
  );

  assert.equal(module instanceof WebAssembly.Module, true);
});

test("L03: unrelated valid Wasm is rejected after successful compilation", async () => {
  await assert.rejects(
    compileFlowModule(wasmResponse(EMPTY_WASM)),
  );
});

test("L04: WIF-shaped valid Wasm with imports is rejected", async () => {
  const bytes = importingWifShapedWasm();
  const compiled = await WebAssembly.compile(bytes);

  assert.equal(WebAssembly.Module.imports(compiled).length, 1);
  assert.deepEqual(
    WebAssembly.Module.exports(compiled).map(({ name, kind }) => ({
      name,
      kind,
    })),
    REQUIRED_ABI_FUNCTIONS.map((name) => ({
      name,
      kind: "function",
    })),
  );

  await assert.rejects(
    compileFlowModule(wasmResponse(bytes)),
  );
});

test("L05: missing, wrong, and parameterized MIME fail closed", async () => {
  const bytes = await artifactBytesPromise;

  const cases = [
    wasmResponse(bytes, { omitContentType: true }),
    wasmResponse(bytes, { headers: { "Content-Type": "text/plain" } }),
    wasmResponse(bytes, {
      headers: { "Content-Type": "application/wasm; charset=binary" },
    }),
  ];

  for (const response of cases) {
    await assert.rejects(compileFlowModule(response));
  }
});

test("L06: non-ok Response fails without alternate compilation path", async () => {
  const bytes = await artifactBytesPromise;

  await assert.rejects(
    compileFlowModule(wasmResponse(bytes, { status: 500 })),
  );
});

test("L07: malformed Wasm fails compilation under correct MIME", async () => {
  await assert.rejects(
    compileFlowModule(wasmResponse(new Uint8Array([0x00, 0x01, 0x02]))),
  );
});

test("Response body is consumed once with no hidden clone/retry", async () => {
  const bytes = await artifactBytesPromise;
  const response = wasmResponse(bytes);

  await compileFlowModule(response);
  assert.equal(response.bodyUsed, true);

  await assert.rejects(compileFlowModule(response));
});

test("L08: one returned Module creates isolated semantic Runtime instances", async () => {
  const bytes = await artifactBytesPromise;
  const module = await compileFlowModule(wasmResponse(bytes));

  const a = createFlowRuntime(module, {
    phases: ["A", "B"],
    initial: "A",
    transitionDuration: 1000,
    cooldown: 500,
  });
  const b = createFlowRuntime(module, {
    phases: ["X", "Y", "Z"],
    initial: "Z",
    transitionDuration: 2000,
    cooldown: 0,
  });

  assert.equal(a.next(), "accepted");
  a.tick(500);

  assert.deepEqual(a.getSnapshot(), {
    selected: "B",
    transition: {
      direction: "forward",
      rawProgress: 0.5,
    },
    cooldownActive: false,
    locked: false,
  });

  assert.deepEqual(b.getSnapshot(), {
    selected: "Z",
    transition: null,
    cooldownActive: false,
    locked: false,
  });

  a.dispose();
  b.dispose();
});

test("L09: acquisition creates no WebAssembly.Instance", async () => {
  const bytes = await artifactBytesPromise;
  const OriginalInstance = WebAssembly.Instance;
  let instanceCalls = 0;

  WebAssembly.Instance = function forbiddenInstanceDuringAcquisition() {
    instanceCalls += 1;
    throw new Error("acquisition must not instantiate");
  };

  try {
    const module = await compileFlowModule(wasmResponse(bytes));
    assert.equal(module instanceof WebAssembly.Module, true);
    assert.equal(instanceCalls, 0);
  } finally {
    WebAssembly.Instance = OriginalInstance;
  }
});

test("L10: compiler owns no fetch, URL, buffered fallback, instance, or clone policy", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /WebAssembly\.compileStreaming\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bnew\s+URL\s*\(/);
  assert.doesNotMatch(source, /\.arrayBuffer\s*\(/);
  assert.doesNotMatch(source, /WebAssembly\.compile\s*\(/);
  assert.doesNotMatch(source, /WebAssembly\.instantiateStreaming\s*\(/);
  assert.doesNotMatch(source, /new\s+WebAssembly\.Instance\s*\(/);
  assert.doesNotMatch(source, /\.clone\s*\(/);
});
