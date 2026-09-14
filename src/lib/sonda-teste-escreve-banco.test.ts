import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Raiz do repo calculada a partir DESTE arquivo (não do cwd do runner) — mesma cautela de
// `gatilho-ajuda.test.ts` / `cabecalho-pagina.test.ts`. Este arquivo mora em `src/lib/`.
const RAIZ_REPO = fileURLToPath(new URL('../../', import.meta.url))

// ── Sonda: teste que abre `pg` só escreve dentro de transação revertida (v5.9.6) ─────────
// Decisão de método (10/09/2026): provar comportamento de RPC que escreve pode rodar contra
// PRODUÇÃO dentro de `BEGIN … ROLLBACK` — padrão aceito, não exceção, mas com CONTRATO
// obrigatório (skill `banco-e-rpc` §6, "Provar comportamento de RPC que ESCREVE"). Esta sonda
// é o enforcement mecânico (régua de 5 destinos, destino 1): varre o código-fonte dos testes
// (sem executar nada — molde de `gatilho-ajuda.test.ts`).
//
// DESENHO: ALLOWLIST, não blacklist. Todo `src/**/*.test.ts` que obtém o driver `pg` (conexão
// direta, fora do PostgREST) é ALVO e deve cumprir o contrato — a menos que esteja declarado
// SOMENTE-LEITURA abaixo, com justificativa. Motivo (achado CRÍTICO do `revisor` na 1ª rodada):
// procurar INSERT/UPDATE/DELETE no texto do teste não vê o que uma FUNÇÃO escreve por dentro —
// `c.query('SELECT financeiro.fn_que_grava($1)')` sem BEGIN passaria verde com escrita real e
// permanente. Quem abre `pg` prova que só lê, ou abre transação e reverte.
//
// Contrato verificado (a FORMA): `BEGIN` e `ROLLBACK` como COMANDO passado ao driver;
// `lock_timeout` (sem isso, duas suítes concorrentes em worktrees diferentes travam disputando
// lock de linha até o timeout do runner, em vez de falhar rápido); `describe.skipIf` (offline,
// o gate pula em vez de quebrar); e NENHUM `COMMIT`. O que a sonda NÃO verifica (fica para o
// `revisor-db` e o olho humano): chave sintética `ZZ_TESTE_<migration>`, `SAVEPOINT`, e que
// cada escrita está DENTRO do BEGIN (análise de fluxo) — ela prova presença do contrato no
// arquivo, não o fluxo. Comparações case-insensitive: SQL em minúsculas compila igual.
//
// Não é alvo: teste que fala com o banco só via REST (`fetch` para `/rest/v1/rpc`) — o
// PostgREST não abre transação do lado do cliente; a regra dele é outra (só leitura ou no-op).
// E este próprio arquivo, que cita os tokens como TEXTO (excluído por caminho, como a v5.9.4
// aprendeu com o primitivo).
//
// SEGUNDA PARTE (v5.10.3) — INVENTÁRIO FECHADO dos consumidores de `SUPABASE_DB_URL`. A skill
// `banco-e-rpc` §6 dizia "três arquivos" e a realidade eram CINCO: a contagem era prosa, e prosa
// deriva. Agora é mecânica — todo arquivo de `src/`, `scripts/` e `supabase/` que lê
// `process.env.SUPABASE_DB_URL` tem de estar classificado numa das quatro listas abaixo, e quem
// não escreve-e-reverte precisa da TRAVA `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`.
// A trava é o Postgres recusando a escrita na conexão — inclusive a que uma FUNÇÃO faria por
// dentro, que é exatamente o que a análise do texto do teste não enxerga (o mesmo argumento que
// fez a primeira parte ser allowlist). Precedente da trava: a medição do baseline da v5.4.5.
//
// EXCEÇÃO CONHECIDA (registrada, não escondida): `contrato-api-externa.test.ts` (v5.4.0) testa
// a API externa PONTA A PONTA — as RPCs são chamadas por HTTP e leem numa conexão do PostgREST,
// então a fixture (role/tipo/chave `ZZ_TESTE_API_V540`) precisa estar COMMITADA para ser vista;
// é criada em `beforeAll` e apagada em `afterAll`. Não cabe em transação revertida por desenho.

const RAIZ_TESTES = 'src'
const ESTE_ARQUIVO = 'src/lib/sonda-teste-escreve-banco.test.ts'

/** Abre `pg` mas só LÊ (catálogo, agregados). Precisa provar: sem SQL de escrita, sem BEGIN. */
const SOMENTE_LEITURA: Record<string, string> = {
  'src/lib/rpc-contrato.test.ts': 'lê pg_get_functiondef e app.areas_do_setor (v5.9.4); tudo o mais é REST',
}

/** Escreve fora do contrato por DESENHO. Cada entrada precisa continuar existindo E violando. */
const EXCECOES_CONHECIDAS: Record<string, string> = {
  'src/lib/api-externa/contrato-api-externa.test.ts':
    'ponta a ponta por HTTP: fixture precisa estar COMMITADA para o PostgREST ver; limpa em afterAll',
}

/**
 * Quem escreve-e-reverte em produção HOJE (alvos fora da allowlist e fora das exceções).
 * Lista FECHADA de propósito: é a contagem do gatilho de reavaliação da skill `banco-e-rpc` §6
 * ("à 3ª ou 4ª RPC testada assim, reabrir a decisão de ambiente de teste próprio"). Arquivo novo
 * aqui = atualizar a contagem na skill e avaliar o gatilho — a sonda não deixa passar calado.
 */
const ESCREVEM_E_REVERTEM_HOJE = [
  'src/lib/dre/reverter-diario.test.ts',   // v5.9.5 (0268) — a referência do contrato
  'src/lib/monde/virada-paridade.test.ts', // v5.1.4 — aplica o UP da 0181 em tx e compara
]

/**
 * Consumidores de `SUPABASE_DB_URL` que NÃO são teste: infra que fala com produção por `pg`.
 * Escrever é a função deles, então não cabe trava read-only — mas cabe estarem declarados, para
 * que o inventário seja fechado e ninguém acrescente um sexto sem passar por aqui.
 */
const INFRA_DECLARADA: Record<string, string> = {
  'scripts/db-gate/lib.mjs':
    'o backup-gate (ADR-0119): COPY OUT do backup e COPY IN da recuperação — escrever é o que ele faz',
}

/** Raízes varridas em busca de quem lê `SUPABASE_DB_URL` (não só teste: infra também). */
const RAIZES_DB_URL = ['src', 'scripts', 'supabase']
const EXTENSOES_CODIGO = /\.(ts|tsx|mjs|cjs|js)$/

function arquivosDeCodigo(dir: string): string[] {
  const resultado: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) {
      if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue
      resultado.push(...arquivosDeCodigo(caminho))
    } else if (entrada.isFile() && EXTENSOES_CODIGO.test(caminho)) resultado.push(caminho)
  }
  return resultado
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
// escapar e o caso "enxerga a referência" pegou) — ou `import … from 'pg'`.
const ABRE_PG = /\(\s*['"]pg['"]\s*\)|from\s+['"]pg['"]/i
// SQL de escrita DENTRO de um argumento de `query(` — menção em comentário/prosa não conta.
const ESCRITA_SQL = /query\(\s*(\{\s*text:\s*)?[`'"][^`'"]*\b(INSERT\s+INTO|UPDATE\s+[\w."$]|DELETE\s+FROM|TRUNCATE\s|CREATE\s|ALTER\s|DROP\s)/i
// Só o COMANDO passado ao driver conta — `query('BEGIN')`, `query(\`ROLLBACK\`)`,
// `query({ text: 'COMMIT' })`; menção em comentário ou prosa não é transação.
const CMD = (palavra: string) => new RegExp(`query\\(\\s*(\\{\\s*text:\\s*)?[\`'"]\\s*${palavra}\\b`, 'i')
// Lê a credencial de conexão DIRETA. `process.env.` literal de propósito: `sonda-skipif-silencioso`
// cita 'SUPABASE_DB_URL' como STRING numa lista declarativa e não abre conexão nenhuma — citar não
// é consumir.
const LE_DB_URL = /process\.env\.SUPABASE_DB_URL/
// A trava como COMANDO passado ao driver (mesmo critério do `CMD`: menção em prosa não trava nada).
const TRAVA_RO = /query\(\s*(\{\s*text:\s*)?[`'"][^`'"]*SET\s+SESSION\s+CHARACTERISTICS\s+AS\s+TRANSACTION\s+READ\s+ONLY/i
// Abertura de conexão direta. A trava é de SESSÃO: vale para a conexão em que foi emitida, e só.
const ABRE_CONEXAO = /new\s+pg\.(?:Client|Pool)\s*\(/

/**
 * Aberturas de conexão que NÃO travam (achado MÉDIO do `revisor` na v5.10.3). Conferir a trava
 * contra o texto do arquivo INTEIRO é frouxo justamente onde o arquivo tem mais de uma conexão:
 * `rpc-contrato.test.ts` já tem duas (o bloco da 0267 e o da 0269), e uma terceira acrescentada
 * sem a trava passaria verde **de carona** na trava das outras. Fatiar o texto em cada abertura e
 * exigir a trava DENTRO da fatia é o que torna a checagem por CONEXÃO, que é a unidade real.
 */
function aberturasSemTrava(texto: string): number {
  return texto.split(ABRE_CONEXAO).slice(1).filter(fatia => !TRAVA_RO.test(fatia)).length
}

type Alvo = { arquivo: string; texto: string }

const ALVOS: Alvo[] = arquivosDeTeste(join(RAIZ_REPO, RAIZ_TESTES))
  .map(abs => ({ arquivo: relative(RAIZ_REPO, abs).replace(/\\/g, '/'), texto: readFileSync(abs, 'utf8') }))
  .filter(a => a.arquivo !== ESTE_ARQUIVO)
  .filter(a => ABRE_PG.test(a.texto))

const QUE_ESCREVEM = ALVOS.filter(a => !(a.arquivo in SOMENTE_LEITURA))

/** Todo arquivo de código (teste ou não) que lê `process.env.SUPABASE_DB_URL`. */
const CONSUMIDORES_DB_URL: Alvo[] = RAIZES_DB_URL
  .flatMap(raiz => arquivosDeCodigo(join(RAIZ_REPO, raiz)))
  .map(abs => ({ arquivo: relative(RAIZ_REPO, abs).replace(/\\/g, '/'), texto: readFileSync(abs, 'utf8') }))
  .filter(a => a.arquivo !== ESTE_ARQUIVO)
  .filter(a => LE_DB_URL.test(a.texto))

/** A classificação exigida: cada consumidor cai em exatamente uma destas quatro listas. */
const DECLARADOS_DB_URL = [
  ...ESCREVEM_E_REVERTEM_HOJE,
  ...Object.keys(EXCECOES_CONHECIDAS),
  ...Object.keys(INFRA_DECLARADA),
  ...Object.keys(SOMENTE_LEITURA),
]

/** Quem precisa da trava: não escreve-e-reverte e não é infra que escreve por desenho. */
const PRECISAM_DE_TRAVA = CONSUMIDORES_DB_URL.filter(
  a => !ESCREVEM_E_REVERTEM_HOJE.includes(a.arquivo)
    && !(a.arquivo in EXCECOES_CONHECIDAS)
    && !(a.arquivo in INFRA_DECLARADA),
)

function faltas(a: Alvo): string[] {
  const f: string[] = []
  if (!CMD('BEGIN').test(a.texto)) f.push("sem `query('BEGIN')` — abre pg e não abre transação (escreve fora dela, ou não declarou SOMENTE_LEITURA)")
  if (!CMD('ROLLBACK').test(a.texto)) f.push("sem `query('ROLLBACK')` — a transação não é revertida")
  if (CMD('COMMIT').test(a.texto)) f.push("tem `query('COMMIT')` — o que o teste escreve PERSISTE")
  if (!/lock_timeout/i.test(a.texto)) f.push('sem `SET LOCAL lock_timeout` — suítes concorrentes travam em vez de falhar')
  if (!/describe\.skipIf\(/.test(a.texto)) f.push('sem `describe.skipIf` — offline, o gate quebraria em vez de pular')
  return f
}

describe('teste que abre pg — só escreve em transação revertida, com contrato (v5.9.6)', () => {
  it('a sonda enxerga o arquivo de referência (reverter-diario) como alvo — senão não vale nada', () => {
    expect(ALVOS.map(a => a.arquivo)).toContain('src/lib/dre/reverter-diario.test.ts')
  })

  it('quem se declara SOMENTE_LEITURA existe, não escreve e não abre transação', () => {
    for (const [arquivo, justificativa] of Object.entries(SOMENTE_LEITURA)) {
      const alvo = ALVOS.find(a => a.arquivo === arquivo)
      expect(alvo, `${arquivo} não abre pg mais — remover de SOMENTE_LEITURA (${justificativa})`).toBeDefined()
      const t = (alvo as Alvo).texto
      expect(ESCRITA_SQL.test(t), `${arquivo} declara só leitura mas tem SQL de escrita em query()`).toBe(false)
      expect(CMD('BEGIN').test(t), `${arquivo} declara só leitura mas abre transação — então escreve; sair da allowlist`).toBe(false)
    }
  })

  it('todo teste pg fora da allowlist tem BEGIN + ROLLBACK + lock_timeout + skipIf e nenhum COMMIT', () => {
    const violacoes = QUE_ESCREVEM
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

  it('a contagem do gatilho de reavaliação é a lista fechada — arquivo novo aqui atualiza a skill §6', () => {
    const hoje = QUE_ESCREVEM.map(a => a.arquivo).filter(a => !(a in EXCECOES_CONHECIDAS)).sort()
    expect(hoje, 'a lista de quem escreve-e-reverte mudou: atualizar ESCREVEM_E_REVERTEM_HOJE, a contagem na skill banco-e-rpc §6 e avaliar o gatilho (3ª/4ª RPC → ambiente de teste próprio)')
      .toEqual([...ESCREVEM_E_REVERTEM_HOJE].sort())
  })

  // ── v5.10.3 — o INVENTÁRIO de SUPABASE_DB_URL é fechado, e quem só lê tem de travar ────

  it('a sonda enxerga os consumidores de SUPABASE_DB_URL fora de src/ (o gate) — senão não vale nada', () => {
    expect(CONSUMIDORES_DB_URL.map(a => a.arquivo)).toContain('scripts/db-gate/lib.mjs')
  })

  it('o inventário de consumidores de SUPABASE_DB_URL é a lista fechada declarada', () => {
    expect(
      CONSUMIDORES_DB_URL.map(a => a.arquivo).sort(),
      'entrou (ou saiu) um consumidor de SUPABASE_DB_URL: classificá-lo em ESCREVEM_E_REVERTEM_HOJE, EXCECOES_CONHECIDAS, INFRA_DECLARADA ou SOMENTE_LEITURA — e atualizar a contagem na skill banco-e-rpc §6, que já errou uma vez por ser prosa',
    ).toEqual([...DECLARADOS_DB_URL].sort())
  })

  it('quem lê SUPABASE_DB_URL sem escrever-e-reverter abre com SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY', () => {
    const violacoes = PRECISAM_DE_TRAVA
      .filter(a => !TRAVA_RO.test(a.texto))
      .map(a => `${a.arquivo} — abre pg por SUPABASE_DB_URL, não está declarado como escreve-e-reverte e não trava a sessão em READ ONLY`)
    expect(violacoes, violacoes.join('\n')).toEqual([])
  })

  it('a trava vale por CONEXÃO: toda abertura de pg.Client/pg.Pool nesses arquivos trava a própria sessão', () => {
    const violacoes = PRECISAM_DE_TRAVA
      .map(a => ({ arquivo: a.arquivo, n: aberturasSemTrava(a.texto) }))
      .filter(x => x.n > 0)
      .map(x => `${x.arquivo} — ${x.n} abertura(s) de conexão sem a trava READ ONLY na própria sessão; a trava de outro bloco do mesmo arquivo não alcança esta`)
    expect(violacoes, violacoes.join('\n')).toEqual([])
  })

  it('cada entrada de INFRA_DECLARADA ainda existe e ainda consome SUPABASE_DB_URL', () => {
    for (const [arquivo, justificativa] of Object.entries(INFRA_DECLARADA)) {
      const alvo = CONSUMIDORES_DB_URL.find(a => a.arquivo === arquivo)
      expect(alvo, `${arquivo} não lê mais SUPABASE_DB_URL — remover de INFRA_DECLARADA (${justificativa})`).toBeDefined()
    }
  })
})
