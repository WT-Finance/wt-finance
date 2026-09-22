// Carregador das fixtures dos oráculos de ingestão (GATE 1 da v6.0.0). Usado SÓ pelos testes
// `oraculo-*.test.ts` — importa `node:fs`, então nunca entre no caminho da aplicação.
//
// As fixtures são os anexos §9 do briefing: os cinco pares cru↔tratado reais. Elas NÃO entram no
// git (dado interno; o cru de Vendas traz CPF/CNPJ/e-mail — decisão 3 da versão) e vivem em
// `tests/fixtures/ingestao/`, populadas por `node scripts/ingestao/fixtures.mjs` a partir de
// `JANUS_ANEXOS_DIRS`. O que é versionado é o manifest com os sha256.
//
// ── Ausência de fixture nunca passa calada ──────────────────────────────────────────────────
// O oráculo se auto-pula NOMEANDO a fixture que falta, e `REQUIRE_FIXTURES=1` transforma a
// ausência em falha alta. É a mesma disciplina do `REQUIRE_CONTRACT=1`: "zero skip" no relatório
// do runner só prova que o ambiente TINHA os arquivos naquela rodada. Na v5.4.3 o `.env.local`
// não veio na worktree nova, 112 casos de contrato se auto-pularam e a suíte ficou VERDE
// anunciando 112 testes a menos — ninguém viu.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { lerMatriz } from './matriz'
import type { Matriz } from './parsers/comum'

/** Raiz do repo a partir DESTE arquivo (não do cwd do runner) — mesma cautela das sondas. */
const RAIZ_REPO = fileURLToPath(new URL('../../../', import.meta.url))
const DIR = 'tests/fixtures/ingestao'

/** `REQUIRE_FIXTURES=1` ⇒ fixture ausente REPROVA em vez de pular. */
export const EXIGIR_FIXTURES = process.env.REQUIRE_FIXTURES === '1'

export function caminhoFixture(nome: string): string {
  return `${RAIZ_REPO}${DIR}/${nome}`
}

export function fixturePresente(nome: string): boolean {
  return existsSync(caminhoFixture(nome))
}

/** Quais das fixtures pedidas não estão em disco. */
export function fixturesAusentes(nomes: readonly string[]): string[] {
  return nomes.filter((n) => !fixturePresente(n))
}

/** A frase que o oráculo mostra ao pular — nomeia o arquivo e o comando que o traz. */
export function motivoDoPulo(ausentes: readonly string[]): string {
  return (
    `fixture(s) ausente(s) em ${DIR}/: ${ausentes.join(', ')}. ` +
    'Popule com `JANUS_ANEXOS_DIRS="<pasta>" node scripts/ingestao/fixtures.mjs` ' +
    '(o manifest versionado confere o sha256 de cada uma).'
  )
}

/**
 * Lê uma planilha da pasta de fixtures como matriz de células — a leitura em si é
 * `lerMatriz` (`./matriz.ts`), o único lugar do caminho de ingestão que chama `XLSX.read`/
 * `sheet_to_json`. Este arquivo só soma o `readFileSync`: o oráculo prova exatamente a
 * leitura que a rota (M4) executa, com bytes vindos do disco em vez do bucket.
 */
export function lerMatrizXlsx(nome: string, aba?: string): Matriz {
  return lerMatriz(readFileSync(caminhoFixture(nome)), 'xlsx', aba)
}

/** Lê um CSV da pasta de fixtures como matriz — idem, via `lerMatriz`. */
export function lerMatrizCsv(nome: string): Matriz {
  return lerMatriz(readFileSync(caminhoFixture(nome)), 'csv')
}

/** Matriz → lista de objetos por cabeçalho da linha 0. Para ler o TRATADO (o oráculo). */
export function porCabecalho(rows: Matriz): Record<string, unknown>[] {
  const cab = (rows[0] ?? []).map((h) => String(h ?? '').trim())
  const saida: Record<string, unknown>[] = []
  for (let i = 1; i < rows.length; i++) {
    const linha = rows[i] ?? []
    const obj: Record<string, unknown> = {}
    cab.forEach((nome, j) => { if (nome !== '') obj[nome] = linha[j] ?? null })
    saida.push(obj)
  }
  return saida
}
