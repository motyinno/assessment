import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest does not read `paths` from tsconfig.json, so the `@/*` alias is
 * redeclared here. Node environment only — nothing under test touches the DOM.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
