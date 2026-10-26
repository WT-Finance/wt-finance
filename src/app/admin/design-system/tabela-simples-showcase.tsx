import CabecalhoCard from '@/components/shared/cabecalho-card'
import { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { Card } from '@/components/ui/card'

// Exemplo VIVO da "tabela simples" (v6.5.0, padrão A) da seção "7. Tabelas e Listas" do Design System.
// As classes de célula abaixo são a CÓPIA, byte a byte, das de `src/components/financeiro/geral/comum.tsx`
// (`TH_ESQ`/`TH_DIR`/`TD`/`TD_NUM`/`TD_TOTAL`) — a página do DS não importa componente de feature, então
// o exemplo as escreve aqui. Mudou lá, mude aqui. Dados FICTÍCIOS (nenhum nome real).

const TH_ESQ = `${CARD_TABELA_TH} text-left border-b border-zinc-100`
const TH_DIR = `${CARD_TABELA_TH} text-right border-b border-zinc-100`
const TD = 'px-3 py-2 text-xs border-b border-zinc-50 text-zinc-700'
const TD_NUM = `${TD} tabular-nums text-right`
const TD_TOTAL = 'px-3 py-2 text-xs font-semibold text-zinc-800 border-t border-zinc-200 bg-band-soft'

const LINHAS = [
  { conta: 'Conta Alfa', n: 12, valor: 48250.4, pct: '52,3%' },
  { conta: 'Conta Beta', n: 7, valor: 21980, pct: '23,8%' },
  { conta: '(sem conta)', n: 2, valor: 9100.15, pct: '9,9%', semNome: true },
] as const
const DEMAIS = { rotulo: 'demais 3 contas', n: 5, valor: 12940.05, pct: '14,0%' }
const TOTAL = { n: 26, valor: 92270.6, pct: '100,0%' }

export default function TabelaSimplesShowcase() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div>
        <p className="mb-2 text-xs text-[var(--text-muted)]">
          Com dados — linhas, <strong>“demais N”</strong> em itálico e tom discreto, linha de <strong>Total</strong> (valores fictícios)
        </p>
        <Card className="min-w-0">
          <CabecalhoCard titulo="Volume por conta" subtitulo="Soma de 2025 + 2026 · regime de caixa" />
          <ScrollAutoHide eixo="x" className="pb-3.5">
            <table
              aria-label="Volume por conta (exemplo)"
              className="w-full table-fixed border-separate border-spacing-0"
              style={{ minWidth: 440 }}
            >
              <colgroup>
                <col />
                <col style={{ width: 56 }} />
                <col style={{ width: 148 }} />
                <col style={{ width: 72 }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className={TH_ESQ}>Conta</th>
                  <th scope="col" className={TH_DIR}>Nº</th>
                  <th scope="col" className={TH_DIR}>Volume</th>
                  <th scope="col" className={TH_DIR}>%</th>
                </tr>
              </thead>
              <tbody>
                {LINHAS.map(l => (
                  <tr key={l.conta}>
                    <td className={TD}>
                      <span
                        className={`block truncate ${'semNome' in l ? 'italic text-[var(--text-muted)]' : ''}`}
                        title={l.conta}
                      >
                        {l.conta}
                      </span>
                    </td>
                    <td className={TD_NUM}>{l.n}</td>
                    <td className={TD}><ValorContabil valor={l.valor} /></td>
                    <td className={TD_NUM}>{l.pct}</td>
                  </tr>
                ))}
                <tr>
                  <td className={TD}>
                    <span className="block truncate italic text-[var(--text-muted)]" title={DEMAIS.rotulo}>{DEMAIS.rotulo}</span>
                  </td>
                  <td className={TD_NUM}>{DEMAIS.n}</td>
                  <td className={TD}><ValorContabil valor={DEMAIS.valor} /></td>
                  <td className={TD_NUM}>{DEMAIS.pct}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td className={TD_TOTAL}>Total</td>
                  <td className={`${TD_TOTAL} text-right tabular-nums`}>{TOTAL.n}</td>
                  <td className={TD_TOTAL}><ValorContabil valor={TOTAL.valor} /></td>
                  <td className={`${TD_TOTAL} text-right tabular-nums`}>{TOTAL.pct}</td>
                </tr>
              </tfoot>
            </table>
          </ScrollAutoHide>
        </Card>
      </div>

      <div>
        <p className="mb-2 text-xs text-[var(--text-muted)]">
          Sem dados — o card mantém título e subtítulo; no lugar da tabela entra uma frase que diz o porquê
        </p>
        <Card className="min-w-0">
          <CabecalhoCard titulo="Volume por conta" subtitulo="2026 · regime de caixa" />
          <p className="py-6 text-center text-sm text-[var(--text-muted)]">Sem antecipações em 2026.</p>
        </Card>
      </div>
    </div>
  )
}
