'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Loader2, Receipt, Search } from 'lucide-react'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { ValorContabil } from '@/components/shared/valor-contabil'
import Button from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/field'
import { fmtBRL2, fmtDate, hojeSP } from '@/lib/fmt'
import { lancamentosDoRecorte, rotuloFornecedor, chaveFornecedor, somar } from '@/lib/marketing/agregacao'
import { montarExportacaoMarketing, nomeArquivoExportacaoMarketing } from '@/lib/marketing/exportar'
import {
  ORDENACAO_PADRAO, alternarOrdenacao, categoriasDe, filtrarLancamentos,
  fornecedoresDe, haFiltro, ordenarLancamentos, type ColunaLancamento, type Ordenacao,
} from '@/lib/marketing/lancamentos'
import { rotuloRecorteAno, type Recorte } from '@/lib/marketing/periodo'
import type { LancamentoMkt } from '@/lib/marketing/tipos'
import CabecalhoCard from './cabecalho-card'

// Componente F — lançamentos do recorte. Colunas (lista FECHADA): data de movimentação,
// categoria, fornecedor, descrição, nº do documento e valor. Nada de conta bancária/cartão.
//
// Tudo no CLIENTE sobre a lista do ano: filtro por categoria e fornecedor, busca na DESCRIÇÃO,
// ordenação por coluna. Sem paginação, então o total do rodapé é o de TODAS as linhas filtradas —
// não o de uma página.
//
// Tabela longa com scroll interno e cabeçalho sticky (skill `tabela-densa`): `border-separate
// border-spacing-0`, fundo opaco nas células do <thead>, bordas por célula, sombra só quando
// rolado e cantos arredondados. É a exceção de `min-w` (3 colunas de texto livre) com
// `ScrollAutoHide eixo="both"`; o rodapé fica FORA da região rolável.

const COLUNAS: { id: ColunaLancamento; rotulo: string; direita?: boolean; largura?: number }[] = [
  { id: 'data',       rotulo: 'Data',      largura: 108 },
  { id: 'categoria',  rotulo: 'Categoria', largura: 208 },
  { id: 'fornecedor', rotulo: 'Fornecedor', largura: 200 },
  { id: 'descricao',  rotulo: 'Descrição' },
  { id: 'documento',  rotulo: 'Nº do documento', largura: 152 },
  { id: 'valor',      rotulo: 'Valor', direita: true, largura: 156 },
]
const LARGURA_MIN = 1064

const TD = 'border-b border-zinc-50 px-3 py-2 text-xs text-zinc-700'

function IconeOrdem({ ativa, direcao }: { ativa: boolean; direcao: 'asc' | 'desc' }) {
  if (!ativa) return <ChevronsUpDown size={12} className="text-zinc-300" aria-hidden />
  return direcao === 'asc'
    ? <ArrowUp size={12} className="text-zinc-600" aria-hidden />
    : <ArrowDown size={12} className="text-zinc-600" aria-hidden />
}

function Linha({ l }: { l: LancamentoMkt }) {
  const semFornecedor = chaveFornecedor(l.fornecedor) === ''
  const estorno = l.valor > 0
  return (
    <tr>
      <td className={`${TD} tabular-nums text-[var(--text-muted)]`}>{fmtDate(l.data)}</td>
      <td className={TD}><span className="block truncate" title={l.categoria}>{l.categoria}</span></td>
      <td className={TD}>
        <span
          className={`block truncate ${semFornecedor ? 'italic text-[var(--text-muted)]' : ''}`}
          title={rotuloFornecedor(chaveFornecedor(l.fornecedor))}
        >
          {rotuloFornecedor(chaveFornecedor(l.fornecedor))}
        </span>
      </td>
      <td className={TD}>
        <span className="block truncate" title={l.descricao ?? undefined}>{l.descricao ?? '—'}</span>
      </td>
      <td className={`${TD} tabular-nums text-[var(--text-muted)]`}>
        <span className="block truncate" title={l.documento ?? undefined}>{l.documento ?? '—'}</span>
      </td>
      {/* Estorno (positivo) reduz a despesa: o número fica em verde e o title explica. */}
      <td className={TD} title={estorno ? 'Estorno — reduz a despesa' : undefined}>
        <ValorContabil valor={l.valor} className={estorno ? 'text-success' : undefined} />
      </td>
    </tr>
  )
}

interface Props {
  ano: number
  recorte: Recorte
  /** `null` = a leitura da lista falhou. */
  lancamentos: LancamentoMkt[] | null
  /** Filtro de fornecedor (chave; '' = sem fornecedor) — compartilhado com o ranking. */
  fornecedor: string | null
  onFornecedor: (chave: string | null) => void
}

export default function LancamentosTabela({ ano, recorte, lancamentos, fornecedor, onFornecedor }: Props) {
  const [categoria, setCategoria] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordenacao>(ORDENACAO_PADRAO)
  const [rolado, setRolado] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [erroExportar, setErroExportar] = useState(false)

  const doRecorte = useMemo(
    () => (lancamentos ? lancamentosDoRecorte(lancamentos, recorte) : []),
    [lancamentos, recorte],
  )
  const filtro = useMemo(() => ({ categoria, fornecedor, busca }), [categoria, fornecedor, busca])
  const linhas = useMemo(
    () => ordenarLancamentos(filtrarLancamentos(doRecorte, filtro), ordem),
    [doRecorte, filtro, ordem],
  )
  const totalFiltrado = useMemo(() => somar(linhas.map(l => l.valor)), [linhas])
  const categorias = useMemo(() => categoriasDe(doRecorte), [doRecorte])
  const fornecedores = useMemo(() => {
    const base = fornecedoresDe(doRecorte)
    // Filtro vindo do ranking que o recorte atual deixou sem linha: mantém a opção, para o
    // select continuar coerente com o filtro ativo (e dar para limpá-lo).
    if (fornecedor !== null && !base.some(f => f.chave === fornecedor)) {
      return [...base, { chave: fornecedor, rotulo: rotuloFornecedor(fornecedor) }]
    }
    return base
  }, [doRecorte, fornecedor])

  const periodo = rotuloRecorteAno(recorte, ano)

  if (!lancamentos) {
    return (
      <Card>
        <CabecalhoCard titulo="Lançamentos" />
        <ErroCarregamento mensagem="Não foi possível carregar os lançamentos." />
      </Card>
    )
  }
  if (doRecorte.length === 0) {
    return (
      <Card>
        <CabecalhoCard titulo="Lançamentos" subtitulo={`${periodo} · pago · data de movimentação`} />
        <EmptyState icon={Receipt} message={`Sem lançamentos pagos em ${periodo}.`} />
      </Card>
    )
  }

  const comFiltro = haFiltro(filtro)
  const limparFiltros = () => { setCategoria(null); setBusca(''); onFornecedor(null) }

  // Exportar para Excel (v6.3.0): a planilha leva EXATAMENTE `linhas` — a lista que o render
  // acima mapeia (recorte + filtros + ordenação vigentes no clique) —, nunca uma refiltragem.
  // A lib de planilha entra por import dinâmico no clique, fora do bundle inicial (molde do DRE).
  async function exportarExcel() {
    if (exportando) return
    setExportando(true)
    setErroExportar(false)
    try {
      const XLSX = await import('@e965/xlsx')
      const geradoEm = hojeSP()
      const exportacao = montarExportacaoMarketing({ ano, recorte, linhas, filtrado: comFiltro, geradoEm })
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(exportacao.linhas)
      ws['!cols'] = exportacao.larguras.map(wch => ({ wch }))
      XLSX.utils.book_append_sheet(wb, ws, exportacao.nome)
      XLSX.writeFile(wb, nomeArquivoExportacaoMarketing(ano, recorte))
    } catch (err) {
      console.error('[Marketing exportar]', err)
      setErroExportar(true)
    } finally {
      setExportando(false)
    }
  }

  return (
    <Card>
      <CabecalhoCard
        titulo="Lançamentos"
        subtitulo={`${periodo} · pago · data de movimentação`}
        // `disabled` só enquanto gera (impede o duplo clique; o spinner mantém o rótulo). O erro é
        // um aviso discreto ao lado, sem quebrar a tela; a causa vai para o console.error.
        acao={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            {erroExportar && (
              <span role="alert" className="text-2xs text-danger">
                Não foi possível gerar a planilha — tente de novo.
              </span>
            )}
            <Button
              variant="contorno"
              size="sm"
              onClick={exportarExcel}
              disabled={exportando}
              title={comFiltro
                ? 'Baixar em Excel os lançamentos filtrados, na ordem da tabela'
                : 'Baixar em Excel os lançamentos do recorte, na ordem da tabela'}
              className="inline-flex items-center gap-1.5"
            >
              {exportando ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Download size={14} aria-hidden />}
              Exportar
            </Button>
          </div>
        )}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden />
          <Input
            variant="compacto"
            type="search"
            name="busca-descricao"
            autoComplete="off"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar na descrição…"
            aria-label="Buscar na descrição"
            className="w-56 max-w-full pl-8"
          />
        </div>
        <Select
          variant="compacto"
          aria-label="Filtrar por categoria"
          value={categoria ?? ''}
          onChange={e => setCategoria(e.target.value === '' ? null : e.target.value)}
          className="max-w-[220px]"
        >
          <option value="">Todas as categorias</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select
          variant="compacto"
          aria-label="Filtrar por fornecedor"
          value={fornecedor === null ? '' : `f:${fornecedor}`}
          onChange={e => onFornecedor(e.target.value === '' ? null : e.target.value.slice(2))}
          className="max-w-[220px]"
        >
          <option value="">Todos os fornecedores</option>
          {fornecedores.map(f => <option key={f.chave === '' ? '__sem__' : f.chave} value={`f:${f.chave}`}>{f.rotulo}</option>)}
        </Select>
        {comFiltro && <Button variant="ghost" onClick={limparFiltros}>Limpar filtros</Button>}
      </div>

      <div className="pr-1.5 pb-1.5">
        <ScrollAutoHide
          eixo="both"
          className="max-h-[520px] pb-3.5 pr-3.5"
          onScroll={e => setRolado(e.currentTarget.scrollTop > 0)}
        >
          <table className="w-full table-fixed border-separate border-spacing-0" style={{ minWidth: LARGURA_MIN }}>
            <colgroup>
              {COLUNAS.map(c => <col key={c.id} style={c.largura ? { width: c.largura } : undefined} />)}
            </colgroup>
            <thead
              className={`sticky top-0 z-20 [&_th]:bg-zinc-50 [&_th]:border-b [&_th]:border-zinc-200 [&_th:first-child]:rounded-tl-lg [&_th:last-child]:rounded-tr-lg ${rolado ? '[&_th]:shadow-[0_2px_4px_-2px_rgba(0,0,0,0.12)]' : ''}`}
            >
              <tr>
                {COLUNAS.map(c => {
                  const ativa = ordem.coluna === c.id
                  return (
                    <th
                      key={c.id}
                      scope="col"
                      aria-sort={ativa ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className={CARD_TABELA_TH}
                    >
                      <button
                        type="button"
                        onClick={() => setOrdem(alternarOrdenacao(ordem, c.id))}
                        title={`Ordenar por ${c.rotulo.toLowerCase()}`}
                        className={`foco-neutro inline-flex w-full items-center gap-1 ${c.direita ? 'justify-end' : 'justify-start'}`}
                      >
                        {c.rotulo}
                        <IconeOrdem ativa={ativa} direcao={ordem.direcao} />
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {linhas.map(l => <Linha key={l.id} l={l} />)}
            </tbody>
          </table>
          {linhas.length === 0 && (
            <EmptyState icon={Search} message="Nenhum lançamento com esses filtros." />
          )}
        </ScrollAutoHide>
      </div>

      {/* Rodapé FORA da região rolável: o total é de TODAS as linhas filtradas. */}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-zinc-100 pt-3 text-xs text-[var(--text-muted)]">
        <span>
          {comFiltro
            ? `${linhas.length} de ${doRecorte.length} lançamentos`
            : `${doRecorte.length} ${doRecorte.length === 1 ? 'lançamento' : 'lançamentos'}`}
        </span>
        <span className="tabular-nums">
          {comFiltro ? 'Total filtrado' : 'Total'}{' '}
          <strong className="font-semibold text-zinc-800">{fmtBRL2(totalFiltrado)}</strong>
        </span>
      </div>
    </Card>
  )
}
