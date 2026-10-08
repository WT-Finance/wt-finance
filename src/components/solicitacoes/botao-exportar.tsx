'use client'

import { useState } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { PILL, PILL_GESTAO, PILL_GESTAO_STYLE } from '@/components/shared/botoes'
import { hojeSP } from '@/lib/solicitacoes/format'
import { nomeArquivoExportacao } from '@/lib/solicitacoes/exportar'

/** v6.3.1 — baixa TODAS as solicitações em Excel (gestão). A planilha é montada pela rota
 *  `/api/solicitacoes/exportar`; aqui só o download. Mecânica do botão no molde do Exportar
 *  da DRE (v6.1.1): `disabled` enquanto gera impede o duplo clique, o ícone vira spinner e o
 *  erro é um aviso discreto ao lado, com a causa no console.error. */
export default function BotaoExportarSolicitacoes() {
  const [exportando, setExportando] = useState(false)
  const [erro, setErro] = useState(false)

  async function exportar() {
    if (exportando) return
    setExportando(true)
    setErro(false)
    try {
      const res = await fetch('/api/solicitacoes/exportar', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = nomeArquivoExportacao(hojeSP())
      a.click()
      // Sem o revoke o blob fica retido na aba até o reload (mesma nota do `baixarCsv`).
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[Solicitações exportar]', err)
      setErro(true)
    } finally {
      setExportando(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={exportar}
        disabled={exportando}
        aria-busy={exportando}
        className={`${PILL} ${PILL_GESTAO} whitespace-nowrap disabled:opacity-60`}
        style={PILL_GESTAO_STYLE}
        title="Baixar todas as solicitações em Excel — uma aba geral, uma por tipo e a lista de anexos"
      >
        {exportando ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <FileSpreadsheet size={13} aria-hidden />}
        Exportar
      </button>
      {erro && (
        <span role="alert" className="text-2xs text-danger">
          Não foi possível gerar a planilha — tente de novo.
        </span>
      )}
    </>
  )
}
