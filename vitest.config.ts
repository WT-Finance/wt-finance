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
    // src/** (app) + scripts/** (tooling de infra — db-gate, v4.27.1).
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    setupFiles: ['./vitest.setup.ts'],
    // Testes de contrato (REST) batem na rede e são mais lentos → timeout maior.
    testTimeout: 15_000,
  },
})
