import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Raiz do repo calculada a partir DESTE arquivo (não do cwd do runner) — mesma cautela de
// `gatilho-ajuda.test.ts` / `cabecalho-pagina.test.ts`. Este arquivo mora em `src/lib/`.
const RAIZ_REPO = fileURLToPath(new URL('../../', import.meta.url))

// ── Sonda: teste que ESCREVE no banco só dentro de transação revertida (v5.9.6) ──────────
// Decisão de método (10/09/2026): provar comportamento de RPC que escreve pode rodar contra
// PRODUÇÃO dentro de `BEGIN … ROLLBACK` — padrão aceito, não exceção, mas com CONTRATO
// obrigatório (skill `banco-e-rpc` §6, "Provar comportamento de RPC que escreve"). Esta sonda
// é o enforcement mecânico (régua de 5 destinos, destino 1): varre o código-fonte dos testes
// (sem executar nada — molde de `gatilho-ajuda.test.ts`) e reprova o arquivo que abre conexão
// `pg` direta e escreve (ou abre transação) sem:
//   • `BEGIN` e `ROLLBACK` — a transação existe e é revertida;
//   • `lock_timeout` — sem isso, duas suítes concorrentes em worktrees diferentes travam
//     disputando lock de linha até o timeout do runner, em vez de falhar rápido;
//   • `describe.skipIf` — sem `SUPABASE_DB_URL` (offline) o gate segue verde;
//   • e SEM `COMMIT` — nada do que o teste escreve pode persistir.
// Referência viva: `src/lib/dre/reverter-diario.test.ts` (0268), que cumpre tudo isso.
//
// O que É alvo: `src/**/*.test.ts` que obtém o driver (`require('pg')` / `from 'pg'`) E tem
// no fonte uma escrita SQL literal (INSERT/UPDATE/DELETE/CREATE/ALTER/DROP/TRUNCATE) ou um
// `BEGIN` (transação aberta = pode escrever). Arquivo `pg` que só LÊ (catálogo, agregados)
// não é alvo — não há o que reverter.
//
// O que NÃO é alvo: teste que fala com o banco só via REST (`fetch` para `/rest/v1/rpc`) — o
// PostgREST não abre transação do lado do cliente; a regra dele é outra (só leitura ou
// no-op, `rpc-contrato.test.ts`). E este próprio arquivo, que cita os tokens como TEXTO
// (excluído por caminho, como a v5.9.4 aprendeu com o primitivo).
//
// EXCEÇÃO CONHECIDA (registrada, não escondida): `contrato-api-externa.test.ts` (v5.4.0) testa
// a API externa PONTA A PONTA — as RPCs são chamadas por HTTP e leem numa conexão do PostgREST,
// então a fixture (role/tipo/chave `ZZ_TESTE_API_V540`) precisa estar COMMITADA para ser vista;
// ela é criada em `beforeAll` e apagada em `afterAll`. Não cabe em transação revertida por
// desenho. Fica listada aqui para a decisão continuar visível: é o 2º arquivo da suíte que
// escreve em produção, e o gatilho de reavaliação da skill ("à 3ª ou 4ª RPC testada assim,
// reabrir a decisão de ambiente de teste próprio") conta a partir dele.

const RAIZ_TESTES = 'src'
const ESTE_ARQUIVO = 'src/lib/sonda-teste-escreve-banco.test.ts'
const EXCECOES_CONHECIDAS: Record<string, string> = {
  'src/lib/api-externa/contrato-api-externa.test.ts':
    'ponta a ponta por HTTP: fixture precisa estar COMMITADA para o PostgREST ver; limpa em afterAll',
}

function arquivosDeTeste(dir: string): string[] {
  const resultado: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) resultado.push(...arquivosDeTeste(caminho))
    else if (entrada.isFile() && caminho.endsWith('.test.ts')) resultado.push(caminho)
  }
  return resultado
}

// Qualquer chamada cujo único argumento é 'pg' — `require('pg')` E `createRequire(...)('pg')`
// (a forma de `reverter-diario`, sem `require(` literal; a 1ª rodada desta sonda a deixou
// escapar e o caso "enxerga o arquivo de referência" pegou) — ou `import … from 'pg'`.
const ABRE_PG = /\(\s*['"]pg['"]\s*\)|from\s+['"]pg['"]/
const ESCRITA_SQL = /\b(INSERT\s+INTO|UPDATE\s+[\w."$`{]|DELETE\s+FROM|TRUNCATE\s|CREATE\s+(OR\s+REPLACE\s+)?(TABLE|FUNCTION|INDEX)|ALTER\s+(TABLE|ROLE|FUNCTION)|DROP\s+(TABLE|FUNCTION))/
// Só o COMANDO passado ao driver conta — `query('BEGIN')`, `query(\`ROLLBACK\`)`; menção em
// comentário ou prosa não é transação.
const CMD = (palavra: string) => new RegExp(`query\\(\\s*[\`'"]\\s*${palavra}\\b`)

type Alvo = { arquivo: string; texto: string }

const ALVOS: Alvo[] = arquivosDeTeste(join(RAIZ_REPO, RAIZ_TESTES))
  .map(abs => ({ arquivo: relative(RAIZ_REPO, abs).replace(/\\/g, '/'), texto: readFileSync(abs, 'utf8') }))
  .filter(a => a.arquivo !== ESTE_ARQUIVO)
  .filter(a => ABRE_PG.test(a.texto))
  .filter(a => ESCRITA_SQL.test(a.texto) || CMD('BEGIN').test(a.texto))

function faltas(a: Alvo): string[] {
  const f: string[] = []
  if (!CMD('BEGIN').test(a.texto)) f.push("sem `query('BEGIN')` — escreve fora de transação")
  if (!CMD('ROLLBACK').test(a.texto)) f.push("sem `query('ROLLBACK')` — a transação não é revertida")
  if (CMD('COMMIT').test(a.texto)) f.push("tem `query('COMMIT')` — o que o teste escreve PERSISTE")
  if (!/lock_timeout/.test(a.texto)) f.push('sem `SET LOCAL lock_timeout` — suítes concorrentes travam em vez de falhar')
  if (!/describe\.skipIf\(/.test(a.texto)) f.push('sem `describe.skipIf` — offline, o gate quebraria em vez de pular')
  return f
}

describe('teste que escreve no banco — só em transação revertida, com contrato (v5.9.6)', () => {
  it('a sonda enxerga o arquivo de referência (reverter-diario) como alvo — senão não vale nada', () => {
    expect(ALVOS.map(a => a.arquivo)).toContain('src/lib/dre/reverter-diario.test.ts')
  })

  it('todo teste pg que escreve tem BEGIN + ROLLBACK + lock_timeout + skipIf e nenhum COMMIT', () => {
    const violacoes = ALVOS
      .filter(a => !(a.arquivo in EXCECOES_CONHECIDAS))
      .flatMap(a => faltas(a).map(motivo => `${a.arquivo} — ${motivo}`))
    expect(violacoes, violacoes.join('\n')).toEqual([])
  })

  it('cada exceção conhecida ainda existe E ainda viola (senão sai da lista)', () => {
    for (const [arquivo, justificativa] of Object.entries(EXCECOES_CONHECIDAS)) {
      const alvo = ALVOS.find(a => a.arquivo === arquivo)
      expect(alvo, `${arquivo} não é mais alvo da sonda — remover da lista de exceções (${justificativa})`).toBeDefined()
      expect(faltas(alvo as Alvo).length, `${arquivo} já cumpre o contrato — remover da lista de exceções`).toBeGreaterThan(0)
    }
  })
})
