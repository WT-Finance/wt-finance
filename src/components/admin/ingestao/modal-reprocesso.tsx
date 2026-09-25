'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import ModalCentral from '@/components/shared/modal-central'
import { ModalConfirmacaoUpload, type DetalhesConferencia } from '@/components/admin/modal-confirmacao-upload'
import type { RespostaCarga } from '@/app/admin/uploads/ingestao-cliente'
import {
  getVendasStatusAction, getLancamentosStatusAction, getLancamentosMovimentacaoStatusAction,
  getTitulosEmAbertoStatusAction, getDemonstrativoCompetenciaStatusAction,
} from '@/app/admin/uploads/actions'
import { prepararReprocessoAction, type PreparoReprocesso } from '@/app/admin/ingestao/actions'
import { processarCargaReprocesso } from '@/app/admin/ingestao/reprocesso-cliente'
import { ROTULO_BASE, ehBaseIngestao, type BaseIngestao } from '@/lib/ingestao/bases'
import type { IngestaoCarga } from './tipos'

// Reprocesso (anexo v6.0.0/M6 §7): "o botão reprocessa uma carga a partir do arquivo cru
// guardado." O contrato pedia "repetir com os mesmos paths" — não funciona com a idempotência
// por carga_id da M4 (repetiria a resposta antiga). O fluxo real, em 3 passos:
//   1. `prepararReprocessoAction` (server action, service_role): copia os objetos da carga
//      antiga para caminhos NOVOS sob um carga_id NOVO (mesmos bytes, mesmo sha256).
//   2. Confere no servidor (`confirmar:false`, com a SESSÃO do usuário) — MESMO passo 3 do
//      contrato que todo upload manual já passa.
//   3. O modal de confirmação (`ModalConfirmacaoUpload`, mesmo componente do card de upload)
//      mostra antes/depois; confirmando, `confirmar:true` aplica — é substituição da base
//      inteira, o mesmo gate humano de qualquer carga.
//
// `x-ingestao-origem: reprocesso` (não "manual") viaja em toda chamada — é o que a carga
// registra em `ingestao.carga.origem`, para a tela/auditoria distinguirem depois.

type Estado = 'preparando' | 'conferindo' | 'aguardando_confirmacao' | 'aplicando' | 'erro'

async function statusAtualDaBase(base: BaseIngestao): Promise<number> {
  switch (base) {
    case 'vendas-produto': { const r = await getVendasStatusAction(); return 'error' in r ? 0 : r.total }
    case 'lancamentos-operacao': { const r = await getLancamentosStatusAction(); return 'error' in r ? 0 : r.total }
    case 'lancamentos-movimentacao': { const r = await getLancamentosMovimentacaoStatusAction(); return 'error' in r ? 0 : r.total }
    case 'lancamentos-aberto': { const r = await getTitulosEmAbertoStatusAction(); return 'error' in r ? 0 : r.total }
    case 'demonstrativo-competencia': { const r = await getDemonstrativoCompetenciaStatusAction(); return 'error' in r ? 0 : r.total }
  }
}

function detalhesDaResposta(resposta: RespostaCarga): DetalhesConferencia {
  return {
    rejeitadasPorData:   resposta.parse.rejeitadas_por_data,
    paresNovos:          resposta.parse.pares_novos,
    checksumsConferidos: resposta.arquivos.reduce((s, a) => s + a.checksums_conferidos, 0),
    checksumsFalhos:     resposta.arquivos.reduce((s, a) => s + a.checksums_falhos, 0),
    somaArquivo:         resposta.parse.soma,
    somaDiff:            resposta.diff.soma,
    avisos:              [...resposta.alarmes],
  }
}

export function ModalReprocesso({
  carga,
  onFechar,
  onConcluido,
}: {
  carga: IngestaoCarga
  onFechar: () => void
  onConcluido: (mensagem: string) => void
}) {
  const [estado, setEstado] = useState<Estado>('preparando')
  const [mensagemErro, setMensagemErro] = useState('')
  const [preparo, setPreparo] = useState<PreparoReprocesso | null>(null)
  const [totalAntes, setTotalAntes] = useState(0)
  const [totalDepois, setTotalDepois] = useState(0)
  const [detalhes, setDetalhes] = useState<DetalhesConferencia | null>(null)

  // Passos 1+2 (preparar + conferir), disparados uma vez ao abrir o modal. IIFE async: nenhum
  // setState síncrono na entrada do efeito (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelado = false
    void (async () => {
      const prep = await prepararReprocessoAction(carga.carga_id)
      if (cancelado) return
      if (!prep.ok) { setEstado('erro'); setMensagemErro(prep.erro); return }

      setEstado('conferindo')
      try {
        const [antes, resposta] = await Promise.all([
          statusAtualDaBase(prep.preparo.base),
          processarCargaReprocesso(prep.preparo.base, { ...prep.preparo, confirmar: false }),
        ])
        if (cancelado) return
        setPreparo(prep.preparo)
        setTotalAntes(antes)
        setTotalDepois(resposta.parse.linhas_na_base)
        setDetalhes(detalhesDaResposta(resposta))
        setEstado('aguardando_confirmacao')
      } catch (err) {
        if (cancelado) return
        setEstado('erro')
        setMensagemErro(err instanceof Error ? err.message : 'Erro ao conferir o reprocesso.')
      }
    })()
    return () => { cancelado = true }
  }, [carga.carga_id])

  async function confirmar() {
    if (!preparo) return
    setEstado('aplicando')
    try {
      await processarCargaReprocesso(preparo.base, { ...preparo, confirmar: true })
      onConcluido(`Reprocesso de "${ROTULO_BASE[preparo.base]}" aplicado com sucesso.`)
    } catch (err) {
      setEstado('erro')
      setMensagemErro(err instanceof Error ? err.message : 'Erro ao aplicar o reprocesso.')
    }
  }

  if (estado === 'aguardando_confirmacao' && preparo) {
    return (
      <ModalConfirmacaoUpload
        baseLabel={ROTULO_BASE[preparo.base]}
        totalAntes={totalAntes}
        totalDepois={totalDepois}
        detalhes={detalhes}
        onConfirmar={() => { void confirmar() }}
        onCancelar={onFechar}
      />
    )
  }

  return (
    <ModalCentral
      titulo="Reprocessar carga"
      subtitulo={ehBaseIngestao(carga.base) ? ROTULO_BASE[carga.base] : carga.base}
      onClose={onFechar}
    >
      {estado === 'erro' ? (
        <p className="text-sm text-danger">{mensagemErro}</p>
      ) : (
        <div className="flex items-center gap-2 py-4 text-sm text-zinc-600">
          <Loader2 size={16} className="animate-spin" />
          {estado === 'preparando' && 'Copiando o arquivo original para um reprocesso novo…'}
          {estado === 'conferindo' && 'Conferindo o reprocesso no servidor…'}
          {estado === 'aplicando' && 'Aplicando o reprocesso…'}
        </div>
      )}
    </ModalCentral>
  )
}
