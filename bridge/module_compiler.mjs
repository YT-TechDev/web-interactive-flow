import { assertCompatibleModule } from "./internal.mjs";

export async function compileFlowModule(source) {
  const response = await fetch(source);
  const module = await WebAssembly.compileStreaming(response);
  assertCompatibleModule(module);
  return module;
}
