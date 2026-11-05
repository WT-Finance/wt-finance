'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Users } from 'lucide-react'
import CabecalhoCard from '@/components/shared/cabecalho-card'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import ListDrawer from '@/components/shared/list-drawer'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { Card } from '@/components/ui/card'
import { fmtPct } from '@/lib/marketing/formatar'
import { rotuloAnos } from '@/lib/marketing/periodo'
import { pctDe } from '@/lib/financeiro-geral/numeros'
import { LINHAS_CARD_PESSOAS, tabelaPorPessoa, type TabelaPessoas } from '@/lib/financeiro-geral/prejuizos'
import type { Prejuizos } from '@/lib/financeiro-geral/schemas'
import type { LeituraAno } from '@/lib/financeiro-geral/tipos'
import { TD, TD_NUM, TD_TOTAL, TH_DIR, TH_ESQ } from './comum'

// Card "Prejuízo por Pessoa" (v6.5.0): UMA tabela que SOMA os anos selecionados nas pills da seção que carregaram
// (decisão do Yan, GATE 1) — só ele e o futuro "Prejuízo por Setor" leem as pills; o gráfico mensal é fixo. Sem subtítulo — o "?" do cabeçalho diz o recorte (bruto, regime de caixa, de onde vem a
// pessoa, ano parcial com *). O card mostra as 5 primeiras pessoas + a linha de Total de TODAS e o "Ver mais",
// que abre o drawer com a lista completa — o mesmo desenho de "Maiores Inadimplentes" (`recebiveis-devedores`).
// Ano que falhou fica fora da soma e é avisado sob a tabela — nunca somado calado só com o que chegou. As contas
// (soma por pessoa, ordem, corte, %, `fecha`) são de `prejuizos.ts` (`tabelaPorPessoa`); aqui só se desenha.
//
// "(sem pessoa)" fica visível (inv. 4), em itálico e tom discreto — o mesmo tratamento de "(sem fornecedor)"
// em Marketing. Valores no sinal da DRE (prejuízo negativo); a % é positiva (negativo ÷ negativo).
//
// Tabela no padrão A (cartão-tabela, `comum.tsx`). Largura estreita: a tabela tem largura mínima e rola
// POR DENTRO do card (`ScrollAutoHide eixo="x"`, gutter `pb-3.5` para o thumb overlay), nunca a página.

/** Largura mínima da tabela: abaixo disso ela rola por dentro do card em vez de espremer a 1ª coluna. */
const LARGURA_MIN = 480

const TITULO = 'Prejuízo por Pessoa'

/** Defesa: se algum dia Σ pessoas não fechar com o total de prejuízos do período, a tela diz. */
function AvisoNaoFecha() {
  return (
    <ErroCarregamento
      className="mt-3"
      mensagem="A soma por pessoa não fecha com o total de prejuízos do período — avise quem mantém a página."
    />
  )
}

function TabelaDasPessoas({ tabela }: { tabela: TabelaPessoas }) {
  const pctTotal = pctDe(tabela.total.valor, tabela.total.valor)
  return (
    <ScrollAutoHide eixo="x" className="pb-3.5">
      <table
        aria-label={TITULO}
        className="w-full table-fixed border-separate border-spacing-0"
        style={{ minWidth: LARGURA_MIN }}
      >
        <colgroup>
          <col />
          <col style={{ width: 96 }} />
          <col style={{ width: 148 }} />
          <col style={{ width: 72 }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={TH_ESQ}>Pessoa</th>
            <th scope="col" className={TH_DIR}>Lançamentos</th>
            <th scope="col" className={TH_DIR}>Valor</th>
            <th scope="col" className={TH_DIR}>%</th>
          </tr>
        </thead>
        <tbody>
          {tabela.linhas.map(l => (
            <tr key={l.posicao}>
              <td className={TD}>
                <span
                  className={`block truncate ${l.semPessoa ? 'italic text-[var(--text-muted)]' : ''}`}
                  title={l.pessoa}
                >
                  {l.pessoa}
                </span>
              </td>
              <td className={TD_NUM}>{l.n}</td>
              <td className={TD}><ValorContabil valor={l.valor} /></td>
              <td className={TD_NUM}>{fmtPct(l.pct)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className={TD_TOTAL}>Total</td>
            <td className={`${TD_TOTAL} text-right tabular-nums`}>{tabela.total.n}</td>
            <td className={TD_TOTAL}><ValorContabil valor={tabela.total.valor} /></td>
            <td className={`${TD_TOTAL} text-right tabular-nums`}>{fmtPct(pctTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </ScrollAutoHide>
  )
}

export default function PrejuizosTabelaPessoa({
  leituras, ajuda,
}: {
  leituras: LeituraAno<Prejuizos>[]
  /** O "?" do cabeçalho (`GatilhoAjuda`), montado pela seção. */
  ajuda?: ReactNode
}) {
  const [aberto, setAberto] = useState(false)
  const card = useMemo(() => tabelaPorPessoa(leituras, LINHAS_CARD_PESSOAS), [leituras])
  // A lista completa só é montada com o drawer aberto.
  const completa = useMemo(() => (aberto ? tabelaPorPessoa(leituras) : null), [aberto, leituras])

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CabecalhoCard titulo={TITULO} ajuda={ajuda} />

      {card.anos.length === 0 ? (
        // Nenhum ano carregou: o aviso abaixo (anos fora da soma) seria só metade da história — e "sem
        // prejuízos" seria falso. Cada card falha sozinho: o gráfico mensal tem as próprias leituras.
        <ErroCarregamento mensagem={`Não foi possível carregar os prejuízos de ${rotuloAnos(card.anosFalha)} — recarregue a página.`} />
      ) : card.linhas.length === 0 ? (
        <EmptyState icon={Users} message={`Sem prejuízos registrados em ${rotuloAnos(card.anos)}.`} />
      ) : (
        <TabelaDasPessoas tabela={card} />
      )}

      {card.anos.length > 0 && card.anosFalha.length > 0 && (
        <ErroCarregamento
          className="mt-3"
          mensagem={`Não foi possível carregar ${rotuloAnos(card.anosFalha)}; fora da soma.`}
        />
      )}
      {!card.fecha && <AvisoNaoFecha />}

      {card.temMais && (
        <div className="mt-auto border-t border-zinc-100 pt-1">
          <button
            type="button"
            onClick={() => setAberto(true)}
            className="card-tabela-vermais w-full py-1.5 text-xs font-medium"
          >
            Ver mais
          </button>
        </div>
      )}

      {completa && (
        <ListDrawer titulo={TITULO} onClose={() => setAberto(false)}>
          <TabelaDasPessoas tabela={completa} />
          {completa.anosFalha.length > 0 && (
            <ErroCarregamento
              className="mt-3"
              mensagem={`Não foi possível carregar ${rotuloAnos(completa.anosFalha)}; fora da soma.`}
            />
          )}
          {!completa.fecha && <AvisoNaoFecha />}
        </ListDrawer>
      )}
    </Card>
  )
}
