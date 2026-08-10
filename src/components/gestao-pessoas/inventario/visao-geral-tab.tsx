'use client'

import { useMemo } from 'react'
import { History } from 'lucide-react'
import Tooltip from '@/components/ui/tooltip'
import EmptyState from '@/components/shared/empty-state'
import { fmtBRL2, fmtDate } from '@/lib/fmt'
import { TipoBadge } from './status-badge'
import { ordenarCronologico, rotuloDestino, rotuloOrigem } from './derivar'
import type { AtivoLista, Movimentacao, ResumoInventario } from './tipos'

// Aba "Visão geral": contagens, distribuição por categoria e por área, e as últimas
// movimentações. Tela de plataforma ⇒ tokens neutros; barras em --action-soft-border
// (o Cool Gray institucional), nunca cor de setor nem var(--brand).

const AJUDA_CUSTO =
  'Soma do valor de aquisição dos ativos não baixados. Sem depreciação e sem relação com a ' +
  'contabilidade — nenhum número desta tela entra na DRE nem no Fluxo de Caixa.'

function Ajuda({ rotulo, texto }: { rotulo: string; texto: string }) {
  return (
    <Tooltip conteudo={texto} className="z-30 w-64 !whitespace-normal font-normal leading-snug">
      <button
        type="button"
        aria-label={`${rotulo}: ${texto}`}
        className="foco-neutro inline-flex h-3 w-3 items-center justify-center rounded-full border border-zinc-300 text-[8px] font-semibold leading-none text-zinc-400"
      >
        ?
      </button>
    </Tooltip>
  )
}

function Tile({ rotulo, valor, ajuda }: { rotulo: string; valor: string; ajuda?: string }) {
  return (
    <div className="rounded-xl bg-white shadow-sm px-5 py-4 h-full flex flex-col">
      <div className="flex items-center gap-1.5 min-h-8">
        <p className="text-2xs font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)] leading-[1.3]">
          {rotulo}
        </p>
        {ajuda && <Ajuda rotulo={rotulo} texto={ajuda} />}
      </div>
      <p className="mt-auto pt-1 font-extrabold tabular-nums leading-none text-zinc-800 whitespace-nowrap"
         style={{ fontSize: 'clamp(16px, 1.7vw, 26px)' }}>
        {valor}
      </p>
    </div>
  )
}

function PainelBarras({ titulo, dados }: { titulo: string; dados: { nome: string; n: number }[] }) {
  const max = Math.max(1, ...dados.map(d => d.n))
  return (
    <div className="rounded-xl bg-white shadow-sm">
      <h3 className="px-5 py-3 border-b border-zinc-100 text-2xs font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)]">
        {titulo}
      </h3>
      {dados.length === 0 ? (
        <EmptyState icon={History} message="Sem dados para exibir." />
      ) : (
        <div className="px-5 py-3 space-y-2">
          {dados.map(d => (
            <div key={d.nome} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0 truncate text-zinc-600" title={d.nome}>{d.nome}</span>
              <span className="flex-1 min-w-0">
                <span
                  className="block h-2 rounded-full"
                  style={{ width: `${Math.max(2, (d.n / max) * 100)}%`, background: 'var(--action-soft-border)' }}
                />
              </span>
              <span className="w-8 shrink-0 text-right text-xs tabular-nums text-[var(--text-muted)]">{d.n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  /** Agregados vindos de `patrimonio_resumo` — a MESMA derivação de estado que a lista usa.
   *  `null` = a leitura falhou; a faixa de contagens omite em vez de mostrar zeros falsos
   *  (invariante 14: seção degrada, página viva). */
  resumo: ResumoInventario | null
  ativos: AtivoLista[]
  movimentacoes: Movimentacao[]
  onAbrirFicha: (id: number) => void
}

export default function VisaoGeralTab({ resumo, ativos, movimentacoes, onAbrirFicha }: Props) {
  // Os números vêm do BANCO, não de uma segunda conta no cliente. Contar aqui a partir da
  // lista daria dois totais para a mesma coisa na mesma tela — e o dia em que discordassem
  // (filtro novo na RPC, teto de linhas) ninguém saberia qual dos dois está certo.
  // A igualdade `resumo` × agregação de `listar_ativos` é caso de contrato (rpc-contrato.test).
  const naoBaixados = resumo ? resumo.cadastrados - resumo.baixados : 0

  // Últimas movimentações: a origem de cada uma é derivada da cadeia DO SEU ATIVO.
  const recentes = useMemo(() => {
    const porAtivo = new Map<number, Movimentacao[]>()
    for (const m of movimentacoes) {
      const lista = porAtivo.get(m.ativo_id) ?? []
      lista.push(m)
      porAtivo.set(m.ativo_id, lista)
    }
    const comOrigem = [...porAtivo.values()].flatMap(lista => {
      const ord = ordenarCronologico(lista)
      return ord.map((mov, i) => ({ mov, origem: rotuloOrigem(ord, i) }))
    })
    return comOrigem
      .sort((a, b) => (a.mov.data_movimentacao === b.mov.data_movimentacao
        ? (a.mov.criado_em < b.mov.criado_em ? 1 : -1)
        : (a.mov.data_movimentacao < b.mov.data_movimentacao ? 1 : -1)))
      .slice(0, 8)
  }, [movimentacoes])

  const codigoDe = (m: Movimentacao) => m.ativo_codigo ?? ativos.find(a => a.id === m.ativo_id)?.codigo ?? '—'
  const descricaoDe = (m: Movimentacao) => m.ativo_descricao ?? ativos.find(a => a.id === m.ativo_id)?.descricao ?? ''

  return (
    <div className="space-y-5">
      {/* 6 contagens: as CINCO situações somam o total — sem "emprestados" a soma não fecharia. */}
      {resumo && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <Tile rotulo="Ativos cadastrados" valor={String(resumo.cadastrados)} />
          <Tile rotulo="Em uso"             valor={String(resumo.em_uso)} />
          <Tile rotulo="Em estoque"         valor={String(resumo.em_estoque)} />
          <Tile rotulo="Em manutenção"      valor={String(resumo.em_manutencao)} />
          <Tile rotulo="Emprestados"        valor={String(resumo.emprestados)} />
          <Tile rotulo="Baixados"           valor={String(resumo.baixados)} />
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-white shadow-sm px-5 py-4">
          <div className="flex items-center gap-1.5">
            <p className="text-2xs font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)]">
              Custo histórico de aquisição
            </p>
            <Ajuda rotulo="Custo histórico de aquisição" texto={AJUDA_CUSTO} />
          </div>
          <p className="mt-2 text-2xl font-extrabold tabular-nums leading-none text-zinc-800">
            {resumo ? fmtBRL2(resumo.custo_historico_aquisicao) : '—'}
          </p>
          <p className="mt-1.5 text-2xs text-[var(--text-subtle)]">
            {resumo
              ? `${naoBaixados} ativos não baixados${
                  resumo.sem_valor > 0 ? ` · ${resumo.sem_valor} sem valor informado (fora do total)` : ''
                }`
              : 'Não foi possível carregar os agregados.'}
          </p>
        </div>
        <div className="rounded-xl bg-white shadow-sm px-5 py-4 flex flex-col justify-center">
          <p className="text-sm text-zinc-600">
            O inventário registra <strong className="font-semibold">onde cada equipamento está e com quem</strong>,
            com histórico completo. Não calcula depreciação e não conversa com a contabilidade.
          </p>
        </div>
      </div>

      {/* Barras dos NÃO-BAIXADOS, agrupadas no SQL (o resumo já devolve ordenado por volume). */}
      <div className="grid gap-3 md:grid-cols-2">
        <PainelBarras titulo="Ativos por categoria" dados={resumo?.por_categoria ?? []} />
        <PainelBarras titulo="Ativos por área"      dados={resumo?.por_area ?? []} />
      </div>

      <div className="rounded-xl bg-white shadow-sm">
        <h3 className="px-5 py-3 border-b border-zinc-100 text-2xs font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)]">
          Últimas movimentações
        </h3>
        {recentes.length === 0 ? (
          <EmptyState icon={History} message="Nenhuma movimentação registrada ainda." />
        ) : (
          <table className="w-full text-sm table-fixed border-separate border-spacing-0">
            <tbody>
              {recentes.map(({ mov, origem }) => (
                <tr
                  key={mov.id}
                  onClick={() => onAbrirFicha(mov.ativo_id)}
                  className="cursor-pointer transition-colors hover:bg-[var(--surface-soft)] [&>td]:border-b [&>td]:border-zinc-50 last:[&>td]:border-b-0"
                >
                  <td className="py-2.5 px-5 w-[104px] text-xs tabular-nums text-[var(--text-muted)]">
                    {fmtDate(mov.data_movimentacao)}
                  </td>
                  <td className="py-2.5 px-3 w-[96px] text-xs font-medium tabular-nums text-zinc-600">
                    {codigoDe(mov)}
                  </td>
                  <td className="py-2.5 px-3 truncate text-zinc-700" title={descricaoDe(mov)}>
                    {descricaoDe(mov)}
                  </td>
                  <td className="py-2.5 px-3 w-[184px]"><TipoBadge tipo={mov.tipo} /></td>
                  <td className="py-2.5 pl-3 pr-5 truncate text-zinc-600">
                    {origem && <span className="text-[var(--text-subtle)]">{origem} → </span>}
                    {rotuloDestino(mov)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
