import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },  // same @/ alias Next.js uses
  },
  test: {
    environment: "node",   // model code is pure logic, no browser needed
  },
});