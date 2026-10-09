'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { anoAnteriorDisponivel, calcularIndicadores } from '@/lib/marketing/indicadores'
import { mesLimite, recortePadrao } from '@/lib/marketing/periodo'
import type { DadosGastosMarketing } from '@/lib/marketing/tipos'
import CabecalhoGastos from './cabecalho-gastos'
import FiltroGlobal from './filtro-global'
import IndicadoresGastos from './indicadores-gastos'
import LancamentosTabela from './lancamentos-tabela'
import RankingFornecedores from './ranking-fornecedores'
import SerieMensal from './serie-mensal'
import TabelaCategorias from './tabela-categorias'

// Container client da página "Despesas de Marketing" (v6.3.0). O servidor entrega o dado do ANO
// (cada leitura pode falhar sozinha — `Carregado`); aqui mora só o filtro de fornecedor, que é
// estado de tela:
//
//  • ANO     → URL (`?ano=`): cada ano é uma ida às RPCs, então o ano é navegação
//              (`startTransition` + `scroll: false` — filtro no LUGAR, sem salto ao topo, com o
//              conteúdo esmaecido enquanto o servidor responde). A página põe `key={ano}`.
//  • MESES   → NÃO são estado: o recorte é sempre `recortePadrao(ano, hoje)` (ano fechado =
//              jan–dez; ano corrente = jan até o mês corrente), derivado do ano e do `hoje` do
//              servidor.
//  • FORNECEDOR (ranking E → tabela F) → estado local compartilhado aqui; clicar leva a tela
//              até a tabela filtrada.
//
// Todos os cards leem o MESMO `recorte`.

export default function GastosContent({ dados }: { dados: DadosGastosMarketing }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const { ano, hoje, anosDisponiveis } = dados
  const limiteMes = mesLimite(ano, hoje)
  // Memoizado: a identidade do recorte entra nas dependências dos `useMemo` dos cards.
  const recorte = useMemo(() => recortePadrao(ano, hoje), [ano, hoje])
  const [fornecedor, setFornecedor] = useState<string | null>(null)
  const ancoraLancamentos = useRef<HTMLDivElement>(null)

  const resumo = dados.resumo.ok ? dados.resumo.dados : null
  const anterior = dados.resumoAnterior.ok ? dados.resumoAnterior.dados : null
  // Ano anterior fora da base (a base começa em 2024): ausência de dado, não zero — "—" e sem linha.
  const anteriorSemHistorico = !anoAnteriorDisponivel(ano, anosDisponiveis)
  const fornecedores = dados.fornecedores.ok ? dados.fornecedores.dados : null
  const lancamentos = dados.lancamentos.ok ? dados.lancamentos.dados : null

  const indicadores = useMemo(
    () => (resumo
      ? calcularIndicadores({
          ano, hoje, recorte,
          atual: resumo.porMesCategoria,
          anterior: anterior ? anterior.porMesCategoria : null,
          anosDisponiveis,
        })
      : null),
    [ano, hoje, recorte, resumo, anterior, anosDisponiveis],
  )

  function irParaAno(novo: number) {
    // Preserva o resto da query e troca só o ano.
    const params = new URLSearchParams(searchParams.toString())
    params.set('ano', String(novo))
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
  }

  function aoSelecionarFornecedor(chave: string | null) {
    setFornecedor(chave)
    // O ranking fica longe da tabela que ele filtra: ao escolher, leva a tela até ela.
    if (chave !== null) ancoraLancamentos.current?.scrollIntoView({ block: 'start' })
  }

  return (
    <div className="space-y-6" aria-busy={isPending}>
      <CabecalhoGastos resumo={resumo} />

      <div className={`space-y-6 transition-opacity ${isPending ? 'pointer-events-none opacity-60' : ''}`}>
        <FiltroGlobal ano={ano} anos={anosDisponiveis} onAno={irParaAno} />

        <IndicadoresGastos
          ano={ano}
          recorte={recorte}
          ind={indicadores}
          anteriorFalhou={!dados.resumoAnterior.ok}
        />

        <SerieMensal
          ano={ano}
          recorte={recorte}
          limiteMes={limiteMes}
          resumo={resumo}
          anterior={anterior}
          anteriorSemHistorico={anteriorSemHistorico}
        />

        <TabelaCategorias ano={ano} recorte={recorte} resumo={resumo} />

        <RankingFornecedores
          ano={ano}
          recorte={recorte}
          fornecedores={fornecedores}
          selecionado={fornecedor}
          onSelecionar={aoSelecionarFornecedor}
        />

        <div ref={ancoraLancamentos}>
          <LancamentosTabela
            ano={ano}
            recorte={recorte}
            lancamentos={lancamentos}
            fornecedor={fornecedor}
            onFornecedor={setFornecedor}
          />
        </div>
      </div>
    </div>
  )
}
