import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// Vitest — rede de testes da plataforma (v4.12). Fase 1: unit dos helpers puros
// (src/lib/**). Alias '@' espelha o tsconfig. Ambiente 'node' (helpers não usam DOM).
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // Testes de contrato (REST) batem na rede e são mais lentos → timeout maior.
    testTimeout: 15_000,
  },
})
