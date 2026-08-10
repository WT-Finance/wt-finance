'use client'

import type { ReactNode } from 'react'
import { History, Clock3 } from 'lucide-react'
import ListDrawer from '@/components/shared/list-drawer'
import Button from '@/components/ui/button'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import { fmtBRL2, fmtDate, fmtDataHoraSP } from '@/lib/fmt'
import { StatusBadge, TipoBadge } from './status-badge'
import { ehRetroativa, ordenarCronologico, rotuloDestino, rotuloOrigem } from './derivar'
import type { AtivoLista, EstadoConservacao, Movimentacao } from './tipos'

// Ficha do ativo em DRAWER (padrão de drawer analítico, ADR-0092): grade de dados +
// timeline do razão. A origem de cada linha é DERIVADA da anterior na cadeia (invariante 2) —
// nunca lida de um campo. Tela de plataforma ⇒ tokens neutros, nunca var(--brand).

const ROTULO_ESTADO: Record<EstadoConservacao, string> = {
  novo: 'Novo', bom: 'Bom', regular: 'Regular', ruim: 'Ruim',
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-2xs font-semibold uppercase tracking-[0.5px] text-[var(--text-subtle)]">{rotulo}</p>
      <div className="mt-0.5 text-sm text-zinc-700 break-words">{children}</div>
    </div>
  )
}

const vazio = (v: string | null | undefined) => (v && v.trim() !== '' ? v : '—')

interface Props {
  ativo: AtivoLista
  historico: Movimentacao[]
  onFechar: () => void
  onMovimentar: () => void
  /** Ausentes = ação ainda não existe (M0) → botão DESABILITADO, não morto. */
  onEditar?: () => void
  onDuplicar?: () => void
}

export default function FichaDrawer({ ativo, historico, onFechar, onEditar, onMovimentar, onDuplicar }: Props) {
  // Ordena UMA vez em ordem cronológica (a ordem que a derivação de origem exige) e exibe
  // do mais recente para o mais antigo — o índice original é o que dá acesso ao anterior.
  const cronologico = ordenarCronologico(historico)
  const paraExibir = cronologico.map((m, i) => ({ mov: m, origem: rotuloOrigem(cronologico, i) })).reverse()

  const localAtual = ativo.local_atual_texto
    ?? [ativo.area_atual_nome, ativo.detentor_atual_nome].filter(Boolean).join(' / ')

  return (
    <ListDrawer titulo={ativo.codigo} subtitulo={ativo.descricao} onClose={onFechar}>
      {/* Ações do ativo. Baixado só aceita reativação — o botão continua, o modal é que restringe. */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button type="button" onClick={onMovimentar} className={`${PILL} ${PILL_PRIMARIA}`} style={PILL_PRIMARIA_STYLE}>
          {ativo.status === 'baixado' ? 'Reativar ativo' : 'Registrar movimentação'}
        </button>
        <button
          type="button" onClick={onEditar} disabled={!onEditar}
          title={onEditar ? undefined : 'Edição da ficha entra na missão M3'}
          className={`${PILL} ${PILL_NEUTRO}`}
        >
          Editar ficha
        </button>
        <button
          type="button" onClick={onDuplicar} disabled={!onDuplicar}
          title={onDuplicar ? undefined : 'Duplicar ativo entra na missão M3'}
          className={`${PILL} ${PILL_NEUTRO}`}
        >
          Duplicar ativo
        </button>
      </div>

      {/* Estado atual — DERIVADO da última movimentação, nunca lido de coluna do ativo. */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 mb-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusBadge status={ativo.status} />
          <span className="text-sm text-zinc-700">{localAtual || '—'}</span>
        </div>
        <p className="mt-1.5 text-2xs text-[var(--text-muted)]">
          {ativo.ultima_movimentacao_em
            ? `Situação apurada pela última movimentação, em ${fmtDate(ativo.ultima_movimentacao_em)}`
            : 'Sem movimentação registrada'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-4 mb-6">
        <Campo rotulo="Categoria">{ativo.categoria_nome}</Campo>
        <Campo rotulo="Estado de conservação">
          {ativo.estado_conservacao ? ROTULO_ESTADO[ativo.estado_conservacao] : '—'}
        </Campo>
        <Campo rotulo="Nº de série"><span className="tabular-nums">{vazio(ativo.numero_serie)}</span></Campo>
        <Campo rotulo="Nota fiscal"><span className="tabular-nums">{vazio(ativo.nota_fiscal)}</span></Campo>
        <Campo rotulo="Fornecedor">{vazio(ativo.fornecedor)}</Campo>
        <Campo rotulo="Data de aquisição">
          {ativo.data_aquisicao ? fmtDate(ativo.data_aquisicao) : '—'}
        </Campo>
        <Campo rotulo="Valor de aquisição">
          <span className="tabular-nums">
            {ativo.valor_aquisicao != null ? fmtBRL2(ativo.valor_aquisicao) : '—'}
          </span>
        </Campo>
        <div />
        {ativo.obs && (
          <div className="col-span-2">
            <Campo rotulo="Observações">{ativo.obs}</Campo>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mb-3 pt-4 border-t border-zinc-100">
        <History size={14} className="text-[var(--text-subtle)]" />
        <h3 className="text-2xs font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)]">
          Histórico de movimentações
        </h3>
        <span className="text-2xs text-[var(--text-subtle)]">({paraExibir.length})</span>
      </div>

      {/* Timeline. A régua vertical é uma borda no container; cada marcador é absoluto sobre ela. */}
      <ol className="relative ml-1.5 border-l border-zinc-200 pl-5 space-y-4">
        {paraExibir.map(({ mov, origem }) => (
          <li key={mov.id} className="relative">
            <span
              className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-zinc-300"
              style={{ boxShadow: '0 0 0 1px var(--border)' }}
            />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs tabular-nums text-[var(--text-muted)]">{fmtDate(mov.data_movimentacao)}</span>
              <TipoBadge tipo={mov.tipo} />
              {ehRetroativa(mov) && (
                <span
                  className="inline-flex items-center gap-1 text-3xs text-[var(--text-subtle)]"
                  title={`Registrado em ${fmtDataHoraSP(mov.criado_em)}, depois do fato`}
                >
                  <Clock3 size={11} /> registro retroativo
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-zinc-700">
              {origem && <span className="text-[var(--text-subtle)]">{origem} → </span>}
              {rotuloDestino(mov)}
            </p>
            {mov.obs && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{mov.obs}</p>}
            <p className="mt-0.5 text-3xs text-[var(--text-subtle)]">
              por {mov.registrado_por_rotulo} · {fmtDataHoraSP(mov.criado_em)}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-6 pt-4 border-t border-zinc-100">
        <Button variant="contorno" size="sm" onClick={onFechar}>Fechar</Button>
      </div>
    </ListDrawer>
  )
}
