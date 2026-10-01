// Vitest config dedicado para testes da maquinaria de IA (.claude/).
// Rodar de workspace/src: npx vitest run --config vitest.claude.config.ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
// workspace/src -> workspace -> ProjetoUBM (raiz)
const ROOT = path.resolve(path.dirname(__filename), '../..').replace(/\\/g, '/');

export default defineConfig({
  test: {
    name: 'claude-hooks',
    environment: 'node',
    // Usar padroes relativos ao ROOT com forward slashes (Windows compat)
    include: [
      ROOT + '/.claude/tests/unit/**/*.test.mjs',
      ROOT + '/.claude/tests/integration/**/*.test.mjs',
    ],
    fileParallelism: false,
    testTimeout: 15000,
  },
  // Garantir que vitest pode resolver modulos ESM fora de workspace/src
  // (fs.allow e opcao do servidor Vite, nao de `test`).
  server: {
    fs: {
      allow: [ROOT, path.resolve(path.dirname(__filename))],
    },
  },
});
