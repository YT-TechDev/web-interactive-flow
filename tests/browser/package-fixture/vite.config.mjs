import { defineConfig } from "vite";

export default defineConfig({
  // Qualification policy: keep Wasm inspectable for byte-level provenance.
  build: { assetsInlineLimit: 0 },
});
