import { Card } from '@/components/ui/card'
import { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { MESES } from '@/lib/dre/colunas-tabela'
import { SUF_PARCIAL } from '@/lib/dre/mes-parcial'
import { CENTROS, ROTULO_CENTRO, type CentroId } from '@/lib/dre-centro/centros'
import type { QuemCobreQuem as Dados } from '@/lib/dre-centro/atribuicao'

// ── Quem cobre quem (v6.5.1 — proposta do GATE 1) ────────────────────────────
// A posição acumulada no fim de cada mês: quanto os centros negativos consumiram (usos) e de
// onde veio esse caixa (fontes). Usos ≡ fontes por construção (teste em `atribuicao.test.ts`);
// o total das fontes é mostrado para a conferência ficar à vista. Tabela simples de card,
// padrão A (skill `tabela-densa`). Só na visão Lado a lado.

const TH_ESQ = `${CARD_TABELA_TH} text-left border-b border-zinc-100`
const TH_DIR = `${CARD_TABELA_TH} text-right border-b border-zinc-100`
const TD = 'px-3 py-2 text-xs border-b border-zinc-50 text-zinc-700'
const TD_TOTAL = 'px-3 py-2 text-xs font-semibold text-zinc-800 border-t border-zinc-200 bg-band-soft'
const TD_SECAO = 'px-3 pt-3 pb-1 text-2xs font-medium text-[var(--text-muted)]'
const COL_CONTA = 'sticky left-0 z-10 bg-white'

interface Linha {
  rotulo: string
  valores: number[]
  total?: boolean
}

const temValor = (v: number[], fim: number) => v.slice(0, fim).some(x => Math.abs(x) >= 0.005)

export default function QuemCobreQuem({ dados, fim, parcial, ano }: { dados: Dados; fim: number; parcial: boolean; ano: number }) {
  const porCentro = (r: Record<CentroId, number[]>, prefixo: string): Linha[] =>
    CENTROS.filter(c => temValor(r[c], fim)).map(c => ({ rotulo: `${prefixo}${ROTULO_CENTRO[c]}`, valores: r[c] }))

  const usos: Linha[] = [
    ...porCentro(dados.deficit, ''),
    { rotulo: 'Total dos usos', valores: dados.totalUsos, total: true },
  ]
  const fontes: Linha[] = [
    ...porCentro(dados.positivos, 'Saldo de '),
    ...porCentro(dados.recebiveisNaoVencidos, 'Recebíveis antecipados de '),
    { rotulo: '(−) Taxas de antecipação pagas', valores: dados.taxasPagas },
    { rotulo: 'Caixa que a empresa já tinha', valores: dados.caixaPrevio },
    { rotulo: 'Total das fontes', valores: dados.totalFontes, total: true },
  ]
  const meses = Array.from({ length: fim }, (_, i) => i)

  const secao = (titulo: string) => (
    <tr>
      <td className={`${TD_SECAO} ${COL_CONTA}`}>{titulo}</td>
      <td className={TD_SECAO} colSpan={fim} />
    </tr>
  )
  const linha = (l: Linha) => (
    <tr key={l.rotulo}>
      <td className={`${l.total ? TD_TOTAL : TD} ${COL_CONTA} ${l.total ? '!bg-band-soft' : ''}`}>
        <span className="block truncate" title={l.rotulo}>{l.rotulo}</span>
      </td>
      {meses.map(m => (
        <td key={m} className={l.total ? `${TD_TOTAL} text-right tabular-nums` : TD}>
          <ValorContabil valor={l.valores[m] ?? 0} />
        </td>
      ))}
    </tr>
  )

  return (
    <Card
      title="Quem cobre quem"
      subtitle={`Posição acumulada no fim de cada mês de ${ano} · usos = déficit dos centros negativos; fontes = de onde veio o caixa`}
    >
      <ScrollAutoHide eixo="x" className="pb-3.5">
        <table
          aria-label="Quem cobre quem — usos e fontes de caixa por mês"
          className="table-fixed border-separate border-spacing-0"
          style={{ minWidth: 260 + fim * 128 }}
        >
          <colgroup>
            <col style={{ width: 260 }} />
            {meses.map(m => <col key={m} style={{ width: 128 }} />)}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={`${TH_ESQ} ${COL_CONTA}`}>Posição no fim do mês</th>
              {meses.map(m => (
                <th key={m} scope="col" className={TH_DIR}>
                  {MESES[m]}{parcial && m === fim - 1 ? SUF_PARCIAL : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {secao('Usos — déficit acumulado dos centros com saldo operacional negativo')}
            {usos.map(linha)}
            {secao('Fontes')}
            {fontes.map(linha)}
          </tbody>
        </table>
      </ScrollAutoHide>
    </Card>
  )
}
