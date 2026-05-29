'use client'
import { useState } from 'react'
import ListDrawer from '@/components/shared/list-drawer'
import type { ImportDiff, ImportResumo } from '@/lib/gerencial/import-types'

type Etapa = 'upload' | 'preview' | 'sucesso'

interface Props { open: boolean; onClose: () => void }

// Importação 100% via API Route /api/gerencial/import (ADR-0091).
// Este componente NÃO importa @e965/xlsx nem Server Actions de parsing —
// apenas faz fetch multipart. O parsing roda na API Route (runtime Node),
// fora do contexto RSC. Isso resolve PEND-001.
export default function ImportDrawer({ open, onClose }: Props) {
  const [etapa, setEtapa]       = useState<Etapa>('upload')
  const [erro, setErro]         = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [file, setFile]         = useState<File | null>(null)
  const [diff, setDiff]         = useState<ImportDiff | null>(null)
  const [resumo, setResumo]     = useState<ImportResumo | null>(null)
  const [loading, setLoading]   = useState(false)

  if (!open) return null

  const enviar = async (selectedFile: File, action: 'preview' | 'commit') => {
    const fd = new FormData()
    fd.append('file', selectedFile)
    fd.append('action', action)
    const res  = await fetch('/api/gerencial/import', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Erro na importação')
    return data
  }

  const handleAnalisar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErro(null)
    setLoading(true)

    const selected = (e.currentTarget.querySelector('input[type="file"]') as HTMLInputElement)?.files?.[0]
    if (!selected)                         { setErro('Nenhum arquivo selecionado'); setLoading(false); return }
    if (selected.size > 10 * 1024 * 1024)  { setErro('Arquivo maior que 10MB');     setLoading(false); return }

    try {
      const data = await enviar(selected, 'preview')
      setFile(selected)
      setWarnings(data.warnings ?? [])
      setDiff(data.diff)
      setEtapa('preview')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro inesperado')
    }
    setLoading(false)
  }

  const handleConfirmar = async () => {
    if (!file) return
    setErro(null)
    setLoading(true)
    try {
      const data = await enviar(file, 'commit')
      setResumo(data.resumo)
      setEtapa('sucesso')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao confirmar importação')
    }
    setLoading(false)
  }

  const handleFechar = () => {
    setEtapa('upload'); setErro(null); setDiff(null); setResumo(null); setFile(null); setWarnings([])
    onClose()
  }

  return (
    <ListDrawer titulo="Importar Planilha" subtitulo="Importa a planilha de curadoria" onClose={handleFechar}>
      {etapa === 'upload' && (
        <form onSubmit={handleAnalisar} className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">Selecione o arquivo Excel (.xlsx).</p>
          <input type="file" name="file" accept=".xlsx,.xls" required
            className="block w-full text-sm text-zinc-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-zinc-200 file:text-xs file:cursor-pointer" />
          {erro && <p className="text-sm text-red-500">{erro}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-2 rounded text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: 'var(--brand)' }}>
            {loading ? 'Analisando…' : 'Analisar'}
          </button>
        </form>
      )}

      {etapa === 'preview' && diff && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'A adicionar', count: diff.aAdicionar.length, color: 'var(--positive-deep)' },
              { label: 'A remover',   count: diff.aRemover.length,   color: 'var(--negative-deep)' },
              { label: 'A atualizar', count: diff.aAtualizar.length, color: 'var(--brand)'         },
              { label: 'A manter',    count: diff.aManter,           color: 'var(--text-muted)'     },
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
            <button onClick={() => setEtapa('upload')} disabled={loading}
              className="flex-1 py-2 rounded text-sm border border-zinc-200 text-zinc-500 hover:border-zinc-300 transition-colors disabled:opacity-50">
              Voltar
            </button>
            <button onClick={handleConfirmar} disabled={loading}
              className="flex-1 py-2 rounded text-sm font-medium text-white disabled:opacity-50 transition-opacity"
              style={{ background: 'var(--brand)' }}>
              {loading ? 'Confirmando…' : 'Confirmar importação'}
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
