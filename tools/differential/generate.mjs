import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fixturePath = join(root, "tests/differential/traces.json");
const moonPath = join(root, "core/differential_generated_wbtest.mbt");
const referencePath = join(root, "tests/differential/generated/reference.generated.test.ts");
const MAX_QUANTA = 1_100_000_000;
const ORACLES = new Set(Array.from({ length: 10 }, (_, i) => `O${String(i + 1).padStart(2, "0")}`));
const ACTIONS = new Set(["next", "previous", "known-target", "lock", "unlock", "tick"]);
const FORBIDDEN_KEYS = new Set(["phaseIndex", "phase_index", "targetIndex", "target_index", "cooldown_remaining", "cooldownRemaining"]);

function fail(path, message) { throw new Error(`${path}: ${message}`); }
function object(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "expected object");
  return value;
}
function exactInteger(value, path) {
  if (!Number.isSafeInteger(value)) fail(path, "expected a safe integer");
  return value;
}
function rational(value, path, { progress = false } = {}) {
  object(value, path);
  const numerator = exactInteger(value.numerator, `${path}.numerator`);
  const denominator = exactInteger(value.denominator, `${path}.denominator`);
  if (numerator < 0) fail(path, "numerator must be non-negative");
  if (denominator <= 0) fail(path, "denominator must be positive");
  if (!progress && ((denominator & (denominator - 1)) !== 0 || denominator > 8)) fail(path, "denominator must be one of 1, 2, 4, or 8");
  if (progress && numerator > denominator) fail(path, "active progress must be between zero and one");
  if (!progress && (!Number.isFinite(numerator / denominator) || (numerator / denominator) * denominator !== numerator)) fail(path, "value is not exactly representable as a JavaScript Number");
  return { numerator, denominator };
}
function rejectForbidden(value, path = "fixture") {
  if (Array.isArray(value)) return value.forEach((entry, i) => rejectForbidden(entry, `${path}[${i}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) fail(`${path}.${key}`, "representation-specific field is forbidden");
    rejectForbidden(entry, `${path}.${key}`);
  }
}
function validateObservation(value, path, phases) {
  object(value, path);
  if (!phases.includes(value.selected)) fail(`${path}.selected`, "unknown semantic phase");
  if (typeof value.cooldown_active !== "boolean" || typeof value.locked !== "boolean") fail(path, "cooldown_active and locked must be booleans");
  object(value.transition, `${path}.transition`);
  if (value.transition.kind === "inactive") {
    if (Object.keys(value.transition).length !== 1) fail(`${path}.transition`, "inactive transition cannot contain direction or progress sentinels");
  } else if (value.transition.kind === "active") {
    if (!["forward", "reverse"].includes(value.transition.direction)) fail(`${path}.transition.direction`, "expected forward or reverse");
    rational(value.transition.progress, `${path}.transition.progress`, { progress: true });
  } else fail(`${path}.transition.kind`, "expected active or inactive");
}
function validate() {
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  rejectForbidden(fixture);
  object(fixture, "fixture");
  if (fixture.schema_version !== 1 || !Array.isArray(fixture.traces) || fixture.traces.length === 0) fail("fixture", "expected schema_version 1 and non-empty traces");
  const ids = new Set(); const covered = new Set();
  for (const [i, trace] of fixture.traces.entries()) {
    const path = `traces[${i}]`; object(trace, path);
    if (typeof trace.id !== "string" || !trace.id || ids.has(trace.id)) fail(`${path}.id`, "expected distinct non-empty string"); ids.add(trace.id);
    if (!Array.isArray(trace.covers) || !trace.covers.length) fail(`${path}.covers`, "expected oracle IDs");
    for (const id of trace.covers) { if (!ORACLES.has(id)) fail(`${path}.covers`, `unknown oracle ${id}`); covered.add(id); }
    if (!Array.isArray(trace.phases) || trace.phases.length === 0) fail(`${path}.phases`, "phase domain must be non-empty");
    if (trace.phases.some(p => typeof p !== "string" || !p) || new Set(trace.phases).size !== trace.phases.length) fail(`${path}.phases`, "phase identities must be distinct non-empty strings");
    if (!trace.phases.includes(trace.initial)) fail(`${path}.initial`, "initial phase must exist");
    rational(trace.transition_duration, `${path}.transition_duration`); rational(trace.cooldown, `${path}.cooldown`);
    if (!Array.isArray(trace.actions) || trace.actions.length === 0) fail(`${path}.actions`, "actions must be non-empty");
    for (const [j, action] of trace.actions.entries()) {
      const ap = `${path}.actions[${j}]`; object(action, ap);
      if (!ACTIONS.has(action.kind)) fail(`${ap}.kind`, "unknown action kind");
      if (action.kind === "known-target" && !trace.phases.includes(action.target)) fail(`${ap}.target`, "unknown target is a malformed fixture");
      if (action.kind === "tick") rational(action.dt, `${ap}.dt`);
      const request = ["next", "previous", "known-target"].includes(action.kind);
      if (request !== ["accepted", "rejected"].includes(action.disposition)) fail(`${ap}.disposition`, request ? "request needs accepted/rejected" : "non-request cannot have disposition");
      validateObservation(action.expected, `${ap}.expected`, trace.phases);
    }
    const times = [trace.transition_duration, trace.cooldown, ...trace.actions.filter(a => a.kind === "tick").map(a => a.dt)];
    const scale = Math.max(...times.map(t => t.denominator));
    for (const time of times) { const scaled = time.numerator * (scale / time.denominator); if (!Number.isSafeInteger(scaled) || scaled > MAX_QUANTA) fail(path, `scaled time exceeds supported ${MAX_QUANTA}-quantum test bound`); }
    trace._scale = scale;
  }
  for (const id of ORACLES) if (!covered.has(id)) fail("fixture", `missing ${id} coverage metadata`);
  return fixture;
}
const q = s => JSON.stringify(s);
const moonR = r => `{ numerator: ${r.numerator}, denominator: ${r.denominator} }`;
function moonObs(o, duration) {
  if (o.transition.kind === "inactive") return [
    `{`, `  selected_phase: ${q(o.selected)},`, `  transition: ObservedTransition::Inactive,`,
    `  cooldown_active: ${o.cooldown_active},`, `  locked: ${o.locked},`, `}`,
  ];
  const numerator = o.transition.progress.numerator * duration / o.transition.progress.denominator;
  if (!Number.isInteger(numerator)) fail("expected progress", "does not map exactly to the normalized MoonBit duration");
  const direction = o.transition.direction === "forward" ? "Forward" : "Reverse";
  return [
    `{`, `  selected_phase: ${q(o.selected)},`,
    `  transition: ObservedTransition::Active(ObservedDirection::Observed${direction}, {`,
    `    numerator: ${numerator},`, `    denominator: ${duration},`, `  }),`,
    `  cooldown_active: ${o.cooldown_active},`, `  locked: ${o.locked},`, `}`,
  ];
}
function moonAction(a, phases, scale) {
  if (a.kind === "next") return "TraceAction::Next";
  if (a.kind === "previous") return "TraceAction::Previous";
  if (a.kind === "known-target") return `TraceAction::KnownTarget(${phases.indexOf(a.target)})`;
  if (a.kind === "lock") return "TraceAction::Lock";
  if (a.kind === "unlock") return "TraceAction::Unlock";
  return `TraceAction::Tick(${a.dt.numerator * (scale / a.dt.denominator)})`;
}
function generateMoon(fixture) {
  let out = "// Generated by tools/differential/generate.mjs from tests/differential/traces.json.\n// Do not edit by hand. This is white-box test code, not a product API.\n";
  for (const trace of fixture.traces) {
    const scale = trace._scale;
    out += `\n///|\ntest ${q(`differential ${trace.id} [${trace.covers.join(",")}]`)} {\n`;
    out += `  let runtime = valid_runtime([${trace.phases.map(q).join(", ")}], ${trace.phases.indexOf(trace.initial)}, ${trace.transition_duration.numerator * (scale / trace.transition_duration.denominator)}, ${trace.cooldown.numerator * (scale / trace.cooldown.denominator)})\n`;
    for (const action of trace.actions) {
      const result = action.disposition ? `TraceActionResult::Request(RequestDisposition::${action.disposition === "accepted" ? "Accepted" : "Rejected"})` : "TraceActionResult::NoRequestDisposition";
      out += `  assert_eq(\n    apply_trace_action(runtime, ${moonAction(action, trace.phases, scale)}),\n    ${result},\n  )\n`;
      const observation = moonObs(action.expected, trace.transition_duration.numerator * (scale / trace.transition_duration.denominator));
      out += `  assert_eq(observe(runtime), ${observation[0]}\n${observation.slice(1, -1).map(line => `  ${line}`).join("\n")}\n  ${observation.at(-1)})\n`;
    }
    out += "}\n";
  }
  return out;
}
function generateReference(fixture) {
  const clean = fixture.traces.map(({ _scale, ...trace }) => trace);
  return `// Generated by tools/differential/generate.mjs from tests/differential/traces.json.\n// Do not edit by hand. This is a test-only semantic adapter, not a product API.\nimport { describe, expect, test } from "vitest";\nimport { createFlow } from "./createFlow";\n\nconst traces = ${JSON.stringify(clean, null, 2)} as const;\nconst number = (r: { numerator: number; denominator: number }) => r.numerator / r.denominator;\nconst linear = (progress: number) => progress;\n\nfunction project(snapshot: ReturnType<ReturnType<typeof createFlow>["getSnapshot"]>) {\n  return {\n    selected: snapshot.phase,\n    transition: snapshot.isTransitioning\n      ? { kind: "active", direction: snapshot.direction, progress: snapshot.progress }\n      : { kind: "inactive" },\n    cooldown_active: snapshot.isCoolingDown,\n    locked: snapshot.isLocked,\n  };\n}\n\ndescribe("shared O01-O10 semantic traces", () => {\n  for (const trace of traces) test(\`\${trace.id} [\${trace.covers.join(",")}]\`, () => {\n    const flow = createFlow({ phases: [...trace.phases], initialPhase: trace.initial, transition: { duration: number(trace.transition_duration), easing: linear }, cooldown: number(trace.cooldown) });\n    for (const action of trace.actions) {\n      let disposition: boolean | undefined;\n      switch (action.kind) {\n        case "next": disposition = flow.next(); break;\n        case "previous": disposition = flow.previous(); break;\n        case "known-target": disposition = flow.navigate(action.target); break;\n        case "lock": flow.lock(); break;\n        case "unlock": flow.unlock(); break;\n        case "tick": flow.tick(number(action.dt)); break;\n      }\n      if ("disposition" in action) expect(disposition).toBe(action.disposition === "accepted");\n      const actual = project(flow.getSnapshot());\n      expect(actual.selected).toBe(action.expected.selected);\n      expect(actual.cooldown_active).toBe(action.expected.cooldown_active);\n      expect(actual.locked).toBe(action.expected.locked);\n      expect(actual.transition.kind).toBe(action.expected.transition.kind);\n      if (action.expected.transition.kind === "active") {\n        if (actual.transition.kind !== "active") throw new Error("expected active transition");\n        expect(actual.transition.direction).toBe(action.expected.transition.direction);\n        expect(actual.transition.progress).toBe(number(action.expected.transition.progress));\n      }\n    }\n  });\n});\n`;
}
const fixture = validate();
writeFileSync(moonPath, generateMoon(fixture));
writeFileSync(referencePath, generateReference(fixture));
