'use client'

import { useEffect, useRef, useState } from 'react'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import GatilhoAjuda from '@/components/ui/gatilho-ajuda'
import { PILL_FILTRO, PILL_FILTRO_INATIVO, PILL_FILTRO_ATIVO_STYLE } from '@/components/shared/botoes'
import { ConteudoContabil } from './celula-contabil'
import {
  AcoesHierarquia, CabecalhoCard, CelulaAv, CelulaConta, CelulaDeltaPct, CelulaValor, RotuloGrupo, ThConta,
  W_AV, W_TOTAL, classeFixa, estiloFixa, estiloLinha, type Fixa,
} from './tabela-dre'
import QuemCobreQuem from './quem-cobre-quem'
import SeletorCentro from './seletor-centro'
import { chaveDeLinha } from '@/lib/dre/identidade'
import { SUF_PARCIAL } from '@/lib/dre/mes-parcial'
import { MESES } from '@/lib/dre/colunas-tabela'
import { fmtBRL, fmtMi, hojeSP } from '@/lib/fmt'
import { ROTULO_CENTRO, ROTULO_SELETOR, SELETOR_INICIAL, type CentroId, type SeletorCentro as Opcao } from '@/lib/dre-centro/centros'
import {
  chaveMemoria, visaoConsolidado, visaoLadoALado, visaoMensal, type ColunaVisao, type VisaoTabela,
} from '@/lib/dre-centro/visoes'
import type { AnoDadosCentro, NotasCentro } from '@/lib/dre-centro/montar'
import { abaDaVisao, nomeArquivoCentro } from '@/lib/dre-centro/exportar'

// ── DRE de caixa por centro de custo (v6.5.1) — componente IRMÃO da `TabelaDre` ─────────────
//
// CARD SEPARADO na seção Regime de Caixa (decisão do Yan no GATE 1): a visão Empresa continua
// sendo a `TabelaDre` logo acima, intocada (só ganhou `export` nos primitivos que este arquivo
// reusa; o snapshot em `tabela-dre.test.ts` mede isso). Aqui ficam as visões que a Empresa não
// tem: um centro (Mensal e Consolidado) e os centros Lado a lado, escolhidos pelo seletor do
// próprio card. Mesma árvore, mesmas células, mesmas pills; colunas pelo modelo de
// `@/lib/dre-centro/visoes`.
//
// Diferenças declaradas em relação à Empresa (§2 do briefing):
//   · só Realizado — "Realizado + Previsto" fica desabilitado com o "?" explicando;
//   · só os anos com cobertura de centro (derivados do dado) — os demais ficam desabilitados;
//   · o último totalizador vira "(=) Resultado operacional de caixa", seguido do bloco de
//     antecipação e do "(=) Resultado de caixa";
//   · memória fora das somas, em estilo próprio (itálico, sem AV, sem cor por sinal).

type VisaoCentro = 'mensal' | 'consolidado'

const AJUDA_PREVISTO =
  'Por centro só há Realizado. O título em aberto quase nunca tem centro de custo no Monde (90% do ' +
  'valor em aberto de 2026 está sem centro), então uma projeção por centro seria quase toda "Sem centro".'

const W_VALOR = 132
const W_DELTA = 104

/** Larguras das colunas presas à direita — a MESMA constante da `TabelaDre` alimenta o `right`. */
const FIXA: Record<'total' | 'av', Fixa> = {
  total: { right: W_AV, largura: W_TOTAL },
  av:    { right: 0,    largura: W_AV },
}

const TH_BASE = 'px-3.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary'

/** "Nov · parcial": o sufixo fica em caixa normal, como na tabela de competência. */
function RotuloColuna({ rotulo }: { rotulo: string }) {
  if (!rotulo.endsWith(SUF_PARCIAL)) return <>{rotulo}</>
  return (
    <>
      {rotulo.slice(0, -SUF_PARCIAL.length)}
      <span className="normal-case font-normal tracking-normal text-text-subtle">{SUF_PARCIAL}</span>
    </>
  )
}

/** Rótulo de cabeçalho com o "?" quando a coluna pede explicação (Total do Lado a lado, AV* do CSC). O balão
 *  é o primitivo do DS (foco por teclado); perto da borda direita abre para a esquerda (`ancoraDireita`). */
function RotuloComAjuda({ c, ancoraDireita = false }: { c: ColunaVisao; ancoraDireita?: boolean }) {
  if (!c.ajuda) return <>{c.rotulo}</>
  return (
    <span className="inline-flex items-center justify-end gap-1">
      {c.rotulo}
      <GatilhoAjuda
        rotulo={c.rotulo}
        texto={c.titulo}
        ancoraDireita={ancoraDireita}
        classNameBalao="z-40 w-72 !whitespace-normal text-left font-normal normal-case tracking-normal leading-snug"
      />
    </span>
  )
}

function larguraColuna(c: ColunaVisao): number {
  if (c.fixa) return FIXA[c.fixa].largura
  return c.tipo === 'av' ? W_AV : c.tipo === 'delta' ? W_DELTA : W_VALOR
}

// ── Notas de cobertura (sob a tabela) ────────────────────────────────────────
const dataCurta = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/') // date puro
const pct = (x: number) => `${(x * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

function Notas({ notas, ano }: { notas: NotasCentro; ano: number }) {
  const pctIdent = notas.registrado > 0 ? notas.identificado / notas.registrado : 1
  return (
    <ul className="mt-3 space-y-1 text-xs leading-relaxed text-text-muted">
      <li>
        <span className="font-medium text-text-secondary">Cobertura de centro em {ano}:</span>{' '}
        {pct(notas.coberturaPct)} do valor movimentado tem centro de custo
        {notas.semCentro > 0.005 && <> ({fmtMi(notas.semCentro)} sem centro — corrige-se no lançamento, no Monde)</>}.
      </li>
      <li>
        <span className="font-medium text-text-secondary">Antecipações de {ano}:</span>{' '}
        {fmtMi(notas.identificado)} identificadas nos recebimentos, de {fmtMi(notas.registrado)} registradas ({pct(pctIdent)}).
        {notas.naoIdentificadas.length > 0 && (
          <> Não identificado: {notas.naoIdentificadas.map(n =>
            `${dataCurta(n.data)} (${n.conta}, ${fmtMi(n.falta)}${n.motivo ? ` — ${n.motivo}` : ''})`).join('; ')}.</>
        )}
      </li>
      {notas.taxaPendente < -0.005 && (
        <li>
          <span className="font-medium text-text-secondary">Taxa ainda não lançada no Monde:</span>{' '}
          {fmtBRL(-notas.taxaPendente)}
          {notas.datasTaxaPendente.length > 0 && <> (sem nenhuma taxa no Monde: {notas.datasTaxaPendente.map(dataCurta).join(', ')})</>}.
          A DRE usa a taxa do Monde; o registro de antecipações é a conferência (a soma compensa sobras e faltas pequenas
          entre os dois).
        </li>
      )}
      {notas.naoDevolvido > 0.005 && (
        <li>
          <span className="font-medium text-text-secondary">Tomado e ainda não devolvido:</span>{' '}
          {fmtMi(notas.naoDevolvido)} antecipados em {ano} vencem só em {ano + 1} — a linha C já mostra, a D virá no ano seguinte.
        </li>
      )}
      {/* A explicação da memória fica VISÍVEL (o `title` das linhas não abre por teclado nem em toque — revisor). */}
      <li>
        <span className="font-medium text-text-secondary">Memória (fora das somas):</span>{' '}
        recebíveis próprios cedidos = recebíveis do centro usados nas antecipações, no mês da antecipação (quem precisou do
        caixa leva a linha C, não o dono); saldos acumulados = soma desde 1º de janeiro, no fim de cada mês — negativo é o
        centro que consumiu mais caixa do que gerou.
      </li>
    </ul>
  )
}

// ── Tabela (as três visões desenham pelo mesmo corpo) ────────────────────────

function TabelaVisao({
  v, abertos, expansiveis, onToggle, rolado,
}: {
  v: VisaoTabela
  abertos: Set<string>
  expansiveis: Set<string>
  onToggle: (k: string) => void
  rolado: boolean
}) {
  const bordaBaseHeader = [
    'border-b-[1.5px] border-b-wt-border-strong',
    rolado ? 'shadow-[0_4px_6px_-4px_rgba(45,42,38,0.12)]' : '',
  ].filter(Boolean).join(' ')
  const naoFixas = v.colunas.filter(c => !c.fixa)
  const fixas = v.colunas.filter(c => c.fixa)
  const larguraFixas = fixas.reduce((s, c) => s + larguraColuna(c), 0)
  const minWidth = 330 + v.colunas.reduce((s, c) => s + larguraColuna(c), 0)
  // Primeira coluna de cada grupo — é onde a régua entre grupos (centros) cai.
  const inicioGrupo = new Set<number>()
  v.grupos.reduce((i, g) => { inicioGrupo.add(i); return i + g.span }, 0)
  const nTotal = 1 + v.colunas.length

  return (
    <table className="w-full border-separate border-spacing-0 text-[13px]" style={{ minWidth }}>
      <thead className="sticky top-0 z-20 [&_th]:bg-band">
        <tr>
          <ThConta bordaBaseHeader={bordaBaseHeader} />
          {v.grupos.map((g, i) => (
            <th
              key={`${g.rotulo}-${i}`}
              colSpan={g.span}
              title={g.titulo}
              className={`whitespace-nowrap py-1.5 ${TH_BASE} ${i > 0 ? 'border-l-2 border-l-wt-border-strong' : ''}`}
            >
              <RotuloGrupo larguraFixas={larguraFixas}>{g.rotulo}</RotuloGrupo>
            </th>
          ))}
          {fixas.map(c => (
            <th
              key={c.id}
              rowSpan={2}
              title={c.titulo}
              className={`align-bottom pb-[7px] ${TH_BASE} ${c.fixa === 'total' ? 'border-l border-l-wt-border-strong' : 'px-3'} ${bordaBaseHeader} ${classeFixa(FIXA[c.fixa!], 'cabecalho')}`}
              style={estiloFixa(FIXA[c.fixa!])}
            >
              <RotuloComAjuda c={c} ancoraDireita />
            </th>
          ))}
        </tr>
        <tr>
          {naoFixas.map((c, i) => (
            <th
              key={c.id}
              title={c.titulo}
              className={`h-[25px] whitespace-nowrap ${TH_BASE} ${c.tipo === 'av' ? 'px-3' : ''} ${inicioGrupo.has(i) && i > 0 ? 'border-l-2 border-l-wt-border-strong' : ''} ${bordaBaseHeader}`}
              style={{ width: larguraColuna(c), minWidth: larguraColuna(c) }}
            >
              {c.ajuda ? <RotuloComAjuda c={c} /> : <RotuloColuna rotulo={c.rotulo} />}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {v.linhas.map((l, i) => {
          if (l.t === 'cat' && (l.g == null || !abertos.has(l.g))) return null
          const est = estiloLinha(l.t)
          const k = chaveDeLinha(l)
          const chave = l.chave ?? null
          const expansivel = chave != null && expansiveis.has(chave)
          let iNaoFixa = -1
          return (
            <tr key={`${l.t}-${k ?? l.rotulo}-${i}`} className="group">
              <CelulaConta
                rotulo={l.rotulo} rotuloClasse={est.rotulo} indent={est.indent} borda={est.borda}
                bg={est.bg} bgHover={est.bgHover} estrela={l.estrela}
                expansivel={expansivel} aberto={chave != null && abertos.has(chave)}
                onToggle={expansivel && chave != null ? () => onToggle(chave) : undefined}
              />
              {v.colunas.map(c => {
                const valor = k ? (v.valores[c.id]?.[k] ?? null) : null
                const fixa = c.fixa ? FIXA[c.fixa] : null
                if (!c.fixa) iNaoFixa++
                const corte = !c.fixa && iNaoFixa > 0 && inicioGrupo.has(iNaoFixa)
                if (c.tipo === 'av') {
                  return <CelulaAv key={c.id} pct={valor} tipo={l.t} fundo="normal" bg={est.bg} bgHover={est.bgHover} borda={est.borda} fixa={fixa} />
                }
                if (c.tipo === 'delta') {
                  return <CelulaDeltaPct key={c.id} pct={valor} tipo={l.t} peso={est.peso} bg={est.bg} bgHover={est.bgHover} borda={est.borda} />
                }
                return (
                  <CelulaValor
                    key={c.id} valor={valor} tipo={l.t} fundo="normal" corte={corte} totalAno={c.fixa === 'total'}
                    peso={est.peso} bg={est.bg} bgHover={est.bgHover} borda={est.borda} fixa={fixa}
                  />
                )
              })}
            </tr>
          )
        })}

        {/* Memória — fora das somas: faixa própria, itálico, sem AV e sem cor por sinal. */}
        <tr>
          <td className="sticky left-0 z-10 h-8 w-[330px] min-w-[330px] max-w-[330px] border-r border-r-wt-border-strong border-t-[1.5px] border-t-wt-border-strong bg-band-soft pl-3 pr-3 whitespace-nowrap">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-text-secondary">Memória</span>
          </td>
          <td colSpan={nTotal - 1} className="border-t-[1.5px] border-t-wt-border-strong bg-band-soft px-3.5 text-[10.5px] text-text-muted">
            <span className="sticky left-[346px]">fora das somas — informativo</span>
          </td>
        </tr>
        {v.memoria.map(m => {
          const k = chaveMemoria(m)
          return (
            <tr key={k} className="group">
              <td
                className="sticky left-0 z-10 h-8 w-[330px] min-w-[330px] max-w-[330px] border-b border-b-wt-border/60 border-r border-r-wt-border-strong bg-surface pl-11 pr-2 group-hover:bg-surface-strong"
                title={m.ajuda}
              >
                <span className="block truncate text-[12.5px] italic text-text-muted">{m.rotulo}</span>
              </td>
              {v.colunas.map(c => {
                const fixa = c.fixa ? FIXA[c.fixa] : null
                const bordaTotal = c.fixa === 'total' ? 'border-l border-l-wt-border-strong' : ''
                return (
                  <td
                    key={c.id}
                    className={`h-8 px-3.5 tabular-nums whitespace-nowrap border-b border-b-wt-border/60 bg-surface italic text-text-muted group-hover:bg-surface-strong ${bordaTotal} ${classeFixa(fixa, 'corpo')}`}
                    style={estiloFixa(fixa)}
                  >
                    {c.tipo === 'valor' ? <ConteudoContabil valor={v.valores[c.id]?.[k] ?? null} /> : null}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────

export interface TabelaDreCentroProps {
  /** Abertura do card (default: Lado a lado). */
  seletorInicial?: Opcao
  leitura: { ok: true; anos: AnoDadosCentro[] } | { ok: false; motivo: 'vazio' | 'erro' }
  anosDisponiveis: number[]
  mesJanela: number
}

const TITULO = 'Demonstrativo de Resultado por Centro de Custo'

export default function TabelaDreCentro({ seletorInicial = SELETOR_INICIAL, leitura, anosDisponiveis, mesJanela }: TabelaDreCentroProps) {
  const anos = leitura.ok ? leitura.anos : []
  const [seletor, setSeletor] = useState<Opcao>(seletorInicial)
  const [visao, setVisao] = useState<VisaoCentro>('mensal')
  const [anoEscolhido, setAnoEscolhido] = useState<number | null>(null)
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set())
  const [rolado, setRolado] = useState(false)
  const [telaCheia, setTelaCheia] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [erroExportar, setErroExportar] = useState(false)
  const refCard = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const aoMudar = () => setTelaCheia(document.fullscreenElement === refCard.current)
    document.addEventListener('fullscreenchange', aoMudar)
    return () => document.removeEventListener('fullscreenchange', aoMudar)
  }, [])

  const lado = seletor === 'lado'
  const titulo = TITULO
  const cobertos = new Set(anos.map(a => a.ano))
  // Ano EFETIVO: o escolhido, se ainda coberto; senão o mais recente coberto (derivação de render).
  const ano = anos.find(a => a.ano === anoEscolhido) ?? anos.at(-1) ?? null
  const visaoEfetiva: VisaoCentro = lado ? 'mensal' : visao

  if (!leitura.ok || !ano) {
    const vazio = !leitura.ok && leitura.motivo === 'vazio'
    return (
      <div className="rounded-xl bg-surface p-5 shadow-sm">
        <CabecalhoCard titulo={titulo} />
        <div className="rounded-lg border border-wt-border p-6 text-center">
          <p className="text-sm text-text-muted">
            {vazio
              ? 'A base de centro de custo ainda não foi carregada. Envie o relatório "Lançamentos por Centro de Custo" no Upload, no mesmo dia da base de lançamentos.'
              : 'Não foi possível carregar a DRE por centro de custo — tente recarregar. A DRE da empresa, acima, segue disponível.'}
          </p>
        </div>
      </div>
    )
  }

  const v: VisaoTabela | null = lado
    ? visaoLadoALado({ ano: ano.ano, porCentro: ano.porCentro, fim: ano.fim, parcial: ano.parcial, rbEmpresaMeses: ano.rbEmpresaMeses })
    : visaoEfetiva === 'consolidado'
      ? visaoConsolidado({
          centro: seletor,
          mesJanela,
          anos: anos.map(a => ({ ano: a.ano, parcial: a.parcial, fim: a.fim, lc: a.porCentro[seletor], rbEmpresaMeses: a.rbEmpresaMeses })),
        })
      : visaoMensal({ ano: ano.ano, centro: seletor, lc: ano.porCentro[seletor], fim: ano.fim, parcial: ano.parcial, rbEmpresaMeses: ano.rbEmpresaMeses })

  const expansiveis = new Set<string>()
  v?.linhas.forEach(l => { if (l.t === 'cat' && l.g) expansiveis.add(l.g) })
  const toggle = (k: string) => setAbertos(prev => {
    const s = new Set(prev)
    if (s.has(k)) s.delete(k)
    else s.add(k)
    return s
  })

  function alternarTelaCheia() {
    const el = refCard.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void el.requestFullscreen?.().catch(() => {})
  }

  async function exportarExcel() {
    if (exportando || !v || !ano) return
    setExportando(true)
    setErroExportar(false)
    try {
      const XLSX = await import('@e965/xlsx')
      const geradoEm = hojeSP()
      const abas = lado
        ? [
            abaDaVisao('Lado a lado', v),
            ...(Object.keys(ano.porCentro) as CentroId[]).map(c =>
              abaDaVisao(ROTULO_CENTRO[c], visaoMensal({ ano: ano.ano, centro: c, lc: ano.porCentro[c], fim: ano.fim, parcial: ano.parcial, rbEmpresaMeses: ano.rbEmpresaMeses }))),
          ]
        : [abaDaVisao(`${ROTULO_SELETOR[seletor]} ${visaoEfetiva === 'mensal' ? 'Mensal' : 'Consolidado'}`, v)]
      const wb = XLSX.utils.book_new()
      for (const aba of abas) {
        const ws = XLSX.utils.aoa_to_sheet(aba.linhas)
        ws['!cols'] = aba.larguras.map(wch => ({ wch }))
        XLSX.utils.book_append_sheet(wb, ws, aba.nome)
      }
      XLSX.writeFile(wb, nomeArquivoCentro(ROTULO_SELETOR[seletor], ano.ano, geradoEm))
    } catch (err) {
      console.error('[DRE por centro exportar]', err)
      setErroExportar(true)
    } finally {
      setExportando(false)
    }
  }

  const pillVisao = (alvo: VisaoCentro, rotulo: string, title: string) => (
    <button
      type="button"
      onClick={() => setVisao(alvo)}
      disabled={lado}
      aria-pressed={visaoEfetiva === alvo && !lado}
      title={lado ? 'Lado a lado mostra o ano escolhido, um centro por coluna' : title}
      className={['foco-neutro', PILL_FILTRO, visaoEfetiva === alvo && !lado ? '' : PILL_FILTRO_INATIVO, 'disabled:opacity-50 disabled:cursor-not-allowed'].join(' ')}
      style={visaoEfetiva === alvo && !lado ? PILL_FILTRO_ATIVO_STYLE : undefined}
    >
      {rotulo}
    </button>
  )

  return (
    <div className="space-y-6">
      <div
        ref={refCard}
        className={telaCheia ? 'h-full w-full overflow-auto bg-surface p-5' : 'rounded-xl bg-surface p-5 shadow-sm'}
      >
        <CabecalhoCard titulo={titulo} />

        <div className="mb-4 flex flex-col gap-2">
          <SeletorCentro atual={seletor} onEscolher={setSeletor} />
          <div className="flex flex-wrap items-center gap-2">
            {pillVisao('mensal', 'Mensal', 'Visão mês a mês do ano selecionado')}
            {pillVisao('consolidado', 'Consolidado', 'Visão ano a ano — só os anos com centro de custo')}
            <span className="mx-1 h-4 w-px bg-wt-border-strong" aria-hidden />
            {anosDisponiveis.map(a => {
              const coberto = cobertos.has(a)
              const ativo = coberto && (visaoEfetiva === 'consolidado' ? true : a === ano.ano)
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAnoEscolhido(a)}
                  disabled={!coberto}
                  aria-pressed={ativo}
                  title={coberto ? `Ver ${a}` : `${a} não tem centro de custo no Monde — a análise por centro começa em 2026`}
                  className={['foco-neutro', PILL_FILTRO, ativo ? '' : PILL_FILTRO_INATIVO, 'disabled:opacity-50 disabled:cursor-not-allowed'].join(' ')}
                  style={ativo ? PILL_FILTRO_ATIVO_STYLE : undefined}
                >
                  {a}
                </button>
              )
            })}
            <span className="mx-1 h-4 w-px bg-wt-border-strong" aria-hidden />
            {/* Não é botão: por centro só há Realizado, e botão inerte é pior que botão ausente (revisor). */}
            <span className={PILL_FILTRO} style={PILL_FILTRO_ATIVO_STYLE} title="Só o que já aconteceu">
              Realizado
            </span>
            <span className="inline-flex items-center gap-1">
              <button
                type="button"
                disabled
                className={['foco-neutro', PILL_FILTRO, PILL_FILTRO_INATIVO, 'disabled:opacity-50 disabled:cursor-not-allowed'].join(' ')}
              >
                Realizado + Previsto
              </button>
              <GatilhoAjuda
                rotulo="Por que não há previsto por centro"
                texto={AJUDA_PREVISTO}
                classNameBalao="z-30 w-72 !whitespace-normal font-normal normal-case tracking-normal leading-snug"
              />
            </span>
            <AcoesHierarquia
              onExpandir={() => setAbertos(new Set(expansiveis))}
              onRecolher={() => setAbertos(new Set())}
              telaCheia={telaCheia}
              onAlternarTelaCheia={alternarTelaCheia}
              onExportar={() => void exportarExcel()}
              exportando={exportando}
              erroExportar={erroExportar}
              tituloExportar={lado
                ? 'Baixar em Excel — uma aba com os centros lado a lado e uma aba mensal por centro'
                : 'Baixar em Excel a visão da tela, com todas as linhas e a memória'}
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-wt-border bg-band">
          <div className="pb-1.5 pr-1.5">
            <ScrollAutoHide
              eixo="both"
              className={`${telaCheia ? 'max-h-[calc(100vh-150px)]' : 'max-h-[80vh]'} pb-3.5`}
              onScroll={e => setRolado(e.currentTarget.scrollTop > 0)}
            >
              {v && <TabelaVisao v={v} abertos={abertos} expansiveis={expansiveis} onToggle={toggle} rolado={rolado} />}
            </ScrollAutoHide>
          </div>
        </div>

        <Notas notas={ano.notas} ano={ano.ano} />
        {visaoEfetiva === 'consolidado' && anos.length === 1 && (
          <p className="mt-1 text-xs text-text-muted">
            Sem Δ% contra {ano.ano - 1}: o Monde não tem centro de custo antes de {anos[0].ano}.
          </p>
        )}
        {ano.parcial && (
          <p className="mt-1 text-xs text-text-muted">
            * {ano.ano} em curso: realizado de jan a {MESES[ano.fim - 1].toLowerCase()}, o último mês parcial.
          </p>
        )}
      </div>

      {lado && <QuemCobreQuem dados={ano.quem} fim={ano.fim} parcial={ano.parcial} ano={ano.ano} />}
    </div>
  )
}
