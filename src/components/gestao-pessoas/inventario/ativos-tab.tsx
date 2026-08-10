'use client'

import { useMemo, useState } from 'react'
import { Package, Plus, Search, Download } from 'lucide-react'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import EmptyState from '@/components/shared/empty-state'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { Input, Select } from '@/components/ui/field'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import { fmtDate } from '@/lib/fmt'
import { StatusBadge } from './status-badge'
import { ROTULO_STATUS } from './derivar'
import type { AreaPatrimonio, AtivoLista, CategoriaPatrimonio, StatusAtivo } from './tipos'

// Aba "Ativos": tabela densa com busca livre, filtros e status DERIVADO. Receita de tabela
// densa da skill `tabela-densa`: border-separate + fundo/borda nas CÉLULAS + sticky no thead +
// sombra só quando rolado. A última coluna leva `pr-4` para o thumb do ScrollAutoHide (overlay,
// não reserva folga) não flutuar por cima do badge.

const STATUS_ORDEM: StatusAtivo[] = ['em_uso', 'em_estoque', 'em_manutencao', 'emprestado', 'baixado']

interface Props {
  ativos: AtivoLista[]
  categorias: CategoriaPatrimonio[]
  areas: AreaPatrimonio[]
  onAbrirFicha: (id: number) => void
  /** Ausente = a ação ainda não existe (M0) → o botão aparece DESABILITADO, não morto. */
  onNovoAtivo?: () => void
  onExportar?: () => void
}

export default function AtivosTab({ ativos, categorias, areas, onAbrirFicha, onNovoAtivo, onExportar }: Props) {
  const [busca, setBusca]         = useState('')
  const [fCategoria, setFCategoria] = useState('')
  const [fArea, setFArea]         = useState('')
  const [fStatus, setFStatus]     = useState('')
  const [rolado, setRolado]       = useState(false)

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return ativos.filter(a => {
      if (fCategoria && a.categoria_nome !== fCategoria) return false
      if (fArea && a.area_atual_nome !== fArea) return false
      if (fStatus && a.status !== fStatus) return false
      if (!q) return true
      return [a.codigo, a.descricao, a.numero_serie, a.detentor_atual_nome, a.area_atual_nome, a.local_atual_texto]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    })
  }, [ativos, busca, fCategoria, fArea, fStatus])

  return (
    <div>
      {/* Linha de filtros: busca + selects à esquerda, ação primária à direita. */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            variant="compacto"
            className="pl-8"
            type="search"
            placeholder="Buscar por código, item, série, pessoa…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            aria-label="Buscar ativos"
          />
        </div>
        <Select variant="compacto" className="w-auto" value={fCategoria} onChange={e => setFCategoria(e.target.value)} aria-label="Filtrar por categoria">
          <option value="">Categoria: todas</option>
          {categorias.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
        </Select>
        <Select variant="compacto" className="w-auto" value={fArea} onChange={e => setFArea(e.target.value)} aria-label="Filtrar por área">
          <option value="">Área: todas</option>
          {areas.map(a => <option key={a.id} value={a.nome}>{a.nome}</option>)}
        </Select>
        <Select variant="compacto" className="w-auto" value={fStatus} onChange={e => setFStatus(e.target.value)} aria-label="Filtrar por status">
          <option value="">Status: todos</option>
          {STATUS_ORDEM.map(s => <option key={s} value={s}>{ROTULO_STATUS[s]}</option>)}
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onExportar}
            disabled={!onExportar}
            title={onExportar ? undefined : 'Export entra na missão M5'}
            className={`${PILL} ${PILL_NEUTRO}`}
          >
            <Download size={13} /> Exportar CSV
          </button>
          <button
            type="button"
            onClick={onNovoAtivo}
            disabled={!onNovoAtivo}
            title={onNovoAtivo ? undefined : 'Formulário de cadastro entra na missão M3'}
            className={`${PILL} ${PILL_PRIMARIA}`}
            style={PILL_PRIMARIA_STYLE}
          >
            <Plus size={13} /> Novo ativo
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-white shadow-sm">
        {filtrados.length === 0 ? (
          <EmptyState icon={Package} message="Nenhum ativo encontrado com estes filtros." />
        ) : (
          <ScrollAutoHide
            eixo="y"
            className="max-h-[62vh]"
            onScroll={e => setRolado(e.currentTarget.scrollTop > 0)}
          >
            <table className="w-full text-sm table-fixed border-separate border-spacing-0">
              <thead
                className={`sticky top-0 z-20 [&_th]:bg-zinc-50 [&_tr:first-child_th:first-child]:rounded-tl-xl [&_tr:first-child_th:last-child]:rounded-tr-xl [&_tr:last-child_th]:border-b [&_tr:last-child_th]:border-zinc-200 ${rolado ? '[&_tr:last-child_th]:shadow-[0_6px_8px_-6px_rgba(28,25,23,0.22)]' : ''}`}
              >
                <tr className="text-left text-xs font-medium text-zinc-400">
                  <th className="py-2.5 px-3 w-[104px]">Código</th>
                  <th className="py-2.5 px-3">Item</th>
                  <th className="py-2.5 px-3 w-[140px]">Área</th>
                  <th className="py-2.5 px-3 w-[180px]">Com quem / onde</th>
                  <th className="py-2.5 px-3 w-[132px] text-right">Aquisição</th>
                  <th className="py-2.5 px-3 w-[104px]">Últ. mov.</th>
                  <th className="py-2.5 pl-3 pr-4 w-[136px]">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(a => (
                  <tr
                    key={a.id}
                    onClick={() => onAbrirFicha(a.id)}
                    className="cursor-pointer transition-colors hover:bg-[var(--surface-soft)] [&>td]:border-b [&>td]:border-zinc-50"
                  >
                    <td className="py-2.5 px-3">
                      <span className="tabular-nums text-xs font-medium text-zinc-600">{a.codigo}</span>
                    </td>
                    <td className="py-2.5 px-3 min-w-0">
                      <p className="truncate font-medium text-zinc-800" title={a.descricao}>{a.descricao}</p>
                      <p className="truncate text-2xs text-[var(--text-subtle)]">
                        {a.categoria_nome}{a.numero_serie ? ` · S/N ${a.numero_serie}` : ''}
                      </p>
                    </td>
                    <td className="py-2.5 px-3 truncate text-zinc-600">{a.area_atual_nome ?? '—'}</td>
                    <td className="py-2.5 px-3 truncate text-zinc-600" title={a.detentor_atual_nome ?? a.local_atual_texto ?? ''}>
                      {a.detentor_atual_nome ?? a.local_atual_texto ?? '—'}
                    </td>
                    <td className="py-2.5 px-3">
                      {a.valor_aquisicao != null
                        ? <ValorContabil valor={a.valor_aquisicao} />
                        : <span className="block text-right text-[var(--text-subtle)]">—</span>}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums text-xs text-[var(--text-muted)]">
                      {a.ultima_movimentacao_em ? fmtDate(a.ultima_movimentacao_em) : '—'}
                    </td>
                    <td className="py-2.5 pl-3 pr-4"><StatusBadge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollAutoHide>
        )}
      </div>

      <p className="mt-2.5 text-2xs text-[var(--text-subtle)]">
        {filtrados.length} de {ativos.length} ativos · clique numa linha para abrir a ficha e o histórico
      </p>
    </div>
  )
}
