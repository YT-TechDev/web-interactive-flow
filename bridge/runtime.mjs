import {
  assertCompatibleModule,
  createSemanticRuntimeFromAbi,
  normalizeConfig,
} from "./internal.mjs";

export function createFlowRuntime(module, config) {
  const normalizedConfig = normalizeConfig(config);
  assertCompatibleModule(module);

  const instance = new WebAssembly.Instance(module, {});
  return createSemanticRuntimeFromAbi(instance.exports, normalizedConfig);
}
