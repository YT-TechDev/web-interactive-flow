import { assertCompatibleModule } from "./internal.mjs";

export async function compileFlowModule(source) {
  const response = await source;
  const fallback = response.clone();

  try {
    const module = await WebAssembly.compileStreaming(response);
    assertCompatibleModule(module);
    return module;
  } catch {
    const bytes = await fallback.arrayBuffer();
    const module = await WebAssembly.compile(bytes);
    assertCompatibleModule(module);
    return module;
  }
}
