// Vitest config para testes de maquinaria de IA (.claude/).
// Rodar de workspace/src: npx vitest run --config vitest.claude.config.mjs
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "../..").split(String.fromCharCode(92)).join("/");

export default defineConfig({
  test: {
    name: "claude-hooks",
    environment: "node",
    include: [
      ROOT + "/.claude/tests/unit/**/*.test.mjs",
      ROOT + "/.claude/tests/integration/**/*.test.mjs",
    ],
    fileParallelism: false,
    testTimeout: 15000,
  },
});