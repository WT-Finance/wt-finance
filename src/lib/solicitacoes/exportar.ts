// ── Export de Solicitações para Excel (v6.3.1) — módulo PURO ──────────────────────
//
// Recebe a lista de `solic_caixa('todas')` (o mesmo shape que a tela consome) e devolve as
// abas como matrizes de células, sem a lib de planilha. A rota `/api/solicitacoes/exportar`
// só chama `aoa_to_sheet` sobre o resultado — por isso tudo o que importa (quais colunas,
// qual valor, qual data) é testável no vitest. Molde: `@/lib/dre/exportar` (v6.1.1).
//
// ── Contrato (decisão do Yan, 08/10/2026) ────────────────────────────────────────
//  · Quem exporta: quem tem a área de gestão `solicitacoes`. A lista é TODAS as solicitações
//    do sistema, qualquer que seja a visão/escopo/busca da tela. Movimentações não entram.
//  · Abas: "Todas" (uma linha por solicitação, colunas fixas), UMA POR TIPO (os campos do
//    formulário viram colunas), "Anexos" e "Sobre".
//
// ── Decisões técnicas (declaradas, não óbvias) ────────────────────────────────────
//  1. COLUNA DE CAMPO = RÓTULO + TIPO DO CAMPO, não `campo_id`. O editor de tipos apaga e
//     recria os campos a cada save (`admin_solic_salvar_tipo` faz DELETE+INSERT), então o
//     MESMO campo tem ids diferentes antes e depois de cada edição. Agrupar por id abria uma
//     coluna nova a cada edição (medido em 08/10: 19 colunas para os 10 campos de "Pagamentos
//     fora do prazo"). Dois campos de mesmo rótulo e tipo NA MESMA solicitação são campos
//     distintos de fato — aí ficam em colunas separadas. Rótulo exibido e ordem das colunas
//     vêm do snapshot MAIS RECENTE; campo que só existe em snapshots antigos vai para o fim.
//  2. NÚMERO É NÚMERO, DATA É DATA. Moeda sai como célula numérica lida pelo MESMO `toNum`
//     da tela (`fmtValor`) — o que o drawer mostra como R$ 1.318,00 sai 1318. Data sai como
//     serial do Excel com formato de data. Valor que não se deixa ler sai como o texto cru
//     (nunca some). Campo `numero` sai como TEXTO, como a tela o exibe: pode ser
//     identificador ("000123") e reinterpretar mudaria o que foi digitado.
//  3. HORÁRIO EM SÃO PAULO. timestamptz vira data-hora de parede em America/Sao_Paulo
//     (Intl), nunca UTC — mesma regra do `fmtDataHoraSP`. `data_limite` e campo `data` são
//     date puro: vão como calendário, sem fuso.
//  4. AUSÊNCIA ≠ VAZIO DE TEXTO. Campo não respondido (ou inexistente naquele snapshot) é
//     célula vazia (`null`), como no export da DRE.
//  5. SEM GUARDA ANTI-FÓRMULA. Em `.xlsx` a célula de texto (`t:'s'`) nunca vira fórmula, e o
//     apóstrofo da guarda da DRE apareceria LITERALMENTE no texto livre do usuário (descrição
//     começando por "-", por exemplo). Aqui o conteúdo é dado digitado, não rótulo nosso.

import { toNum } from '@/lib/carga/coercao'
import { STATUS_LABEL } from './format'
import type { Solicitacao } from './schemas'

// ── Tipos da saída ───────────────────────────────────────────────────────────────

/** Célula numérica (valor, data ou data-hora) pronta para `aoa_to_sheet`. */
export interface CelulaNumero {
  t: 'n'
  v: number
  /** Código de formato do Excel. */
  z?: string
}

/** `null` = célula VAZIA. Texto sai como `string`. */
export type Celula = string | CelulaNumero | null

export interface AbaExportacao {
  nome: string
  linhas: Celula[][]
  /** Largura de cada coluna em caracteres (`wch`). */
  larguras: number[]
  /** Liga o autofiltro do Excel na linha de cabeçalho. */
  filtro: boolean
}

export const FMT_MOEDA = '#,##0.00'
export const FMT_DATA = 'dd/mm/yyyy'
export const FMT_DATA_HORA = 'dd/mm/yyyy hh:mm'

export const NOME_ABA_TODAS = 'Todas'
export const NOME_ABA_ANEXOS = 'Anexos'
export const NOME_ABA_SOBRE = 'Sobre'

// ── Células ──────────────────────────────────────────────────────────────────────

/** Dias entre 1899-12-30 (época do Excel) e 1970-01-01. */
const EPOCA_EXCEL = 25569

function serial(ano: number, mes: number, dia: number, hora = 0, min = 0): number {
  return Date.UTC(ano, mes - 1, dia, hora, min) / 86_400_000 + EPOCA_EXCEL
}

function texto(v: string | null | undefined): Celula {
  return v == null || v === '' ? null : v
}

/** date puro 'AAAA-MM-DD' → data do Excel. Fora do formato → o texto cru. */
export function celulaData(iso: string | null | undefined): Celula {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? { t: 'n', v: serial(+m[1], +m[2], +m[3]), z: FMT_DATA } : iso
}

// cacheado: construir Intl por chamada custa ~ms (mesma nota de `@/lib/fmt`)
const PARTES_SP = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** timestamptz (UTC) → data-hora de parede em São Paulo, como serial do Excel. */
export function celulaDataHora(iso: string | null | undefined): Celula {
  if (!iso) return null
  const dt = new Date(iso)
  if (isNaN(dt.getTime())) return iso
  const p = Object.fromEntries(PARTES_SP.formatToParts(dt).map(x => [x.type, x.value]))
  return { t: 'n', v: serial(+p.year, +p.month, +p.day, +p.hour, +p.minute), z: FMT_DATA_HORA }
}

/** Valor de campo `moeda` → número pela leitura canônica da tela. Ilegível → texto cru. */
export function celulaMoeda(valor: string | null | undefined): Celula {
  if (valor == null || valor === '') return null
  const n = toNum(valor)
  return n === null || !Number.isFinite(n) ? valor : { t: 'n', v: n, z: FMT_MOEDA }
}

function inteiro(n: number): Celula {
  return { t: 'n', v: n }
}

// ── Larguras e nomes ─────────────────────────────────────────────────────────────

const LARGURA_MAX = 60

function larguraDe(c: Celula): number {
  if (c == null) return 0
  if (typeof c === 'string') return Math.max(...c.split('\n').map(l => l.length))
  if (c.z === FMT_DATA_HORA) return 16
  if (c.z === FMT_DATA) return 10
  return c.z === FMT_MOEDA ? 14 : String(c.v).length
}

function larguras(linhas: Celula[][]): number[] {
  const n = Math.max(0, ...linhas.map(l => l.length))
  return Array.from({ length: n }, (_, i) =>
    Math.min(LARGURA_MAX, Math.max(4, ...linhas.map(l => larguraDe(l[i] ?? null))) + 2))
}

function aba(nome: string, linhas: Celula[][], filtro = true): AbaExportacao {
  return { nome, linhas, larguras: larguras(linhas), filtro }
}

/** Nome de aba válido no Excel: sem `[]:*?/\`, até 31 caracteres, único (sem diferenciar
 *  maiúsculas) dentro da pasta. */
export function nomeDeAba(base: string, usados: Set<string>): string {
  const limpo = base.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim() || 'Tipo'
  let nome = limpo.slice(0, 31).trim()
  for (let i = 2; usados.has(nome.toLowerCase()); i++) {
    const suf = ` (${i})`
    nome = limpo.slice(0, 31 - suf.length).trim() + suf
  }
  usados.add(nome.toLowerCase())
  return nome
}

// ── Abas ─────────────────────────────────────────────────────────────────────────

const COLUNAS_TODAS = [
  'Nº', 'Tipo', 'Status', 'Origem', 'Solicitante', 'Destinatário', 'Aberta em', 'Prazo',
  'Aprovada em', 'Aprovada por', 'Decisão em', 'Decisão por', 'Descrição', 'Justificativa',
  'Anexos',
]

function nomeTipo(s: Solicitacao): string {
  return s.tipo_nome ?? `Tipo ${s.tipo_id}`
}

function abaTodas(lista: Solicitacao[]): AbaExportacao {
  return aba(NOME_ABA_TODAS, [COLUNAS_TODAS, ...lista.map(s => [
    inteiro(s.id),
    nomeTipo(s),
    STATUS_LABEL[s.status],
    s.origem ? `API (${s.origem.plataforma})` : 'Janus',
    texto(s.solicitante_email),
    texto(s.destinatario.rotulo),
    celulaDataHora(s.criado_em),
    celulaData(s.data_limite),
    celulaDataHora(s.aprovado_em),
    texto(s.aprovado_por_email),
    celulaDataHora(s.decidido_em),
    texto(s.decidido_por_email),
    texto(s.descricao),
    texto(s.justificativa),
    inteiro(s.anexos.length),
  ])])
}

interface ColunaCampo {
  rotulo: string
  tipo: Solicitacao['respostas'][number]['tipo_campo']
  /** Todos os `campo_id` que caíram nesta coluna (um por versão do tipo). */
  ids: Set<number>
}

/** Colunas de campo de UM tipo — ver decisão 1 no topo. Devolve as colunas em ordem e o
 *  mapa `campo_id → índice da coluna`. `lista` em ordem do mais recente ao mais antigo. */
export function colunasDoTipo(maisRecentesPrimeiro: Solicitacao[]): { colunas: ColunaCampo[]; colunaDoCampo: Map<number, number> } {
  const colunas: ColunaCampo[] = []
  const porChave = new Map<string, number>()
  const colunaDoCampo = new Map<number, number>()
  for (const s of maisRecentesPrimeiro) {
    const usadasNesta = new Set<number>()
    for (const r of s.respostas) {
      let idx = colunaDoCampo.get(r.campo_id)
      if (idx === undefined) {
        const chave = `${r.rotulo.trim().toLowerCase()}|${r.tipo_campo}`
        const existente = porChave.get(chave)
        if (existente !== undefined && !usadasNesta.has(existente)) {
          idx = existente
        } else {
          idx = colunas.push({ rotulo: r.rotulo.trim(), tipo: r.tipo_campo, ids: new Set() }) - 1
          if (existente === undefined) porChave.set(chave, idx)
        }
        colunaDoCampo.set(r.campo_id, idx)
      }
      colunas[idx].ids.add(r.campo_id)
      usadasNesta.add(idx)
    }
  }
  return { colunas, colunaDoCampo }
}

function cabecalhosDeCampo(colunas: ColunaCampo[]): string[] {
  const vistos = new Map<string, number>()
  return colunas.map(c => {
    const base = c.tipo === 'moeda' && !c.rotulo.includes('R$') ? `${c.rotulo} (R$)` : c.rotulo
    const n = (vistos.get(base) ?? 0) + 1
    vistos.set(base, n)
    return n > 1 ? `${base} [${n}]` : base
  })
}

const COLUNAS_FIXAS_TIPO = ['Nº', 'Status', 'Solicitante', 'Aberta em', 'Prazo', 'Decisão em', 'Descrição']

function abaDoTipo(nome: string, doTipo: Solicitacao[]): AbaExportacao {
  const recentesPrimeiro = [...doTipo].sort((a, b) => b.criado_em.localeCompare(a.criado_em) || b.id - a.id)
  const { colunas, colunaDoCampo } = colunasDoTipo(recentesPrimeiro)
  const linhas: Celula[][] = doTipo.map(s => {
    const campos: Celula[] = colunas.map(() => null)
    for (const r of s.respostas) {
      const idx = colunaDoCampo.get(r.campo_id)
      if (idx === undefined) continue
      const col = colunas[idx]
      if (col.tipo === 'anexo') continue // o arquivo vive em `anexos`, não no snapshot
      campos[idx] = col.tipo === 'moeda' ? celulaMoeda(r.valor)
        : col.tipo === 'data' ? celulaData(r.valor)
        : texto(r.valor)
    }
    colunas.forEach((col, idx) => {
      if (col.tipo !== 'anexo') return
      const nomes = s.anexos.filter(a => a.campo_id != null && col.ids.has(a.campo_id)).map(a => a.nome)
      campos[idx] = texto(nomes.join('; '))
    })
    return [
      inteiro(s.id), STATUS_LABEL[s.status], texto(s.solicitante_email),
      celulaDataHora(s.criado_em), celulaData(s.data_limite), celulaDataHora(s.decidido_em),
      texto(s.descricao), ...campos,
    ]
  })
  return aba(nome, [[...COLUNAS_FIXAS_TIPO, ...cabecalhosDeCampo(colunas)], ...linhas])
}

function abaAnexos(lista: Solicitacao[]): AbaExportacao {
  const linhas: Celula[][] = []
  for (const s of lista) {
    const rotuloDoCampo = new Map(s.respostas.map(r => [r.campo_id, r.rotulo]))
    for (const a of s.anexos) {
      linhas.push([
        inteiro(s.id), nomeTipo(s),
        a.campo_id == null ? 'Anexo posterior' : texto(rotuloDoCampo.get(a.campo_id)),
        a.nome, texto(a.mime),
        { t: 'n', v: Math.round(a.tamanho / 1024), z: '#,##0' },
      ])
    }
  }
  return aba(NOME_ABA_ANEXOS, [['Nº solicitação', 'Tipo', 'Campo', 'Arquivo', 'Formato', 'Tamanho (KB)'], ...linhas])
}

function abaSobre(lista: Solicitacao[], geradoEm: Date): AbaExportacao {
  const nAnexos = lista.reduce((t, s) => t + s.anexos.length, 0)
  return aba(NOME_ABA_SOBRE, [
    ['Relatório de Solicitações — Janus', null],
    ['Gerado em', celulaDataHora(geradoEm.toISOString())],
    ['Solicitações', inteiro(lista.length)],
    ['Anexos', inteiro(nAnexos)],
    [null, null],
    ['Notas', null],
    ['Horários no fuso de São Paulo. Nº é o número da solicitação na plataforma.', null],
    ['Nas abas por tipo, os campos do formulário viram colunas, como estavam quando a solicitação foi aberta; um campo retirado do tipo depois fica vazio nas mais novas.', null],
    ['Valores em R$ lidos com a mesma regra da tela da solicitação.', null],
    ['"Decisão em/por" é a conclusão, a rejeição ou o cancelamento. A plataforma guarda só a decisão final, não o histórico de mudanças.', null],
  ], false)
}

// ── API ──────────────────────────────────────────────────────────────────────────

/** Monta a planilha: Todas, uma aba por tipo (mais solicitações primeiro), Anexos e Sobre.
 *  As linhas saem em ordem de número (id). */
export function montarExportacaoSolicitacoes(lista: Solicitacao[], geradoEm: Date): AbaExportacao[] {
  const ordenada = [...lista].sort((a, b) => a.id - b.id)
  const usados = new Set([NOME_ABA_TODAS, NOME_ABA_ANEXOS, NOME_ABA_SOBRE].map(n => n.toLowerCase()))

  const porTipo = new Map<number, Solicitacao[]>()
  for (const s of ordenada) porTipo.set(s.tipo_id, [...(porTipo.get(s.tipo_id) ?? []), s])
  const tipos = [...porTipo.values()].sort((a, b) =>
    b.length - a.length || nomeTipo(a[0]).localeCompare(nomeTipo(b[0]), 'pt-BR'))

  return [
    abaTodas(ordenada),
    ...tipos.map(doTipo => abaDoTipo(nomeDeAba(nomeTipo(doTipo[0]), usados), doTipo)),
    abaAnexos(ordenada),
    abaSobre(ordenada, geradoEm),
  ]
}

/** Nome do arquivo, sem acento: `solicitacoes-AAAA-MM-DD.xlsx` (data em São Paulo). */
export function nomeArquivoExportacao(hoje: string): string {
  return `solicitacoes-${hoje}.xlsx`
}
