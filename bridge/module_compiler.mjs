import { assertCompatibleModule } from "./internal.mjs";

export async function compileFlowModule(source) {
  const module = await WebAssembly.compileStreaming(source);
  assertCompatibleModule(module);
  new WebAssembly.Instance(module, {});
  return module;
}
