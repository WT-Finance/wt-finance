'use client'

// =============================================================================
// Editor REAL da estrutura viva da DRE (v5.3.0 · M5) — sucessor de editor-dre-mockup.tsx
// (removido nesta versão). Mesma UI/interações do mockup (boxes em card, banda
// `bg-band-soft` nos headers, âncoras ESCURAS `bg-action-primary`, setas ↑/↓, MoverModal
// com efeito nos subtotais, excluir/reincluir, bandeja, barra sticky de pendências),
// agora ligada às RPCs reais (`dre_estrutura`/`dre_estrutura_salvar`, 0204-0208) pelo MESMO
// padrão do Cadastro de Metas: edição LOCAL + SALVAR EM LOTE, com `baseline`/`pendentes` e
// re-hidratação por comparação de TOKEN (trava otimista) — nada de useEffect fazendo
// setState (react-hooks v7): o re-sync pós-`router.refresh()` é "ajustado durante a
// renderização".
//
// Chaves DETERMINÍSTICAS por `categoria_id` (estável — nomes podem colidir/mudar; o id não).
//
// `dre_estrutura_salvar` NÃO grava `nota_estrela` (só bloco_chave/ordem/excluida) — a estrela
// é só EXIBIDA aqui (herdada do bloco/categoria carregados), nunca editável por este payload;
// isso já era assim no mockup (sem affordance para alterá-la).
//
// Discriminante bloco-com-caixa × bloco-âncora: `formula === null` (não `cats.length > 0`
// do mockup) — mais robusto a um bloco esvaziado dinamicamente pelo usuário (o mockup partia
// de fixture estática, onde os dois critérios sempre coincidiam).
// =============================================================================

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, FolderInput, EyeOff, Undo2, Lock, Loader2, Check } from 'lucide-react'
import Button from '@/components/ui/button'
import Badge from '@/components/ui/badge'
import ModalCentral from '@/components/shared/modal-central'
import ConfirmModal from '@/components/shared/confirm-modal'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import { fmtContabil, fmtContabilBRL } from './fmt-contabil'
import { salvarEstrutura } from '@/app/financeiro/dre/estrutura/actions'
import type { DreEstrutura, SalvarMapItem } from '@/lib/dre/schemas'

// ─────────────────────────────────────────────────────────────────────────────
// Modelo de dados local (derivado de `estrutura`)
// ─────────────────────────────────────────────────────────────────────────────

interface CatEditor {
  categoriaId: number
  nome:        string
  rotulo:      string
  estrela:     boolean
  total:       number
}

/** Excluída carrega a `ordem` original — não reordenável na UI, mas precisa sobreviver
 *  intacta na comparação com o baseline (senão toda excluída "pré-existente" apareceria
 *  como pendência fantasma a cada carregamento). */
interface ExcluidaEditor extends CatEditor {
  ordem: number
}

interface BandejaItem {
  categoriaId: number
  nome:        string
  grupoMonde:  string
  total:       number
}

interface BlocoItem {
  chave:   string
  rotulo:  string
  tipo:    'blocoH' | 'sub' | 'tot'
  formula: string[] | null
  cats:    CatEditor[]
}

interface EstadoCategoria { blocoChave: string | null; ordem: number; excluida: boolean }
type MapaEstado = Record<number, EstadoCategoria>

type ModalMoverEstado =
  | { modo: 'mover'; blocoChave: string; categoriaId: number }
  | { modo: 'classificar'; categoriaId: number }
  | { modo: 'reincluir'; categoriaId: number }

// ─────────────────────────────────────────────────────────────────────────────
// Cor por SINAL (verde = positivo, vermelho = negativo, neutro = zero).
// ─────────────────────────────────────────────────────────────────────────────

function corValor(v: number): string {
  return v < 0 ? 'text-negative' : v > 0 ? 'text-positive' : 'text-text-subtle'
}

function subtotalCats(cats: CatEditor[]): number {
  return cats.reduce((s, c) => s + c.total, 0)
}

function derivarBlocos(estrutura: DreEstrutura, totais: Record<number, number>): BlocoItem[] {
  // `estrutura.maps` já chega ordenado por (bloco_chave, ordem) — `dre_estrutura()` faz
  // `ORDER BY m.bloco_chave NULLS LAST, m.ordem`. Agrupar preservando a ordem de iteração
  // (push na chegada) já basta: dentro de um mesmo bloco_chave, a ordem relativa da fonte É
  // a ordem por `ordem` — sem precisar re-sortar.
  const porBloco = new Map<string, CatEditor[]>()
  for (const m of estrutura.maps) {
    if (m.excluida || !m.bloco_chave) continue
    const arr = porBloco.get(m.bloco_chave) ?? []
    arr.push({ categoriaId: m.categoria_id, nome: m.nome, rotulo: m.rotulo, estrela: m.nota_estrela, total: totais[m.categoria_id] ?? 0 })
    porBloco.set(m.bloco_chave, arr)
  }

  return [...estrutura.blocos]
    .sort((a, b) => a.ordem - b.ordem)
    .map(b => ({
      chave: b.chave,
      rotulo: b.rotulo,
      tipo: b.tipo,
      formula: b.formula,
      cats: porBloco.get(b.chave) ?? [],
    }))
}

function derivarBandeja(estrutura: DreEstrutura, totais: Record<number, number>): BandejaItem[] {
  return estrutura.bandeja.map(b => ({
    categoriaId: b.categoria_id,
    nome: b.nome,
    grupoMonde: b.grupo_monde,
    total: totais[b.categoria_id] ?? 0,
  }))
}

function derivarExcluidas(estrutura: DreEstrutura, totais: Record<number, number>): ExcluidaEditor[] {
  return estrutura.maps
    .filter(m => m.excluida)
    .map(m => ({
      categoriaId: m.categoria_id,
      nome: m.nome,
      rotulo: m.rotulo,
      estrela: m.nota_estrela,
      total: totais[m.categoria_id] ?? 0,
      ordem: m.ordem,
    }))
}

function construirBaseline(estrutura: DreEstrutura): MapaEstado {
  const mapa: MapaEstado = {}
  for (const m of estrutura.maps) {
    mapa[m.categoria_id] = { blocoChave: m.bloco_chave, ordem: m.ordem, excluida: m.excluida }
  }
  return mapa
}

/** Pendências = categorias cujo (bloco/ordem/excluída) ATUAL difere do baseline — itera
 *  direto sobre os arrays tipados da árvore em edição (nunca `Object.entries` sobre um
 *  dicionário chaveado por número, que resolveria para o overload genérico de `Object`
 *  e perderia o tipo do valor). A ordem de uma categoria ATIVA é reindexada pela posição
 *  corrente no array do bloco (mesma convenção do seed: 10, 20, 30…); a de uma EXCLUÍDA
 *  preserva a ordem original (senão toda excluída pré-existente viraria pendência fantasma). */
function pendentesDe(blocos: BlocoItem[], excluidas: ExcluidaEditor[], baseline: MapaEstado): SalvarMapItem[] {
  const pend: SalvarMapItem[] = []

  function considerar(categoriaId: number, estado: EstadoCategoria) {
    const base = baseline[categoriaId]
    const mudou = !base
      || base.blocoChave !== estado.blocoChave
      || base.ordem !== estado.ordem
      || base.excluida !== estado.excluida
    if (mudou) pend.push({ categoria_id: categoriaId, bloco_chave: estado.blocoChave, ordem: estado.ordem, excluida: estado.excluida })
  }

  for (const b of blocos) {
    b.cats.forEach((c, idx) => considerar(c.categoriaId, { blocoChave: b.chave, ordem: (idx + 1) * 10, excluida: false }))
  }
  for (const e of excluidas) {
    considerar(e.categoriaId, { blocoChave: null, ordem: e.ordem, excluida: true })
  }

  return pend
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de texto
// ─────────────────────────────────────────────────────────────────────────────

function pluralAlteracoes(n: number): string {
  const palavra = n === 1 ? 'alteração' : 'alterações'
  const sufixo = n === 1 ? 'não salva' : 'não salvas'
  return `${n} ${palavra} ${sufixo}`
}

function construirMensagemExcluir(blocos: BlocoItem[], blocoChave: string, categoriaId: number): ReactNode {
  const bloco = blocos.find(b => b.chave === blocoChave)
  const cat = bloco?.cats.find(c => c.categoriaId === categoriaId)
  if (!bloco || !cat) return null
  const atual = subtotalCats(bloco.cats)
  const novo = atual - cat.total
  return (
    <div className="space-y-2">
      <p>
        Excluir <strong>{cat.rotulo}</strong> da DRE. {bloco.rotulo}:{' '}
        <span className="tabular-nums">{fmtContabilBRL(atual)}</span>
        {' → '}
        <span className="tabular-nums font-medium">{fmtContabilBRL(novo)}</span>
      </p>
      <p className="text-xs text-text-muted">
        A categoria continua visível em Excluídas e pode ser reincluída a qualquer momento.
      </p>
    </div>
  )
}

interface DadosModalMover {
  acaoTexto: string
  cat: { rotulo: string; total: number }
  origem?: { rotulo: string; atual: number }
  destinos: { chave: string; rotulo: string; atual: number }[]
}

function construirDadosModalMover(
  modal: ModalMoverEstado,
  blocos: BlocoItem[],
  bandeja: BandejaItem[],
  excluidas: ExcluidaEditor[],
): DadosModalMover | null {
  // Só blocos SEM fórmula recebem categoria (âncoras de grafo não são destino).
  const destinosDisponiveis = (excetoChave?: string) =>
    blocos
      .filter(b => b.formula === null && b.chave !== excetoChave)
      .map(b => ({ chave: b.chave, rotulo: b.rotulo, atual: subtotalCats(b.cats) }))

  if (modal.modo === 'mover') {
    const origemBloco = blocos.find(b => b.chave === modal.blocoChave)
    const cat = origemBloco?.cats.find(c => c.categoriaId === modal.categoriaId)
    if (!origemBloco || !cat) return null
    return {
      acaoTexto: 'Mover esta categoria para outro bloco:',
      cat: { rotulo: cat.rotulo, total: cat.total },
      origem: { rotulo: origemBloco.rotulo, atual: subtotalCats(origemBloco.cats) },
      destinos: destinosDisponiveis(origemBloco.chave),
    }
  }
  if (modal.modo === 'classificar') {
    const cat = bandeja.find(c => c.categoriaId === modal.categoriaId)
    if (!cat) return null
    return {
      acaoTexto: 'Classificar esta categoria (ainda sem bloco) em:',
      cat: { rotulo: cat.nome, total: cat.total },
      destinos: destinosDisponiveis(),
    }
  }
  const item = excluidas.find(e => e.categoriaId === modal.categoriaId)
  if (!item) return null
  return {
    acaoTexto: 'Reincluir esta categoria excluída em:',
    cat: { rotulo: item.rotulo, total: item.total },
    destinos: destinosDisponiveis(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes (hastados no MÓDULO — nunca definidos dentro do render)
// ─────────────────────────────────────────────────────────────────────────────

function FaixaAncora({ item, rotulosPorChave }: { item: BlocoItem; rotulosPorChave: Record<string, string> }) {
  const porChaves = item.formula?.join(' + ') ?? ''
  const legivel   = item.formula?.map(k => rotulosPorChave[k] ?? k).join(' + ') ?? ''
  return (
    <div
      className="flex items-center gap-2 rounded-lg bg-action-primary px-3 py-2"
      title={item.formula ? `Ancorada por chave de bloco — não reordenável · = ${porChaves}` : 'Ancorada por chave de bloco — não reordenável'}
    >
      <Lock size={12} className="shrink-0 text-action-primary-fg/50" aria-hidden="true" />
      <p className="shrink-0 text-[13px] font-medium text-action-primary-fg">{item.rotulo}</p>
      {item.formula ? (
        <p className="truncate text-2xs text-action-primary-fg/60">= {legivel}</p>
      ) : (
        <p className="truncate text-2xs text-action-primary-fg/60 italic">valor direto — sem categorias</p>
      )}
    </div>
  )
}

function LinhaCategoria({
  rotulo, estrela, total, index, count, onSubir, onDescer, onMover, onExcluir,
}: {
  rotulo: string
  estrela: boolean
  total: number
  index: number
  count: number
  onSubir: () => void
  onDescer: () => void
  onMover: () => void
  onExcluir: () => void
}) {
  return (
    <div className="flex items-center gap-2 border-b border-wt-border/60 px-4 py-2.5 last:border-b-0">
      <p className="min-w-0 flex-1 truncate text-[13px] text-text-secondary">
        {rotulo}
        {estrela && (
          <sup className="text-warning-deep" title="Nota da controladoria">
            *
          </sup>
        )}
      </p>
      <p className={`shrink-0 text-xs tabular-nums ${corValor(total)}`}>{fmtContabil(total)}</p>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="icone"
          disabled={index === 0}
          onClick={onSubir}
          aria-label={`Mover ${rotulo} para cima`}
          title="Mover para cima"
        >
          <ChevronUp size={14} />
        </Button>
        <Button
          variant="icone"
          disabled={index === count - 1}
          onClick={onDescer}
          aria-label={`Mover ${rotulo} para baixo`}
          title="Mover para baixo"
        >
          <ChevronDown size={14} />
        </Button>
        <Button
          variant="icone"
          onClick={onMover}
          aria-label={`Mover ${rotulo} para outro bloco`}
          title="Mover para outro bloco"
        >
          <FolderInput size={14} />
        </Button>
        <Button
          variant="icone"
          tone="perigo"
          onClick={onExcluir}
          aria-label={`Excluir ${rotulo} da DRE`}
          title="Excluir da DRE"
        >
          <EyeOff size={14} />
        </Button>
      </div>
    </div>
  )
}

function CardBloco({
  bloco, onSubirCat, onDescerCat, onMoverCat, onExcluirCat,
}: {
  bloco: BlocoItem
  onSubirCat: (index: number) => void
  onDescerCat: (index: number) => void
  onMoverCat: (categoriaId: number) => void
  onExcluirCat: (categoriaId: number) => void
}) {
  const subtotal = subtotalCats(bloco.cats)
  // -deep (não a base): sobre a banda cinza (--band-soft) os tons base de sinal
  // reprovam AA (contraste medido 3,88–4,31:1); os -deep sobem a 7–10:1.
  const corSubtotal = subtotal < 0 ? 'text-negative-deep' : subtotal > 0 ? 'text-positive-deep' : 'text-text-muted'
  return (
    <div className="overflow-hidden rounded-lg border border-wt-border bg-surface">
      <div className="flex items-center gap-2 border-b border-wt-border bg-band-soft px-4 py-3">
        <p className="text-sm font-medium text-text-primary">{bloco.rotulo}</p>
        <span className="rounded bg-surface-strong px-1.5 py-0.5 font-mono text-2xs text-text-muted">{bloco.chave}</span>
        <span className="text-2xs text-text-subtle">
          {bloco.cats.length} categoria{bloco.cats.length === 1 ? '' : 's'}
        </span>
        <span className={`ml-auto shrink-0 text-sm font-medium tabular-nums ${corSubtotal}`}>
          {fmtContabilBRL(subtotal)}
        </span>
      </div>
      <div>
        {bloco.cats.map((cat, index) => (
          <LinhaCategoria
            key={cat.categoriaId}
            rotulo={cat.rotulo}
            estrela={cat.estrela}
            total={cat.total}
            index={index}
            count={bloco.cats.length}
            onSubir={() => onSubirCat(index)}
            onDescer={() => onDescerCat(index)}
            onMover={() => onMoverCat(cat.categoriaId)}
            onExcluir={() => onExcluirCat(cat.categoriaId)}
          />
        ))}
      </div>
    </div>
  )
}

function BandejaCard({ itens, onClassificar }: { itens: BandejaItem[]; onClassificar: (categoriaId: number) => void }) {
  if (itens.length === 0) return null
  return (
    <div className="rounded-lg border border-l-[3px] border-warning border-l-warning bg-warning-bg">
      <div className="flex flex-wrap items-center gap-2 border-b border-warning/40 px-4 py-3">
        <Badge variant="warning">Não classificadas</Badge>
        <span className="text-2xs text-warning-deep">
          {itens.length} categoria{itens.length === 1 ? '' : 's'}
        </span>
        <span className="text-2xs text-warning-deep">
          categorias novas do Monde aparecem aqui — nada some em silêncio
        </span>
      </div>
      <div>
        {itens.map(cat => (
          <div key={cat.categoriaId} className="flex items-center gap-2 border-b border-warning/20 px-4 py-2 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-text-primary">{cat.nome}</p>
              <p className="text-2xs text-warning-deep">Sem bloco mapeado — aguardando classificação</p>
            </div>
            <p className={`shrink-0 text-xs tabular-nums ${corValor(cat.total)}`}>{fmtContabil(cat.total)}</p>
            <button type="button" onClick={() => onClassificar(cat.categoriaId)} className={`${PILL} ${PILL_NEUTRO} shrink-0`}>
              Classificar…
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ExcluidasCard({ itens, onReincluir }: { itens: ExcluidaEditor[]; onReincluir: (categoriaId: number) => void }) {
  if (itens.length === 0) return null
  return (
    <div className="rounded-lg border border-wt-border bg-surface-soft">
      <div className="border-b border-wt-border px-4 py-3">
        <p className="text-sm font-medium text-text-primary">Excluídas da DRE</p>
        <p className="text-2xs text-text-muted">
          transferências internas de caixa (valores reais, netam a zero) — fora da DRE por não serem
          resultado; seguem visíveis e reversíveis
        </p>
      </div>
      <div>
        {itens.map(item => (
          <div key={item.categoriaId} className="flex items-center gap-2 border-b border-wt-border px-4 py-2 last:border-b-0">
            <p className="min-w-0 flex-1 truncate text-[13px] text-text-secondary">{item.rotulo}</p>
            <p className={`shrink-0 text-xs tabular-nums ${corValor(item.total)}`}>{fmtContabil(item.total)}</p>
            <button
              type="button"
              onClick={() => onReincluir(item.categoriaId)}
              className={`${PILL} ${PILL_NEUTRO} shrink-0 inline-flex items-center gap-1`}
            >
              <Undo2 size={12} /> Reincluir…
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function MoverModal({
  acaoTexto, cat, origem, destinos, selecionado, onSelecionar, onConfirmar, onFechar,
}: {
  acaoTexto: string
  cat: { rotulo: string; total: number }
  origem?: { rotulo: string; atual: number }
  destinos: { chave: string; rotulo: string; atual: number }[]
  selecionado: string | null
  onSelecionar: (chave: string) => void
  onConfirmar: () => void
  onFechar: () => void
}) {
  const destinoSel = destinos.find(d => d.chave === selecionado) ?? null
  return (
    <ModalCentral
      titulo="Mover categoria"
      subtitulo={cat.rotulo}
      largura="lg"
      onClose={onFechar}
      rodape={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className={`${PILL} ${PILL_NEUTRO}`} onClick={onFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className={`${PILL} ${PILL_PRIMARIA}`}
            style={PILL_PRIMARIA_STYLE}
            disabled={!selecionado}
            onClick={onConfirmar}
          >
            Confirmar
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium text-text-muted">{acaoTexto}</p>
          {destinos.length === 0 ? (
            <p className="rounded-lg border border-dashed border-wt-border px-3 py-4 text-center text-sm text-text-subtle">
              Nenhum bloco de destino disponível.
            </p>
          ) : (
            <div className="space-y-1.5">
              {destinos.map(d => (
                <button
                  key={d.chave}
                  type="button"
                  onClick={() => onSelecionar(d.chave)}
                  className={`foco-neutro w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    selecionado === d.chave
                      ? 'border-action-soft-border bg-action-soft text-action-soft-fg'
                      : 'border-wt-border text-text-secondary hover:bg-surface-strong'
                  }`}
                >
                  {d.rotulo}
                </button>
              ))}
            </div>
          )}
        </div>

        {destinoSel && (
          <div className="space-y-1.5 rounded-lg border border-wt-border bg-surface-soft p-3">
            <p className="text-2xs font-medium text-text-muted">Efeito nos subtotais</p>
            {origem && (
              <p className="text-xs text-text-secondary">
                {origem.rotulo}: <span className="tabular-nums">{fmtContabilBRL(origem.atual)}</span>
                {' → '}
                <span className="font-medium tabular-nums">{fmtContabilBRL(origem.atual - cat.total)}</span>
              </p>
            )}
            <p className="text-xs text-text-secondary">
              {destinoSel.rotulo}: <span className="tabular-nums">{fmtContabilBRL(destinoSel.atual)}</span>
              {' → '}
              <span className="font-medium tabular-nums">{fmtContabilBRL(destinoSel.atual + cat.total)}</span>
            </p>
          </div>
        )}
      </div>
    </ModalCentral>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  estrutura: DreEstrutura
  totaisPorCategoria: Record<number, number>
  anoTotais: number
  /** Notifica o pai da contagem de pendências (guarda do desfazer no histórico — v5.3.0). */
  onPendenciasChange?: (n: number) => void
}

export default function EditorDre({ estrutura, totaisPorCategoria, anoTotais, onPendenciasChange }: Props) {
  const router = useRouter()

  const [blocos, setBlocos]       = useState<BlocoItem[]>(() => derivarBlocos(estrutura, totaisPorCategoria))
  const [bandeja, setBandeja]     = useState<BandejaItem[]>(() => derivarBandeja(estrutura, totaisPorCategoria))
  const [excluidas, setExcluidas] = useState<ExcluidaEditor[]>(() => derivarExcluidas(estrutura, totaisPorCategoria))
  const [baseline, setBaseline]   = useState<MapaEstado>(() => construirBaseline(estrutura))
  const [tokenAtual, setTokenAtual] = useState(estrutura.token)

  const [erro, setErro]       = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [salvoEm, setSalvoEm]   = useState(false)

  const [modalMover, setModalMover] = useState<ModalMoverEstado | null>(null)
  const [destinoSel, setDestinoSel] = useState<string | null>(null)
  const [modalExcluir, setModalExcluir] = useState<{ blocoChave: string; categoriaId: number } | null>(null)

  // Re-hidrata quando o servidor troca de estrutura (router.refresh() pós-Salvar, ou o token
  // simplesmente veio diferente) — padrão "ajustar durante a renderização" (cadastro-grade.tsx/
  // CLAUDE.md): compara o token da prop com o snapshot local; mudou → TUDO re-hidrata de uma
  // vez (zera pendências, limpa erro), sem useEffect.
  if (estrutura.token !== tokenAtual) {
    setTokenAtual(estrutura.token)
    setBlocos(derivarBlocos(estrutura, totaisPorCategoria))
    setBandeja(derivarBandeja(estrutura, totaisPorCategoria))
    setExcluidas(derivarExcluidas(estrutura, totaisPorCategoria))
    setBaseline(construirBaseline(estrutura))
    setErro(null)
  }

  const pendentes = pendentesDe(blocos, excluidas, baseline)
  const pendCount = pendentes.length

  // Avisa ao fechar/recarregar a aba com pendências (padrão Metas). Navegação por link
  // dentro do app não é interceptada aqui — gap de follow-up conhecido (não é router-block).
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (pendCount > 0) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [pendCount])

  // Notifica o pai (EstruturaShell) — alimenta a guarda `antesDeDesfazer` do histórico:
  // desfazer com pendências não salvas descartaria a edição em curso no refresh (achado
  // ALTO do revisor). Callback para o PAI em efeito é o canal padrão (não é setState do
  // próprio componente).
  useEffect(() => {
    onPendenciasChange?.(pendCount)
  }, [pendCount, onPendenciasChange])

  function moverCategoria(blocoChave: string, index: number, delta: -1 | 1) {
    const bloco = blocos.find(b => b.chave === blocoChave)
    if (!bloco) return
    const destino = index + delta
    if (destino < 0 || destino >= bloco.cats.length) return
    setBlocos(prev =>
      prev.map(b => {
        if (b.chave !== blocoChave) return b
        const novo = [...b.cats]
        const [item] = novo.splice(index, 1)
        novo.splice(destino, 0, item)
        return { ...b, cats: novo }
      }),
    )
  }

  function abrirMover(blocoChave: string, categoriaId: number) {
    setDestinoSel(null)
    setModalMover({ modo: 'mover', blocoChave, categoriaId })
  }
  function abrirClassificar(categoriaId: number) {
    setDestinoSel(null)
    setModalMover({ modo: 'classificar', categoriaId })
  }
  function abrirReincluir(categoriaId: number) {
    setDestinoSel(null)
    setModalMover({ modo: 'reincluir', categoriaId })
  }
  function fecharModalMover() {
    setModalMover(null)
    setDestinoSel(null)
  }

  function confirmarMover() {
    if (!modalMover || !destinoSel) return
    const destinoBloco = blocos.find(b => b.chave === destinoSel)
    if (!destinoBloco) return

    if (modalMover.modo === 'mover') {
      const origemBloco = blocos.find(b => b.chave === modalMover.blocoChave)
      const cat = origemBloco?.cats.find(c => c.categoriaId === modalMover.categoriaId)
      if (!origemBloco || !cat) return
      setBlocos(prev =>
        prev.map(b => {
          if (b.chave === origemBloco.chave) return { ...b, cats: b.cats.filter(c => c.categoriaId !== cat.categoriaId) }
          if (b.chave === destinoSel) return { ...b, cats: [...b.cats, cat] }
          return b
        }),
      )
    } else if (modalMover.modo === 'classificar') {
      const cat = bandeja.find(c => c.categoriaId === modalMover.categoriaId)
      if (!cat) return
      setBandeja(prev => prev.filter(c => c.categoriaId !== cat.categoriaId))
      setBlocos(prev => prev.map(b => (b.chave === destinoSel
        ? { ...b, cats: [...b.cats, { categoriaId: cat.categoriaId, nome: cat.nome, rotulo: cat.nome, estrela: false, total: cat.total }] }
        : b)))
    } else {
      const item = excluidas.find(e => e.categoriaId === modalMover.categoriaId)
      if (!item) return
      setExcluidas(prev => prev.filter(e => e.categoriaId !== item.categoriaId))
      setBlocos(prev => prev.map(b => (b.chave === destinoSel
        ? { ...b, cats: [...b.cats, { categoriaId: item.categoriaId, nome: item.nome, rotulo: item.rotulo, estrela: item.estrela, total: item.total }] }
        : b)))
    }
    fecharModalMover()
  }

  function abrirExcluir(blocoChave: string, categoriaId: number) {
    setModalExcluir({ blocoChave, categoriaId })
  }
  function confirmarExcluir() {
    if (!modalExcluir) return
    const bloco = blocos.find(b => b.chave === modalExcluir.blocoChave)
    const cat = bloco?.cats.find(c => c.categoriaId === modalExcluir.categoriaId)
    if (!bloco || !cat) return
    setBlocos(prev => prev.map(b => (b.chave === bloco.chave ? { ...b, cats: b.cats.filter(c => c.categoriaId !== cat.categoriaId) } : b)))
    setExcluidas(prev => [...prev, { categoriaId: cat.categoriaId, nome: cat.nome, rotulo: cat.rotulo, estrela: cat.estrela, total: cat.total, ordem: 0 }])
    setModalExcluir(null)
  }

  async function salvar() {
    setSalvando(true)
    setErro(null)
    let res: Awaited<ReturnType<typeof salvarEstrutura>>
    try {
      res = await salvarEstrutura(pendentes, estrutura.token)
    } catch {
      res = { ok: false, erro: 'Falha ao salvar a estrutura. Tente novamente.' }
    }
    setSalvando(false)
    if (res.ok) {
      router.refresh()
      setSalvoEm(true)
      setTimeout(() => setSalvoEm(false), 1500)
    } else {
      setErro(res.erro ?? 'Não foi possível salvar as alterações.')
    }
  }

  const dadosModalMover = modalMover ? construirDadosModalMover(modalMover, blocos, bandeja, excluidas) : null
  const rotulosPorChave = Object.fromEntries(blocos.map(b => [b.chave, b.rotulo]))

  return (
    <div className="rounded-xl bg-surface p-5 shadow-sm">
      {erro && <FaixaMensagem tipo="erro" texto={erro} onFechar={() => setErro(null)} />}

      <p className="text-2xs text-text-subtle">
        Estrutura global e auditada — toda alteração fica no histórico e é reversível. Valores de referência: {anoTotais}.
      </p>

      <div className="mt-3 space-y-3">
        {blocos.map(item =>
          item.formula === null ? (
            <CardBloco
              key={item.chave}
              bloco={item}
              onSubirCat={index => moverCategoria(item.chave, index, -1)}
              onDescerCat={index => moverCategoria(item.chave, index, 1)}
              onMoverCat={categoriaId => abrirMover(item.chave, categoriaId)}
              onExcluirCat={categoriaId => abrirExcluir(item.chave, categoriaId)}
            />
          ) : (
            <FaixaAncora key={item.chave} item={item} rotulosPorChave={rotulosPorChave} />
          ),
        )}

        <BandejaCard itens={bandeja} onClassificar={abrirClassificar} />
        <ExcluidasCard itens={excluidas} onReincluir={abrirReincluir} />
      </div>

      {(pendCount > 0 || salvoEm) && (
        <div className="sticky bottom-0 -mx-5 -mb-5 mt-3 flex items-center justify-between rounded-b-xl border-t border-wt-border bg-surface px-5 py-3">
          {pendCount > 0 ? (
            <>
              <p className="text-xs text-text-muted">{pluralAlteracoes(pendCount)}</p>
              <Button variant="solido" onClick={() => void salvar()} disabled={salvando}>
                {salvando && <Loader2 size={14} className="animate-spin" />}
                {salvando ? 'Salvando…' : 'Salvar alterações'}
              </Button>
            </>
          ) : (
            <p className="flex items-center gap-1.5 text-xs font-medium text-success">
              <Check size={14} /> Alterações salvas
            </p>
          )}
        </div>
      )}

      {modalMover && dadosModalMover && (
        <MoverModal
          acaoTexto={dadosModalMover.acaoTexto}
          cat={dadosModalMover.cat}
          origem={dadosModalMover.origem}
          destinos={dadosModalMover.destinos}
          selecionado={destinoSel}
          onSelecionar={setDestinoSel}
          onConfirmar={confirmarMover}
          onFechar={fecharModalMover}
        />
      )}

      {modalExcluir && (
        <ConfirmModal
          titulo="Excluir categoria da DRE"
          mensagem={construirMensagemExcluir(blocos, modalExcluir.blocoChave, modalExcluir.categoriaId)}
          confirmarLabel="Excluir"
          perigo
          onConfirmar={confirmarExcluir}
          onFechar={() => setModalExcluir(null)}
        />
      )}
    </div>
  )
}
