'use client'

import { useMemo, useState } from 'react'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { numBRL2, fmtAxisMes, fmtDate } from '@/lib/fmt'

// Pivô + tabela da Comparação Upload × Monde (v5.1.2/M6). Puramente de apresentação:
// o dado já chega calculado pela RPC `monde_comparacao_mensal` (uma linha por
// mês×macro, FULL OUTER JOIN — o lado ausente já vem zerado do banco). Aqui só
// filtra por setor (Group = soma dos 3 macros) e monta a tabela mês a mês + total.
// Δ = Monde − Upload; NÃO é indicador de "bom/ruim" (é comparação, não saúde
// financeira) — só ganha destaque (--warning) quando a divergência relativa da
// linha passa de 1% (drift que merece uma olhada).

/** Shape de uma linha de `monde_comparacao_mensal` (espelha o schema Zod validado em
 *  src/app/metas/comparacao/page.tsx — duplicado aqui, não importado do Server
 *  Component, para não acoplar o client component ao módulo da página). */
export interface LinhaComparacao {
  mes:           string
  macro:         string
  upload_fat:    number
  upload_rec:    number
  upload_vendas: number
  monde_fat:     number
  monde_rec:     number
  monde_vendas:  number
}

type SetorKey = 'Group' | 'Lazer' | 'Weddings' | 'Corporativo'

/** display = nome de exibição; key = valor de `macro` no banco ('Lazer' → 'Trips' na UI,
 *  mesma convenção de carregar-acompanhamento.ts). */
const SETORES: { key: SetorKey; display: string }[] = [
  { key: 'Group',       display: 'Group' },
  { key: 'Lazer',       display: 'Trips' },
  { key: 'Weddings',    display: 'Weddings' },
  { key: 'Corporativo', display: 'Corporativo' },
]

interface Totais {
  upload_fat:    number
  monde_fat:     number
  upload_rec:    number
  monde_rec:     number
  upload_vendas: number
  monde_vendas:  number
}

interface Agregado extends Totais {
  mes: string
}

const TOTAIS_VAZIO: Totais = {
  upload_fat: 0, monde_fat: 0, upload_rec: 0, monde_rec: 0, upload_vendas: 0, monde_vendas: 0,
}

function somarCampos(a: Totais, b: Totais): Totais {
  return {
    upload_fat:    a.upload_fat    + b.upload_fat,
    monde_fat:     a.monde_fat     + b.monde_fat,
    upload_rec:    a.upload_rec    + b.upload_rec,
    monde_rec:     a.monde_rec     + b.monde_rec,
    upload_vendas: a.upload_vendas + b.upload_vendas,
    monde_vendas:  a.monde_vendas  + b.monde_vendas,
  }
}

/** Divergência relativa (%). Base = upload (fonte corrente das Metas); se o upload
 *  não tem nada no mês, cai no Monde (evita divisão por zero sem esconder o drift
 *  quando só um dos dois lados tem valor). */
function pctDivergencia(upload: number, monde: number): number {
  const base = Math.abs(upload) > 0 ? Math.abs(upload) : Math.abs(monde)
  if (base === 0) return 0
  return (Math.abs(monde - upload) / base) * 100
}

function fmtDeltaMoeda(v: number): string {
  const sinal = v > 0 ? '+' : v < 0 ? '-' : ''
  return `${sinal}${numBRL2(Math.abs(v))}`
}

function fmtDeltaInt(v: number): string {
  const sinal = v > 0 ? '+' : v < 0 ? '-' : ''
  return `${sinal}${Math.round(Math.abs(v)).toLocaleString('pt-BR')}`
}

const TH_BASE = 'py-2 px-3 text-xs font-medium text-zinc-400 whitespace-nowrap'
const TD_BASE = 'py-2 px-3 tabular-nums text-zinc-700'

function DeltaTd({ upload, monde, tipo }: { upload: number; monde: number; tipo: 'moeda' | 'int' }) {
  const delta = monde - upload
  const notavel = pctDivergencia(upload, monde) > 1
  const texto = tipo === 'moeda' ? fmtDeltaMoeda(delta) : fmtDeltaInt(delta)
  return (
    <td className={`${TD_BASE} text-right ${notavel ? 'font-medium text-warning' : 'text-zinc-500'}`}>
      {texto}
    </td>
  )
}

function LinhaTabela({ mes, dado, zebra, negrito }: {
  mes: string; dado: Totais; zebra?: boolean; negrito?: boolean
}) {
  return (
    <tr className={`${zebra ? 'bg-zinc-50/50' : ''} ${negrito ? 'border-t border-zinc-200' : ''}`}>
      <td className={`${TD_BASE} ${negrito ? 'font-medium' : ''}`}>
        {negrito ? 'Total do período' : fmtAxisMes(mes)}
      </td>
      <td className={`${TD_BASE} text-right ${negrito ? 'font-medium' : ''}`}>
        <ValorContabil valor={dado.upload_fat} />
      </td>
      <td className={`${TD_BASE} text-right ${negrito ? 'font-medium' : ''}`}>
        <ValorContabil valor={dado.monde_fat} />
      </td>
      <DeltaTd upload={dado.upload_fat} monde={dado.monde_fat} tipo="moeda" />
      <td className={`${TD_BASE} text-right ${negrito ? 'font-medium' : ''}`}>
        <ValorContabil valor={dado.upload_rec} />
      </td>
      <td className={`${TD_BASE} text-right ${negrito ? 'font-medium' : ''}`}>
        <ValorContabil valor={dado.monde_rec} />
      </td>
      <DeltaTd upload={dado.upload_rec} monde={dado.monde_rec} tipo="moeda" />
      <td className={`${TD_BASE} text-right ${negrito ? 'font-medium' : ''}`}>
        {Math.round(dado.upload_vendas).toLocaleString('pt-BR')}
      </td>
      <td className={`${TD_BASE} text-right ${negrito ? 'font-medium' : ''}`}>
        {Math.round(dado.monde_vendas).toLocaleString('pt-BR')}
      </td>
      <DeltaTd upload={dado.upload_vendas} monde={dado.monde_vendas} tipo="int" />
    </tr>
  )
}

interface Props {
  linhas: LinhaComparacao[]
  from: string
  to: string
}

export default function ComparacaoContent({ linhas, from, to }: Props) {
  const [setor, setSetor] = useState<SetorKey>('Group')

  const porMes = useMemo(() => {
    const mapa = new Map<string, Agregado>()
    for (const l of linhas) {
      if (setor !== 'Group' && l.macro !== setor) continue
      const atual = mapa.get(l.mes) ?? { mes: l.mes, ...TOTAIS_VAZIO }
      mapa.set(l.mes, { mes: l.mes, ...somarCampos(atual, l) })
    }
    return Array.from(mapa.values()).sort((a, b) => a.mes.localeCompare(b.mes))
  }, [linhas, setor])

  const total = useMemo<Totais>(
    () => porMes.reduce((acc, l) => somarCampos(acc, l), TOTAIS_VAZIO),
    [porMes],
  )

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Setor">
          {SETORES.map(s => {
            const ativo = s.key === setor
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={ativo}
                onClick={() => setSetor(s.key)}
                className={`${PILL} ${ativo ? PILL_PRIMARIA : PILL_NEUTRO}`}
                style={ativo ? PILL_PRIMARIA_STYLE : undefined}
              >
                {s.display}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-zinc-400">
          Período analisado: {fmtDate(from)} – {fmtDate(to)}
        </p>
      </div>

      {linhas.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-5 py-8 shadow-sm">
          <p className="text-center text-sm text-zinc-500">
            Sem dados no período — rode a ingestão (Cron/backfill).
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-white px-5 py-4 shadow-sm">
          <ScrollAutoHide eixo="x">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className={`${TH_BASE} text-left`}>Mês</th>
                  <th className={`${TH_BASE} text-right`}>Fat. Upload</th>
                  <th className={`${TH_BASE} text-right`}>Fat. Monde</th>
                  <th className={`${TH_BASE} text-right`}>Δ Fat.</th>
                  <th className={`${TH_BASE} text-right`}>Rec. Upload</th>
                  <th className={`${TH_BASE} text-right`}>Rec. Monde</th>
                  <th className={`${TH_BASE} text-right`}>Δ Rec.</th>
                  <th className={`${TH_BASE} text-right`}>Vendas Upload</th>
                  <th className={`${TH_BASE} text-right`}>Vendas Monde</th>
                  <th className={`${TH_BASE} text-right`}>Δ Vendas</th>
                </tr>
              </thead>
              <tbody>
                {porMes.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-4 text-center text-sm text-zinc-500">
                      Sem dados para este setor no período.
                    </td>
                  </tr>
                ) : (
                  porMes.map((l, i) => (
                    <LinhaTabela key={l.mes} mes={l.mes} dado={l} zebra={i % 2 === 1} />
                  ))
                )}
                {porMes.length > 0 && <LinhaTabela mes="" dado={total} negrito />}
              </tbody>
            </table>
          </ScrollAutoHide>
        </div>
      )}
    </div>
  )
}
