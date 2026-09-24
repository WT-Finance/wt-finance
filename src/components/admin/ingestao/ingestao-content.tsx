'use client'

import { useCallback, useState } from 'react'
import { obterPainelIngestaoAction } from '@/app/admin/ingestao/actions'
import { AlarmesAbertosFaixa, AlarmesRecentesTabela } from './alarmes-secoes'
import { VigiaPainel } from './vigia-painel'
import { CargasTabela } from './cargas-tabela'
import { ExecucoesTabela } from './execucoes-tabela'
import { ModalReprocesso } from './modal-reprocesso'
import type { IngestaoCarga, IngestaoPainel } from './tipos'

// Orquestra a tela /admin/ingestao (v6.0.0/M6, anexo §7) — ordem de importância do que a tela
// responde: (1) há algo errado agora? → AlarmesAbertosFaixa, no topo; (2) o vigia está de pé?
// → VigiaPainel (com liga/desliga de vigia e expectativas); (3) o que aconteceu? → cargas e
// execuções; (4) histórico de alarmes.

export function IngestaoContent({ painelInicial }: { painelInicial: IngestaoPainel | null }) {
  const [painel, setPainel] = useState(painelInicial)
  const [falhaCarga, setFalhaCarga] = useState(painelInicial === null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [cargaParaReprocessar, setCargaParaReprocessar] = useState<IngestaoCarga | null>(null)

  const atualizar = useCallback(async () => {
    const novo = await obterPainelIngestaoAction()
    if (novo) { setPainel(novo); setFalhaCarga(false) } else { setFalhaCarga(true) }
  }, [])

  function mostrarMensagem(texto: string) {
    setMensagem(texto)
  }

  if (!painel) {
    return (
      <div role="alert" className="rounded-lg border border-danger bg-danger-bg px-4 py-3 text-sm text-danger">
        Não foi possível carregar o painel de ingestão. Recarregue a página.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {mensagem && (
        <div role="status" className="rounded-lg border border-success bg-success-bg px-4 py-2.5 text-sm text-success">
          {mensagem}
        </div>
      )}
      {falhaCarga && (
        <div role="alert" className="rounded-lg border border-warning bg-warning-bg px-4 py-2.5 text-sm text-warning-deep">
          A última atualização do painel falhou — os dados abaixo podem estar desatualizados.
        </div>
      )}

      <AlarmesAbertosFaixa alarmes={painel.alarmes_abertos} />

      <VigiaPainel
        vigiaCronAtivo={painel.vigia_cron_ativo}
        vigiaUltimaVerificacao={painel.vigia_ultima_verificacao}
        expectativas={painel.expectativas}
        onAtualizado={atualizar}
        onMensagem={mostrarMensagem}
      />

      <CargasTabela cargas={painel.cargas} onReprocessar={setCargaParaReprocessar} />
      <ExecucoesTabela execucoes={painel.execucoes} />
      <AlarmesRecentesTabela alarmes={painel.alarmes_recentes} />

      {cargaParaReprocessar && (
        <ModalReprocesso
          carga={cargaParaReprocessar}
          onFechar={() => setCargaParaReprocessar(null)}
          onConcluido={async mensagemSucesso => {
            setCargaParaReprocessar(null)
            mostrarMensagem(mensagemSucesso)
            await atualizar()
          }}
        />
      )}
    </div>
  )
}
