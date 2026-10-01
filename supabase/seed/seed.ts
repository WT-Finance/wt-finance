/**
 * seed.ts — v6.0.1: o seed é um CLIENTE do contrato de ingestão v1 (`docs/contratos/ingestao-v1.md`),
 * pelo MESMO caminho do card de upload (`src/app/admin/ingestao/upload/ingestao-cliente.ts`) e da futura
 * RPA. A diferença é só de TRANSPORTE: o card roda no navegador e bate em `/api/ingestao/{base}`
 * por HTTP; este script roda fora do Next (via `tsx`) e chama as MESMAS funções de servidor
 * diretamente — `caminhoCru`/`urlAssinadaDeUpload`/`sha256Hex`/`removerCru`
 * (`src/lib/ingestao/storage.ts`) e `processarCarga` (`src/lib/ingestao/carga.ts`), sem alterar
 * nenhuma delas (skill `ingestao-planilhas` §8). O seed NÃO abre conexão direta com o Postgres —
 * escreve pelo mesmo caminho de RPC que a rota usa (skill `banco-e-rpc`, §"Quem se conecta por
 * SUPABASE_DB_URL").
 *
 * ⚠️  NÃO HÁ STAGING. Este script aponta para PRODUÇÃO (mesmo Supabase que o app usa em produção).
 *   - Sem `--aplicar` (default): CONFERÊNCIA (`confirmar: false`) — sobe o cru, roda
 *     parse/checksums/diff e NADA é aplicado no banco (nenhuma linha em `ingestao.carga`, nenhuma
 *     base tocada). Ao final de cada base, os arquivos crus que subiu são removidos do bucket — a
 *     conferência não deixa lixo. IMPORTANTE: o grafo de dependência (`checarDependenciaDeCarga`,
 *     `carga.ts`) roda mesmo em conferência — "lancamentos-operacao" leva 409 DEPENDENCIA_AUSENTE
 *     se "lancamentos-aberto" não tiver uma carga APLICADA em PRODUÇÃO hoje (fuso SP), mesmo que
 *     o seed acabou de "conferir" o Aberto local (conferência nunca aplica). Isso é o contrato
 *     funcionando, não um defeito do seed.
 *   - Com `--aplicar`: aplica de verdade. CADA base presente no diretório SUBSTITUI A BASE INTEIRA
 *     em produção pelos arquivos do diretório — não é "append" (mesma semântica de sempre da
 *     promoção). Com fixtures antigas (ex. os anexos de 21/09), isso REGRIDE dados que hoje já
 *     estão mais recentes (produção é de 28/09) — confira o diretório antes de rodar. Uma carga
 *     aplicada dispara os MESMOS alarmes por e-mail que o card dispara (checksum falho, ano
 *     fechado alterado, par novo na bandeja) — não é um efeito novo desta missão, é o comportamento
 *     de sempre de `processarCarga` com `confirmar:true`, mas o operador precisa saber antes de
 *     rodar. O cru NÃO é removido do bucket neste modo — a carga aplicada cita o path no seu
 *     registro, e a retenção de 3 meses (contrato §7) cuida da limpeza.
 *
 * Uso:
 *   npm run seed                                    → conferência, supabase/seed/data/
 *   npm run seed -- --dir tests/fixtures/ingestao    → conferência, outro diretório
 *   npm run seed -- --aplicar                        → aplica de verdade (produção!)
 *   npm run seed -- --help
 *
 * Bases reconhecidas pelo NOME CANÔNICO do manifesto de fixtures
 * (`scripts/ingestao/fixtures-manifest.json`, papel "cru"):
 *   vendas-cru-*.xlsx (N arquivos → UMA carga de vendas-produto), movimentacao-cru.xlsx,
 *   aberto-cru.xlsx, operacao-cru.csv, demonstrativo-cru.xlsx.
 * Base sem arquivo correspondente no diretório é PULADA, com aviso — nunca adivinhada por outro
 * nome.
 *
 * Ordem de carga: a do grafo de dependência (`src/lib/ingestao/grafo.ts`, contrato §5) —
 * vendas-produto → lancamentos-movimentacao → lancamentos-aberto → lancamentos-operacao →
 * demonstrativo-competencia (independente, sem aresta nenhuma). `ORDEM_CARGA` abaixo é a lista
 * LITERAL (não um topo-sort automático: com `BASES_INGESTAO` — `src/lib/ingestao/bases.ts` — como
 * critério de desempate, `demonstrativo-competencia`, índice 0 desse array, iria para o INÍCIO,
 * que é a ordem errada). `assertirOrdemContraGrafo()` confere esta lista contra
 * `ARESTAS_GRAFO_INGESTAO` (todo `de` precede o `para`) e contra `BASES_INGESTAO` (mesmo conjunto,
 * mesmo tamanho) no arranque — para a lista não divergir do grafo em silêncio se uma aresta nova
 * entrar em `grafo.ts` no futuro.
 *
 * `server-only`: o seed roda fora do Next e vários módulos do núcleo importam esse pacote (que
 * lança de propósito fora de um Server Component). `npm run seed` carrega
 * `supabase/seed/sem-server-only.cjs` via `--require`, que neutraliza só esse pacote no
 * resolvedor do `require` do `tsx` — nenhum outro pacote é tocado.
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv() // fallback: carrega .env se existir

import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'node:crypto'
import { BASES_INGESTAO, ROTULO_BASE, type BaseIngestao } from '@/lib/ingestao/bases'
import { ARESTAS_GRAFO_INGESTAO } from '@/lib/ingestao/grafo'
import { caminhoCru, urlAssinadaDeUpload, sha256Hex, removerCru, ErroIngestaoStorage } from '@/lib/ingestao/storage'
import { processarCarga, ErroCarga, type EntradaCarga, type ResultadoCarga } from '@/lib/ingestao/carga'
import { loadMetas } from '@/lib/carga/metas'

// ── Identidade da carga (skill `banco-e-rpc` §4, "Duas credenciais de MÁQUINA") ────────────────
//
// A linha de `ingestao.carga` registra QUEM aplicou. O seed roda na máquina do Yan, mas com
// identidade PRÓPRIA — o usuário de máquina `ingestor@janus.interno` (uuid fixo, é o mesmo que a
// credencial `ingestor` usa) — nunca anônima, para a linha de carga ficar honesta sobre a
// origem, mesmo rodando fora da rota/RPA.
const USUARIO_INGESTOR_ID = '952c5e70-555e-410b-a67f-26ce6e1833ae'

// ── Ordem de carga — ver o comentário do header ────────────────────────────────────────────────

const ORDEM_CARGA: readonly BaseIngestao[] = [
  'vendas-produto',
  'lancamentos-movimentacao',
  'lancamentos-aberto',
  'lancamentos-operacao',
  'demonstrativo-competencia',
]

function assertirOrdemContraGrafo(): void {
  const indice = new Map<BaseIngestao, number>(ORDEM_CARGA.map((b, i) => [b, i] as const))
  if (indice.size !== BASES_INGESTAO.length) {
    throw new Error(
      `ORDEM_CARGA (${ORDEM_CARGA.length} bases) diverge de BASES_INGESTAO (${BASES_INGESTAO.length}) ` +
      '— alguma base foi adicionada/removida sem atualizar o seed.',
    )
  }
  for (const base of BASES_INGESTAO) {
    if (!indice.has(base)) {
      throw new Error(`ORDEM_CARGA não lista a base "${base}" (presente em BASES_INGESTAO).`)
    }
  }
  for (const aresta of ARESTAS_GRAFO_INGESTAO) {
    const posDe = indice.get(aresta.de)
    const posPara = indice.get(aresta.para)
    if (posDe === undefined || posPara === undefined || posDe >= posPara) {
      throw new Error(
        `ORDEM_CARGA não respeita a aresta do grafo "${aresta.de} → ${aresta.para}" ` +
        '(src/lib/ingestao/grafo.ts) — atualize a lista.',
      )
    }
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────

interface Args {
  readonly dir: string
  readonly aplicar: boolean
  readonly help: boolean
}

const AJUDA = `
Janus — seed (contrato de ingestão v1)

Carrega as cinco bases financeiras (Demonstrativo, Vendas, Movimentação, Aberto, Operação) pelo
MESMO caminho do card de upload e da futura RPA — não há um caminho "de seed" à parte.

⚠️  NÃO HÁ STAGING: este script aponta para PRODUÇÃO.

Uso:
  npm run seed                                    conferência (default), supabase/seed/data/
  npm run seed -- --dir <pasta>                   conferência, outro diretório
  npm run seed -- --aplicar                       aplica de verdade — SUBSTITUI cada base em
                                                   produção pelos arquivos do diretório
  npm run seed -- --help                          esta mensagem

Sem --aplicar (default): só confere (parse + checksums + diff) e NADA é escrito no banco; os
crus que subiu ao bucket são removidos ao final de cada base. Com --aplicar: aplica de verdade,
dispara os alarmes de carga normalmente (e-mail) e NÃO remove o cru do bucket.

Arquivos reconhecidos por NOME CANÔNICO (scripts/ingestao/fixtures-manifest.json, papel "cru"):
  vendas-cru-*.xlsx (um ou mais), movimentacao-cru.xlsx, aberto-cru.xlsx, operacao-cru.csv,
  demonstrativo-cru.xlsx. Base sem arquivo correspondente é pulada, com aviso.

Metas (app.meta_setor) só são recarregadas com --aplicar (ela escreve).
`.trim()

function parseArgs(argv: readonly string[]): Args {
  let dir = path.join(process.cwd(), 'supabase', 'seed', 'data')
  let aplicar = false
  let help = false
  for (let i = 0; i < argv.length; i++) {
    const atual = argv[i]
    if (atual === '--help' || atual === '-h') {
      help = true
    } else if (atual === '--aplicar') {
      aplicar = true
    } else if (atual === '--dir') {
      const valor = argv[i + 1]
      if (!valor || valor.startsWith('--')) {
        throw new Error('--dir exige um valor (o caminho da pasta).')
      }
      dir = path.resolve(valor)
      i++
    } else {
      throw new Error(`Argumento não reconhecido: "${atual}". Use --help para ver o uso.`)
    }
  }
  return { dir, aplicar, help }
}

// ── Descoberta de arquivo por nome canônico (contrato item 2 da delegação) ─────────────────────

interface ArquivoLocal {
  readonly nomeOriginal: string
  readonly caminhoAbsoluto: string
}

function arquivoUnico(dir: string, nomeCanonico: string): ArquivoLocal[] {
  const caminhoAbsoluto = path.join(dir, nomeCanonico)
  return fs.existsSync(caminhoAbsoluto) ? [{ nomeOriginal: nomeCanonico, caminhoAbsoluto }] : []
}

const REGEX_VENDAS_CRU = /^vendas-cru-.+\.xlsx$/i

/** Nome canônico esperado por base (para a mensagem de "pulada" ser acionável, não só "não achei
 *  nada" — item 2 da missão: "aviso claro"). */
const NOME_CANONICO_POR_BASE: Record<BaseIngestao, string> = {
  'vendas-produto': 'vendas-cru-*.xlsx',
  'lancamentos-movimentacao': 'movimentacao-cru.xlsx',
  'lancamentos-aberto': 'aberto-cru.xlsx',
  'lancamentos-operacao': 'operacao-cru.csv',
  'demonstrativo-competencia': 'demonstrativo-cru.xlsx',
}

function localizarArquivosLocais(base: BaseIngestao, dir: string): ArquivoLocal[] {
  switch (base) {
    case 'vendas-produto':
      return fs
        .readdirSync(dir)
        .filter((nome) => REGEX_VENDAS_CRU.test(nome))
        .sort()
        .map((nome) => ({ nomeOriginal: nome, caminhoAbsoluto: path.join(dir, nome) }))
    case 'lancamentos-movimentacao':
      return arquivoUnico(dir, 'movimentacao-cru.xlsx')
    case 'lancamentos-aberto':
      return arquivoUnico(dir, 'aberto-cru.xlsx')
    case 'lancamentos-operacao':
      return arquivoUnico(dir, 'operacao-cru.csv')
    case 'demonstrativo-competencia':
      return arquivoUnico(dir, 'demonstrativo-cru.xlsx')
    default: {
      const exaustivo: never = base
      throw new Error(`Base não reconhecida: ${String(exaustivo)}`)
    }
  }
}

/** Mesma escolha de MIME do card (`ingestao-cliente.ts#tipoMime`, não exportada de lá — o card é
 *  módulo de NAVEGADOR e este script roda em Node; duplicar 3 linhas é mais simples e mais seguro
 *  do que importar código de cliente para dentro de um script de servidor). O bucket só aceita
 *  estes dois tipos — qualquer outro (ex. `application/octet-stream`) faz o `PUT` voltar 400. */
function tipoMimePorNome(nome: string): string {
  return nome.toLowerCase().endsWith('.csv')
    ? 'text/csv'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

// ── Uma base: sobe os arquivos e processa a carga ───────────────────────────────────────────────

interface ErroRelato {
  readonly codigo: string
  readonly mensagem: string
  readonly detalhe?: unknown
}

interface RelatoBase {
  readonly base: BaseIngestao
  readonly pulada: boolean
  readonly ok: boolean
  readonly erro?: ErroRelato
  readonly resultado?: ResultadoCarga
}

async function subirArquivo(
  base: BaseIngestao,
  cargaId: string,
  indice: number,
  local: ArquivoLocal,
  agora: Date,
): Promise<{ path: string; nome: string; sha256: string }> {
  const bytes = fs.readFileSync(local.caminhoAbsoluto)
  const sha256 = sha256Hex(bytes)
  const objectPath = caminhoCru(base, cargaId, indice, local.nomeOriginal, agora)
  const assinado = await urlAssinadaDeUpload(objectPath)
  const resposta = await fetch(assinado.signedUrl, {
    method: 'PUT',
    body: bytes,
    headers: { 'content-type': tipoMimePorNome(local.nomeOriginal) },
  })
  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => '')
    throw new Error(
      `PUT falhou para "${local.nomeOriginal}" (HTTP ${resposta.status}): ${corpo || '(sem corpo)'}`,
    )
  }
  return { path: objectPath, nome: local.nomeOriginal, sha256 }
}

/** Sem `--aplicar`, o único resultado aceitável é `conferida`. Qualquer outro significa que a
 *  carga foi PROMOVIDA em produção sem o operador pedir — o pior modo de falha deste script.
 *  É FATAL: atravessa o `catch` de `processarBase` e interrompe o seed inteiro (nenhuma base
 *  seguinte roda), e o cru NÃO é removido — a carga promovida cita o path como prova. */
class ErroPromoveuSemPedido extends Error {}

function assertirModoConferencia(aplicar: boolean, resultado: ResultadoCarga): void {
  if (!aplicar && resultado.status !== 'conferida') {
    throw new ErroPromoveuSemPedido(
      `ABORTADO: sem --aplicar a carga ${resultado.carga_id} voltou com status "${resultado.status}" ` +
      '— o seed promoveu em produção sem ser pedido. Pare e confira `ingestao.carga`.',
    )
  }
}

async function processarBase(base: BaseIngestao, dir: string, aplicar: boolean): Promise<RelatoBase> {
  const arquivosLocais = localizarArquivosLocais(base, dir)
  if (arquivosLocais.length === 0) {
    return { base, pulada: true, ok: true }
  }

  const cargaId = randomUUID()
  const agora = new Date()
  const pathsSubidos: string[] = []
  let promovidaSemPedido = false

  try {
    const arquivosDaCarga: { path: string; nome: string; sha256: string }[] = []
    for (let i = 0; i < arquivosLocais.length; i++) {
      const enviado = await subirArquivo(base, cargaId, i + 1, arquivosLocais[i], agora)
      pathsSubidos.push(enviado.path)
      arquivosDaCarga.push(enviado)
    }

    const entrada: EntradaCarga = {
      base,
      cargaId,
      arquivos: arquivosDaCarga,
      extraidoEm: null,
      observacao: 'seed',
      origem: 'manual',
      idempotencia: null,
      // `confirmar` É "aplicar": false = conferência (nada escrito), true = promove. A 1ª versão
      // deste arquivo tinha `!aplicar` — o default conferência APLICARIA em produção. Pego na
      // revisão antes de rodar; `assertirModoConferencia` segura a regressão.
      confirmar: aplicar,
      chaveId: null,
      usuarioId: USUARIO_INGESTOR_ID,
    }
    const resultado = await processarCarga(entrada)
    assertirModoConferencia(aplicar, resultado)
    return { base, pulada: false, ok: true, resultado }
  } catch (err) {
    if (err instanceof ErroPromoveuSemPedido) {
      promovidaSemPedido = true
      throw err
    }
    if (err instanceof ErroCarga) {
      return {
        base, pulada: false, ok: false,
        erro: { codigo: err.codigo, mensagem: err.message, detalhe: err.detalhe },
      }
    }
    if (err instanceof ErroIngestaoStorage) {
      return { base, pulada: false, ok: false, erro: { codigo: err.codigo, mensagem: err.message } }
    }
    return {
      base, pulada: false, ok: false,
      erro: { codigo: 'ERRO_INESPERADO', mensagem: err instanceof Error ? err.message : String(err) },
    }
  } finally {
    // Conferência não deixa lixo (item 5 da missão): só remove o cru quando NÃO está aplicando —
    // uma carga aplicada cita o path no próprio registro, e a retenção de 3 meses cuida da
    // limpeza (contrato §7). Roda também quando a conferência FALHOU no meio (try/finally).
    if (!aplicar && !promovidaSemPedido && pathsSubidos.length > 0) {
      await removerCru(pathsSubidos)
    }
  }
}

// ── Relato por base (item 6 da missão) ──────────────────────────────────────────────────────────

function imprimirRelato(relato: RelatoBase): void {
  if (relato.pulada) {
    console.log(`  — esperado "${NOME_CANONICO_POR_BASE[relato.base]}" no diretório; não encontrado, base pulada.`)
    return
  }
  if (!relato.ok) {
    console.error(`  ✗ ${relato.erro?.codigo}: ${relato.erro?.mensagem}`)
    if (relato.erro?.detalhe !== undefined) {
      console.error(`    detalhe: ${JSON.stringify(relato.erro.detalhe)}`)
    }
    return
  }
  const r = relato.resultado
  if (!r) return

  console.log(`  status: ${r.status}${r.idempotente ? ' (idempotente — resposta de carga anterior)' : ''}`)
  for (const arq of r.arquivos) {
    console.log(
      `    arquivo "${arq.nome}": ${arq.linhas} linha(s), checksums ${arq.checksums_conferidos} conferido(s) / ${arq.checksums_falhos} falho(s)`,
    )
  }
  console.log(
    `  parse: ${r.parse.linhas} linha(s) parseada(s) (${r.parse.rejeitadas_por_data} rejeitada(s) por data), ` +
    `${r.parse.linhas_na_base} linha(s) na base após a carga, pares novos: ${r.parse.pares_novos}` +
    (r.parse.soma !== null ? `, Σ do arquivo R$ ${r.parse.soma.toFixed(2)}` : ''),
  )
  console.log(
    `  diff contra a base atual: linhas ${r.diff.linhas ?? '—'}` +
    (r.diff.soma !== null ? `, soma R$ ${r.diff.soma.toFixed(2)}` : '') +
    (r.diff.anos_fechados_alterados && r.diff.anos_fechados_alterados.length > 0
      ? ` — ⚠️ anos fechados alterados: ${r.diff.anos_fechados_alterados.join(', ')}`
      : ''),
  )
  if (r.promocao) {
    console.log(
      `  promoção: ${r.promocao.checksums_conferidos} checksum(s) reconferido(s), ${r.promocao.checksums_nao_conferiveis} não conferível(eis)`,
    )
  }
  if (r.alarmes.length > 0) {
    console.log('  alarmes:')
    for (const a of r.alarmes) console.log(`    - ${a}`)
  }
}

// ── Orquestração ────────────────────────────────────────────────────────────────────────────────

async function rodar(args: Args): Promise<void> {
  assertirOrdemContraGrafo()

  console.log('=== Janus — seed (contrato de ingestão v1) ===')
  console.log(`Diretório: ${args.dir}`)
  console.log(
    args.aplicar
      ? '⚠️  MODO --aplicar: cada base presente SUBSTITUI a base inteira em PRODUÇÃO e dispara alarmes reais.'
      : 'Modo conferência (default): nada é aplicado no banco; os crus enviados são removidos ao final de cada base.',
  )

  if (!fs.existsSync(args.dir) || !fs.statSync(args.dir).isDirectory()) {
    console.error(`\nDiretório não encontrado: ${args.dir}`)
    process.exitCode = 1
    return
  }

  const relatos: RelatoBase[] = []
  let abertoFalhouOuPulou = false

  for (const base of ORDEM_CARGA) {
    console.log(`\n▶ ${ROTULO_BASE[base]}`)
    if (base === 'lancamentos-operacao' && (abertoFalhouOuPulou || !args.aplicar)) {
      // O grafo (`checarDependenciaDeCarga`, `carga.ts`) roda mesmo em CONFERÊNCIA — uma
      // conferência de Aberto bem-sucedida acima não aplica nada, então esta base ainda depende
      // de uma carga de Aberto APLICADA em PRODUÇÃO hoje (fuso SP), não da conferência local.
      console.log(
        !args.aplicar
          ? '  ⚠️  O grafo de dependência (contrato §5) roda mesmo em conferência: esta base exige ' +
            'uma carga de "Lançamentos por Vencimento (em aberto)" APLICADA em produção hoje (fuso ' +
            'SP) — a conferência de Aberto acima, se houve, não aplicou nada. Sem isso, 409 ' +
            'DEPENDENCIA_AUSENTE é esperado, não um defeito.'
          : '  ⚠️  "Lançamentos por Vencimento (em aberto)" falhou/foi pulada acima — pelo grafo de ' +
            'dependência (contrato §5), esta base provavelmente vai levar 409 DEPENDENCIA_AUSENTE.',
      )
    }
    const relato = await processarBase(base, args.dir, args.aplicar)
    relatos.push(relato)
    imprimirRelato(relato)
    if (base === 'lancamentos-aberto' && (relato.pulada || !relato.ok)) abertoFalhouOuPulou = true
  }

  console.log('\n▶ Metas (app.meta_setor)')
  if (args.aplicar) {
    await loadMetas(true)
  } else {
    console.log('  — pulada: só roda com --aplicar (ela escreve).')
  }

  const houveFalha = relatos.some((r) => !r.pulada && !r.ok)
  console.log(houveFalha ? '\n=== Seed concluído COM FALHAS — ver acima ===' : '\n=== Seed concluído ===')
  if (houveFalha) process.exitCode = 1
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(AJUDA)
    return
  }
  await rodar(args)
}

main().catch((err) => {
  console.error('\n[ERRO]', err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
