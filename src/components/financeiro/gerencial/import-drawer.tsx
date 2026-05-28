'use client'
import { useState, useTransition } from 'react'
import ListDrawer from '@/components/shared/list-drawer'
import { parseImport, computeImportDiff, commitImport } from '@/app/financeiro/fluxo-caixa/gerencial/actions'
import type { ImportDiff, LancamentoPlanilha } from '@/app/financeiro/fluxo-caixa/gerencial/actions'

type Etapa = 'upload' | 'preview' | 'sucesso'

interface Props { open: boolean; onClose: () => void }

export default function ImportDrawer({ open, onClose }: Props) {
  const [etapa, setEtapa]             = useState<Etapa>('upload')
  const [erro, setErro]               = useState<string | null>(null)
  const [warnings, setWarnings]       = useState<string[]>([])
  const [planilha, setPlanilha]       = useState<LancamentoPlanilha[]>([])
  const [diff, setDiff]               = useState<ImportDiff | null>(null)
  const [resumo, setResumo]           = useState<{ adicionados: number; removidos: number; atualizados: number } | null>(null)
  const [isParsing, startParsing]     = useTransition()
  const [isConfirming, startConfirm]  = useTransition()

  if (!open) return null

  const handleAnalisar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErro(null)
    const fd = new FormData(e.currentTarget)
    startParsing(async () => {
      const parseRes = await parseImport(fd)
      if (!parseRes.success) { setErro(parseRes.error); return }
      setWarnings(parseRes.warnings)
      setPlanilha(parseRes.lancamentos)
      const diffRes = await computeImportDiff(parseRes.lancamentos)
      if (!diffRes.success) { setErro(diffRes.error); return }
      setDiff(diffRes.diff)
      setEtapa('preview')
    })
  }

  const handleConfirmar = () => {
    startConfirm(async () => {
      const res = await commitImport(planilha)
      if (!res.success) { setErro(res.error); return }
      setResumo(res.resumo)
      setEtapa('sucesso')
    })
  }

  const handleFechar = () => {
    setEtapa('upload'); setErro(null); setDiff(null); setResumo(null); setPlanilha([]); setWarnings([])
    onClose()
  }

  return (
    <ListDrawer titulo="Importar Planilha" subtitulo="Importa a aba Monde da planilha de curadoria" onClose={handleFechar}>
      {etapa === 'upload' && (
        <form onSubmit={handleAnalisar} className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">Selecione o arquivo Excel (.xlsx) com a aba <strong>Monde</strong>.</p>
          <input type="file" name="file" accept=".xlsx,.xls" required
            className="block w-full text-sm text-zinc-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-zinc-200 file:text-xs file:cursor-pointer" />
          {erro && <p className="text-sm text-red-500">{erro}</p>}
          <button type="submit" disabled={isParsing}
            className="w-full py-2 rounded text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: 'var(--brand)' }}>
            {isParsing ? 'Analisando…' : 'Analisar'}
          </button>
        </form>
      )}

      {etapa === 'preview' && diff && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'A adicionar', count: diff.aAdicionar.length, color: 'var(--positive-deep)' },
              { label: 'A remover',   count: diff.aRemover.length,   color: 'var(--negative-deep)' },
              { label: 'A atualizar', count: diff.aAtualizar.length, color: 'var(--brand)' },
              { label: 'A manter',    count: diff.aManter,           color: 'var(--text-muted)' },
            ].map(({ label, count, color }) => (
              <div key={label} className="bg-zinc-50 rounded-lg px-3 py-2.5 text-center">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">{label}</p>
                <p className="text-2xl font-bold tabular-nums" style={{ color }}>{count}</p>
              </div>
            ))}
          </div>
          {warnings.length > 0 && (
            <div className="bg-yellow-50 rounded p-3 text-xs text-yellow-700">
              <p className="font-medium mb-1">{warnings.length} linha(s) ignorada(s):</p>
              {warnings.slice(0, 5).map((w, i) => <p key={i}>{w}</p>)}
              {warnings.length > 5 && <p>…e mais {warnings.length - 5}</p>}
            </div>
          )}
          {erro && <p className="text-sm text-red-500">{erro}</p>}
          <div className="flex gap-2">
            <button onClick={() => setEtapa('upload')}
              className="flex-1 py-2 rounded text-sm border border-zinc-200 text-zinc-500 hover:border-zinc-300 transition-colors">
              Voltar
            </button>
            <button onClick={handleConfirmar} disabled={isConfirming}
              className="flex-1 py-2 rounded text-sm font-medium text-white disabled:opacity-50 transition-opacity"
              style={{ background: 'var(--brand)' }}>
              {isConfirming ? 'Confirmando…' : 'Confirmar importação'}
            </button>
          </div>
        </div>
      )}

      {etapa === 'sucesso' && resumo && (
        <div className="text-center space-y-4 py-4">
          <div className="text-4xl">✅</div>
          <p className="font-semibold text-[var(--text-primary)]">Importação concluída</p>
          <p className="text-sm text-[var(--text-muted)]">
            {resumo.adicionados} adicionados · {resumo.removidos} removidos · {resumo.atualizados} atualizados
          </p>
          <button onClick={handleFechar}
            className="w-full py-2 rounded text-sm font-medium text-white"
            style={{ background: 'var(--brand)' }}>
            Fechar
          </button>
        </div>
      )}
    </ListDrawer>
  )
}
