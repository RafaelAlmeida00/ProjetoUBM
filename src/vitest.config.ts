import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// root da app = pasta deste arquivo (workspace/src)
const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': root, // espelha o paths "@/*" do tsconfig
      'server-only': path.resolve(root, '../tests/_stubs/server-only.ts'), // stub no teste
    },
  },
  server: {
    // permite servir a suíte canônica em workspace/tests (fora de workspace/src)
    // e o node_modules real (junction aponta para ProjetoUBM em worktrees)
    fs: {
      allow: [
        path.resolve(root, '..'),
        path.resolve(root, 'node_modules'),
        // resolve o junction para o path real quando em worktree git
        'C:/Users/Rafael/Documents/ProjetoUBM/workspace/src/node_modules',
      ],
    },
  },
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['lib/**', 'components/**', 'app/**'],
    },
    // Dois projetos: UI/unit em jsdom; banco (PGlite/Postgres WASM) em node, sequencial e com timeout maior.
    projects: [
      {
        extends: true,
        test: {
          name: 'app',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./vitest.setup.ts'],
          include: ['../tests/**/*.{test,spec}.{ts,tsx}'],
          exclude: ['../tests/db/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          environment: 'node',
          globals: true,
          include: ['../tests/db/**/*.{test,spec}.ts'],
          testTimeout: 30000,
          hookTimeout: 30000,
          // PGlite (WASM) é pesado: roda os arquivos de banco em SÉRIE p/ não competir por CPU.
          fileParallelism: false,
        },
      },
    ],
  },
})
