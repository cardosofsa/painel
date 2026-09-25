import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Sem o alias, qualquer teste que importe "@/lib/..." quebra — os dois testes que já
  // existiam só funcionavam porque usavam caminho relativo.
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.test.ts"],
    },
  },
});
