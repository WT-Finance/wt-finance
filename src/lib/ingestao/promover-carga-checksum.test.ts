import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'

// ── v6.0.0/M5 (0278) — checksum conferido CONTRA O GRAVADO, em transação revertida ────────────
// Torna PERMANENTE o ensaio que, até 22/09/2026, só existia como execução avulsa contra
// produção (à mão, pelo Yan): duas linhas sintéticas somando −3.234,56 — checksum errado
// (−3.234,00) faz `promover_carga_demonstrativo` recusar com `CHECKSUM_FALHOU` e a base fica
// intacta; checksum certo aplica. Este arquivo prova o MESMO caso, mas a cada `npm test`, e
// acrescenta o que a execução avulsa não podia provar sozinha: que a base fica com a MESMA
// contagem de antes MEDIDA FORA da transação — não só "por dentro", onde o SAVEPOINT já
// desfaz o efeito de qualquer jeito.
//
// Por que Demonstrativo, entre as quatro bases que a 0278 tornou atômicas: é a MENOR —
// `raw.demonstrativo_competencia` tem 3.334 linhas contra 94.667 (Movimentação), 41.745
// (Operação) e 36.176 (Aberto) — docs/briefings/briefing-v6-0-0-fundacao-ingestao.md §2.1. A
// promoção faz TRUNCATE + INSERT da base inteira dentro da transação do teste: quanto menor a
// base, mais barato o ensaio, sem abrir mão de exercitar o mesmo caminho de código (o contrato
// do checksum — campos `escopo`/`chave`/`campo`/`linhas`/`centavos`, cabeçalho da migration 0278
// — é idêntico nas quatro).
//
// Contrato desta classe de teste (skill `banco-e-rpc` §6, "Provar comportamento de RPC que
// ESCREVE"): uma transação por `it`, `describe.skipIf` sem `SUPABASE_DB_URL`, linha/carga_id
// sintéticos e identificáveis (`ZZ_TESTE_0278_...`), `SET LOCAL lock_timeout`, `SAVEPOINT` em
// volta da chamada que pode falhar, nenhum `COMMIT`. Molde: `src/lib/dre/reverter-diario.test.ts`.
// Enforcement: `src/lib/sonda-teste-escreve-banco.test.ts` — este arquivo entra em
// `ESCREVEM_E_REVERTEM_HOJE` (a sonda reprova se não entrar).
//
// O que este teste NÃO assume: a migration 0279 (escrita em paralelo a este arquivo, na mesma
// worktree) troca o QUE `promover_carga_demonstrativo` faz depois da conferência de checksum
// fechar (deixa de blindar `provisionar_dre_comp_par()` com `EXCEPTION WHEN insufficient_privilege`
// e passa a chamar `provisionar_dre_comp_par__nucleo()` direto) — mas não toca a conferência de
// checksum em si, que é o objeto desta prova. Por isso os casos abaixo não afirmam nada sobre
// `pares_novos`/`avisos` (só que `avisos` é array) — o que é estável entre 0278 e 0279, e o que
// muda entre as duas fica fora do que este arquivo garante.
//
// Sentido operacional do que se prova aqui (skill `ingestao-planilhas` §5): "CHECKSUM_FALHOU"
// é a mesma classe de recusa que a validação de Vendas já dá — a base anterior fica de pé, o
// reflexo certo é corrigir e re-subir, nunca "limpar na mão".

const DB_URL = process.env.SUPABASE_DB_URL

type Linha = Record<string, unknown>
type Cliente = { query: (q: string, p?: unknown[]) => Promise<{ rows: Linha[] }> }

/** Chave sintética identificável (padrão `ZZ_TESTE_<migration>`) e o mesmo total do ensaio
 *  manual que este teste substitui: duas linhas somando exatamente −3.234,56. */
const ARQUIVO_TESTE = 'ZZ_TESTE_0278_promover_carga_demonstrativo'
const LINHAS_SINTETICAS = [
  { descricao: 'ZZ_TESTE_0278_A', valor: -1000.0 },
  { descricao: 'ZZ_TESTE_0278_B', valor: -2234.56 },
] as const
const CENTAVOS_CERTOS = -323456 // −3.234,56 — soma exata das duas linhas acima
const CENTAVOS_ERRADOS = -323400 // −3.234,00 — falta 56 centavos, mesmo delta do ensaio manual

/** Abre `pg`, roda `f` dentro de `BEGIN … ROLLBACK` e nunca faz `COMMIT`. `depois`, se dado,
 *  roda na MESMA conexão logo APÓS o `ROLLBACK` — é a medição "fora da transação" que faz o
 *  invariante (c) do contrato valer: a base de produção não move nem por dentro nem por fora. */
async function emTransacaoRevertida<T>(
  f: (c: Cliente) => Promise<T>,
  depois?: (c: Cliente) => Promise<void>,
): Promise<T> {
  const { createRequire } = await import('node:module')
  const pg = createRequire(process.cwd() + '/')('pg')
  const c: Cliente & { connect: () => Promise<void>; end: () => Promise<void> } =
    new pg.Client({ connectionString: DB_URL })
  await c.connect()
  await c.query('BEGIN')
  // `promover_carga_demonstrativo` toma pg_advisory_xact_lock(4017010) e um TRUNCATE da tabela
  // viva — duas suítes concorrentes (duas worktrees, mesmo banco) disputariam o mesmo lock e
  // TRAVARIAM até o timeout do runner sem isto; falhar rápido é o certo (mesmo raciocínio de
  // reverter-diario.test.ts).
  await c.query(`SET LOCAL lock_timeout = '5s'`)
  try {
    return await f(c)
  } finally {
    await c.query('ROLLBACK')
    if (depois) await depois(c)
    await c.end()
  }
}

/** Limpa a staging (via a própria RPC de carga — reversível, estamos dentro da transação) e
 *  grava as duas linhas sintéticas que a promoção vai truncar+inserir na base viva. */
async function prepararStagingSintetica(c: Cliente): Promise<void> {
  await c.query('SELECT public.limpar_staging_demonstrativo()')
  for (const l of LINHAS_SINTETICAS) {
    await c.query(
      `INSERT INTO raw.demonstrativo_competencia_staging
         (arquivo_origem, tipo, grupo, descricao, ano, mes, mes_num, competencia, valor)
       VALUES ($1, 'ZZ_TESTE', 'ZZ_TESTE_0278', $2, 1900, 'Teste', 1, '1900-01-01', $3)`,
      [ARQUIVO_TESTE, l.descricao, l.valor],
    )
  }
}

/** O checksum de "total do arquivo": `chave = {}` não filtra nenhuma coluna, então soma a
 *  tabela inteira — que depois do TRUNCATE+INSERT contém só as duas linhas sintéticas (mesmo
 *  desenho do checksum `total-arquivo`/`total-geral` real, contrato no cabeçalho da 0278). */
function checksumTotalArquivo(centavos: number): string {
  return JSON.stringify([{ escopo: 'total-arquivo', chave: {}, campo: 'valor', linhas: null, centavos }])
}

/** Chama a RPC sob SAVEPOINT: erro não derruba a transação do teste (molde de reverter-diario.test.ts). */
async function chamar(
  c: Cliente,
  sql: string,
  p: unknown[],
): Promise<{ ok: true; v: Linha } | { ok: false; msg: string }> {
  await c.query('SAVEPOINT chamada')
  try {
    const r = await c.query(sql, p)
    return { ok: true, v: r.rows[0] }
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT chamada')
    return { ok: false, msg: (e as Error).message }
  }
}

async function contarDemonstrativo(c: Cliente): Promise<number> {
  const r = await c.query('SELECT count(*)::int AS n FROM raw.demonstrativo_competencia')
  return Number(r.rows[0].n)
}

describe.skipIf(!DB_URL)(
  'promover_carga_demonstrativo (0278) — checksum contra o GRAVADO, em transação revertida',
  () => {
    it('checksum falso ⇒ RAISE nomeado (CHECKSUM_FALHOU) e a base fica intacta — medido FORA da transação', async () => {
      let antes = -1
      let depois = -1
      await emTransacaoRevertida(
        async c => {
          antes = await contarDemonstrativo(c)
          await prepararStagingSintetica(c)

          const r = await chamar(
            c,
            'SELECT public.promover_carga_demonstrativo($1::jsonb, $2::uuid) AS r',
            [checksumTotalArquivo(CENTAVOS_ERRADOS), randomUUID()],
          )
          expect(r.ok).toBe(false)
          const msg = (r as { msg: string }).msg
          expect(msg).toMatch(/CHECKSUM_FALHOU: 1 de 1 conferência/)
          expect(msg).toMatch(/"centavos_esperado":\s*-323400/)
          expect(msg).toMatch(/"centavos_gravado":\s*-323456/)

          // Dentro da MESMA transação: o SAVEPOINT já desfez o TRUNCATE+INSERT que a função fez
          // antes de conferir — a tabela viva nunca chegou a virar as 2 linhas sintéticas.
          expect(await contarDemonstrativo(c)).toBe(antes)
        },
        async c => {
          depois = await contarDemonstrativo(c)
        },
      )
      // Fora da transação (depois do ROLLBACK completo, mesma conexão): a base de produção não
      // perdeu nem ganhou uma linha. É este ponto — não a mensagem de erro — que faz o teste
      // valer: prova que "recusar" deixa a base como estava, não só que a função sabe reclamar.
      expect(depois).toBe(antes)
    })

    it('checksum certo ⇒ aplica (a base passa a ter só as 2 linhas do arquivo) — e nada disso sobrevive fora da transação', async () => {
      let antes = -1
      let depois = -1
      await emTransacaoRevertida(
        async c => {
          antes = await contarDemonstrativo(c)
          await prepararStagingSintetica(c)

          const r = await chamar(
            c,
            'SELECT public.promover_carga_demonstrativo($1::jsonb, $2::uuid) AS r',
            [checksumTotalArquivo(CENTAVOS_CERTOS), randomUUID()],
          )
          expect(r.ok, (r as { msg?: string }).msg).toBe(true)
          const resultado = (r as { v: Linha }).v.r as Record<string, unknown>
          expect(resultado.linhas).toBe(2)
          expect(resultado.checksums_conferidos).toBe(1)
          expect(resultado.checksums_nao_conferiveis).toBe(0)
          expect(Array.isArray(resultado.avisos)).toBe(true)

          // Dentro da transação: a promoção realmente trocou a base — só as 2 sintéticas restam.
          const total = await c.query(
            `SELECT count(*)::int AS n, coalesce(round(sum(valor) * 100), 0)::bigint AS centavos
               FROM raw.demonstrativo_competencia`,
          )
          expect(Number(total.rows[0].n)).toBe(2)
          expect(Number(total.rows[0].centavos)).toBe(CENTAVOS_CERTOS)
        },
        async c => {
          depois = await contarDemonstrativo(c)
        },
      )
      // Fora da transação: mesmo tendo REALMENTE trocado a base por dentro (TRUNCATE+INSERT
      // aplicados, não só tentados), o ROLLBACK devolve a produção à contagem de antes — é isto
      // que separa "aplicar dentro de um ensaio revertido" de "aplicar de verdade".
      expect(depois).toBe(antes)
    })
  },
)
