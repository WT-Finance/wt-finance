'use client'

import { useCallback, useRef, useState, type ComponentProps } from 'react'
import { useRouter } from 'next/navigation'
import EditorDre from './editor-dre'
import HistoricoAlteracoes, { type HistoricoFetchers, type CampoDiff } from '@/components/financeiro/gerencial/historico-alteracoes'
import ConfirmModal from '@/components/shared/confirm-modal'
import type { DreEstrutura } from '@/lib/dre/schemas'
import {
  estruturaHistoricoLotes, estruturaHistoricoLote, estruturaDesfazerLote, estruturaDesfazerLinha,
} from '@/app/financeiro/dre/estrutura/actions'

// Shell client-side da página de estrutura (v5.3.0 · M5): orquestra o editor real + o
// painel de histórico/desfazer generalizado (v5.2.1/M3, prop-izado em M2-front) com estado
// compartilhado. A `recarregarKey` do histórico avança quando o TOKEN da estrutura muda
// (salvar bem-sucedido refaz o fetch da página via router.refresh(), que desce um `estrutura`
// novo) — mesmo padrão "ajustar durante a renderização" do EditorDre; sem callback entre os
// dois componentes, sem useEffect fazendo setState.
//
// GUARDA DO DESFAZER (achado ALTO do revisor, v5.3.0): desfazer pelo histórico dispara
// `router.refresh()` → a estrutura desce com token novo → o EditorDre re-hidrata e
// DESCARTARIA pendências não salvas em silêncio. O editor reporta a contagem de pendências
// (onPendenciasChange → ref, sem re-render) e o painel só executa o undo depois de
// `antesDeDesfazer` — que, havendo pendências, abre um ConfirmModal explicando o descarte.

const FETCHERS_ESTRUTURA: HistoricoFetchers = {
  lotes: estruturaHistoricoLotes,
  lote: estruturaHistoricoLote,
  desfazerLote: estruturaDesfazerLote,
  desfazerLinha: estruturaDesfazerLinha,
}

const CAMPOS_DIFF_ESTRUTURA: CampoDiff[] = [
  { campo: 'bloco_chave', rotulo: 'Bloco' },
  { campo: 'ordem', rotulo: 'Ordem' },
  { campo: 'excluida', rotulo: 'Excluída', fmt: v => (v ? 'sim' : 'não') },
  { campo: 'rotulo', rotulo: 'Rótulo' },
  { campo: 'nota_estrela', rotulo: 'Nota', fmt: v => (v ? 'sim' : 'não') },
]

export default function EstruturaShell({
  estrutura, totaisPorCategoria,
  fetchers = FETCHERS_ESTRUTURA,
  salvarAction,
}: {
  estrutura: DreEstrutura
  totaisPorCategoria: Record<number, number>
  /** Fetchers do painel de histórico/desfazer. Default: os do regime de CAIXA.
   *  A v5.8.0 replicou este shell para o regime de COMPETÊNCIA, que tem diário próprio
   *  (as RPCs filtram por `tabela_alvo`) — o que varia entre os dois regimes entra por
   *  estas duas props, e o call-site do caixa não mudou. */
  fetchers?: HistoricoFetchers
  /** Action de gravação do editor. Default (undefined): a do regime de caixa. */
  salvarAction?: ComponentProps<typeof EditorDre>['salvarAction']
}) {
  const router = useRouter()
  const [recarregarKey, setRecarregarKey] = useState(0)
  const [tokenPrev, setTokenPrev] = useState(estrutura.token)

  // Pendências do editor em REF (não state): o valor só é lido no clique de desfazer —
  // re-renderizar o shell a cada edição do editor seria ruído.
  const pendenciasRef = useRef(0)
  const registrarPendencias = useCallback((n: number) => { pendenciasRef.current = n }, [])

  // Confirmação de descarte: promise pendente resolvida pelo ConfirmModal abaixo.
  const [confirmaDescarte, setConfirmaDescarte] = useState<{ n: number; resolve: (ok: boolean) => void } | null>(null)
  const antesDeDesfazer = useCallback(() => {
    if (pendenciasRef.current === 0) return Promise.resolve(true)
    return new Promise<boolean>(resolve => setConfirmaDescarte({ n: pendenciasRef.current, resolve }))
  }, [])

  // Idêntico ao guard do EditorDre: o token novo (pós-salvar) sinaliza que o histórico pode
  // ter uma entrada nova a mostrar, mesmo com o painel já aberto.
  if (estrutura.token !== tokenPrev) {
    setTokenPrev(estrutura.token)
    setRecarregarKey(k => k + 1)
  }

  return (
    <>
      <EditorDre
        estrutura={estrutura}
        totaisPorCategoria={totaisPorCategoria}
        onPendenciasChange={registrarPendencias}
        salvarAction={salvarAction}
      />
      <HistoricoAlteracoes
        recarregarKey={recarregarKey}
        onDesfeito={() => router.refresh()}
        fetchers={fetchers}
        camposDiff={CAMPOS_DIFF_ESTRUTURA}
        titulo="Histórico de alterações"
        antesDeDesfazer={antesDeDesfazer}
      />
      {confirmaDescarte && (
        <ConfirmModal
          titulo="Descartar alterações não salvas?"
          mensagem={
            <p>
              Você tem <strong>{confirmaDescarte.n}</strong>{' '}
              {confirmaDescarte.n === 1 ? 'alteração não salva' : 'alterações não salvas'} no editor.
              Desfazer pelo histórico recarrega a estrutura e <strong>descarta</strong> essas alterações.
            </p>
          }
          confirmarLabel="Descartar e desfazer"
          perigo
          onConfirmar={() => { confirmaDescarte.resolve(true); setConfirmaDescarte(null) }}
          onFechar={() => { confirmaDescarte.resolve(false); setConfirmaDescarte(null) }}
        />
      )}
    </>
  )
}
