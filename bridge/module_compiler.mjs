import { assertCompatibleModule } from "./internal.mjs";

export async function compileFlowModule(source) {
  const response = await source;
  const bytes = await response.arrayBuffer();
  const module = await WebAssembly.compile(bytes);
  assertCompatibleModule(module);
  return module;
}
