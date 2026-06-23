import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── Guarda da FONTE DA VERDADE do Design System (v4.26, ADR-0129) ──────────────
// O ADR-0103 diz "sempre token, nunca hex". O lint (wt/no-cor-hardcoded) impede
// reintroduzir cor crua/hex; este teste impede o outro lado da regressão: REMOVER
// (ou renomear) um token-âncora que o código consome — o que degradaria telas em
// silêncio (a cor não resolve, sem erro de build/tsc). Falha aqui = a base ruiu.

const tokensCss = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
const globalsCss = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

// Tokens que o app referencia via var()/utilitárias. Manter em sincronia com tokens.css.
const ANCORAS = [
  '--text-primary', '--text-secondary', '--text-muted', '--text-subtle',
  '--surface', '--surface-soft', '--surface-strong', '--border', '--border-strong',
  '--success', '--success-bg', '--warning', '--warning-bg', '--danger', '--danger-bg',
  '--action-primary', '--action-primary-fg', '--focus-ring',
  '--action-soft', '--action-soft-border', '--action-soft-fg',
  '--gestao', '--gestao-soft', '--gestao-fg',
  '--positive', '--positive-soft', '--positive-deep',
  '--negative', '--negative-soft', '--negative-deep', '--neutral', '--neutral-soft',
  '--brand', '--brand-soft', '--brand-deep',
  '--subsetor-comercial', '--subsetor-planejamento', '--subsetor-producao',
  '--subsetor-hospedagens', '--subsetor-extras',
  '--chart-axis-tick', '--chart-grid', '--chart-success', '--chart-warning',
  '--chart-danger', '--chart-neutral', '--chart-info',
  '--chart-fluxo-entrada', '--chart-fluxo-saida',
  '--setor-lazer', '--setor-weddings', '--setor-corporativo',
]

describe('tokens.css — fonte da verdade do Design System (ADR-0129)', () => {
  it('define TODOS os tokens-âncora consumidos pelo app', () => {
    const faltando = ANCORAS.filter(t => !new RegExp(`${t}\\s*:`).test(tokensCss))
    expect(faltando).toEqual([])
  })

  it('os 4 temas por aba redefinem --brand (weddings/trips/corporativo/group)', () => {
    for (const tema of ['weddings', 'trips', 'corporativo', 'group']) {
      expect(tokensCss).toMatch(new RegExp(`\\[data-theme="${tema}"\\]`))
    }
  })

  it('expõe os tokens-chave como utilitárias no @theme (globals.css)', () => {
    for (const u of [
      '--color-success', '--color-danger', '--color-warning',
      '--color-positive', '--color-negative', '--color-gestao',
      '--color-action-primary', '--color-setor-lazer', '--color-subsetor-comercial',
      '--color-chart-fluxo-entrada',
    ]) {
      expect(globalsCss).toContain(u)
    }
  })

  it('define os tokens de micro-texto (--text-2xs / --text-3xs)', () => {
    expect(globalsCss).toMatch(/--text-2xs:/)
    expect(globalsCss).toMatch(/--text-3xs:/)
  })

  it('--text-primary é #2D2A26 (não o #1A1814 dessincronizado pré-v4.26)', () => {
    expect(tokensCss).toMatch(/--text-primary:\s*#2D2A26/i)
  })

  it('não reintroduz o --primary azul legado removido na v4.26', () => {
    expect(globalsCss).not.toMatch(/--primary\s*:/)
    expect(globalsCss).not.toContain('#2563eb')
  })
})
