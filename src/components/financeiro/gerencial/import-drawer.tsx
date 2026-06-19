'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import ListDrawer from '@/components/shared/list-drawer'
import { numBRL2 } from '@/lib/fmt'
import type { ImportDiff, ImportResumo, LinhaResumo } from '@/lib/gerencial/import-types'

type Etapa = 'upload' | 'preview' | 'sucesso'
type BucketKey = 'adicionar' | 'atualizar' | 'manter' | 'remover' | 'duplicatas'

interface Props { open: boolean; onClose: () => void }

// dd/MM a partir de ISO (yyyy-mm-dd) — vencimento é date puro (sem fuso), split é seguro.
function fmtVenc(iso: string): string { const [, m, d] = iso.split('-'); return d && m ? `${d}/${m}` : iso }
const corValor = (tipo: string) => tipo === 'A pagar' ? 'text-[var(--negative-deep)]' : 'text-[var(--positive-deep)]'
// Valor compacto p/ o preview estreito (R$ junto do número, à direita) — evita o justify-between
// do <ValorContabil> que estica a coluna e cortava a última coluna no drawer (item 4).
const valorCompacto = (v: number, tipo: string) =>
  <span className={`text-[11px] tabular-nums whitespace-nowrap ${corValor(tipo)}`}>R$ {numBRL2(v)}</span>

// Cabeçalho da mini-tabela de um bucket (formato base, compacto). As larguras são fixas
// (table-fixed no <table>): Pessoa flexiona/trunca; o resto cabe sem rolagem horizontal (item 4).
function CabecalhoBucket({ remover = false }: { remover?: boolean }) {
  return (
    <thead>
      <tr className="border-b border-zinc-100 text-left text-[10px] uppercase tracking-wide text-zinc-400">
        {remover && <th className="py-1 px-1 w-[24px]" />}
        <th className="py-1 px-1.5 w-[58px]">Tipo</th>
        <th className="py-1 px-1.5">Pessoa</th>
        <th className="py-1 px-1.5 text-right w-[104px]">Valor</th>
        <th className="py-1 px-1.5 w-[72px]">Conta</th>
        <th className="py-1 px-1.5 w-[48px]">Venc.</th>
      </tr>
    </thead>
  )
}

// Cabeçalho clicável de bucket (label + contagem + chevron). Módulo-level (static-components).
function BucketHeader({ k, label, count, color, sufixo, aberto, onToggle }: {
  k: BucketKey; label: string; count: number; color: string; sufixo?: string; aberto: BucketKey | null; onToggle: (k: BucketKey) => void
}) {
  return (
    <button type="button" onClick={() => onToggle(k)} disabled={count === 0}
      className="w-full flex items-center justify-between px-3 py-2 text-left disabled:opacity-50 disabled:cursor-default">
      <span className="flex items-center gap-2">
        {count > 0 ? (aberto === k ? <ChevronDown size={14} className="text-zinc-400" /> : <ChevronRight size={14} className="text-zinc-400" />) : <span className="w-[14px]" />}
        <span className="text-xs font-medium text-zinc-600">{label}</span>
        {sufixo && <span className="text-[10px] text-zinc-400">{sufixo}</span>}
      </span>
      <span className="text-sm font-bold tabular-nums" style={{ color }}>{count}</span>
    </button>
  )
}

// Célula comum de uma linha (tipo/pessoa/valor/conta/venc) — descrição vai no title.
function CelulasLinha({ l }: { l: { tipo: string; pessoa: string; valor_final: number; conta_previsao: string | null; vencimento: string; descricao: string | null } }) {
  return (
    <>
      <td className="py-1 px-1.5 text-[11px] text-zinc-500 whitespace-nowrap">{l.tipo}</td>
      <td className="py-1 px-1.5 text-[11px]"><span className="block truncate" title={l.descricao ? `${l.pessoa} — ${l.descricao}` : l.pessoa}>{l.pessoa}</span></td>
      <td className="py-1 px-1.5 text-right">{valorCompacto(l.valor_final, l.tipo)}</td>
      <td className="py-1 px-1.5 text-[11px] text-zinc-500"><span className="block truncate" title={l.conta_previsao ?? '—'}>{l.conta_previsao ?? '—'}</span></td>
      <td className="py-1 px-1.5 text-[11px] text-zinc-500 whitespace-nowrap">{fmtVenc(l.vencimento)}</td>
    </>
  )
}

export default function ImportDrawer({ open, onClose }: Props) {
  const [etapa, setEtapa]       = useState<Etapa>('upload')
  const [erro, setErro]         = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [file, setFile]         = useState<File | null>(null)
  const [diff, setDiff]         = useState<ImportDiff | null>(null)
  const [resumo, setResumo]     = useState<ImportResumo | null>(null)
  const [loading, setLoading]   = useState(false)
  // M3 — toggle "manter duplicadas" (OFF colapsa idênticas da planilha; ON mantém as duas).
  const [manterDup, setManterDup] = useState(false)
  // M4 — acordeão (1 bucket aberto por vez); "a remover" aberto por padrão.
  const [aberto, setAberto]     = useState<BucketKey | null>('remover')
  // M4 — proteção pontual: ids de "a remover" DESMARCADOS (não removidos neste commit).
  const [protegidos, setProtegidos] = useState<Set<number>>(new Set())

  if (!open) return null

  const enviar = async (selectedFile: File, action: 'preview' | 'commit', manter: boolean, protegidosIds?: number[]) => {
    const fd = new FormData()
    fd.append('file', selectedFile)
    fd.append('action', action)
    fd.append('manterDuplicadas', String(manter))
    if (protegidosIds) fd.append('protegidos', JSON.stringify(protegidosIds))
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
      const data = await enviar(selected, 'preview', manterDup)
      setFile(selected)
      setWarnings(data.warnings ?? [])
      setDiff(data.diff)
      setProtegidos(new Set())
      setAberto('remover')
      setEtapa('preview')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro inesperado')
    }
    setLoading(false)
  }

  // Re-analisa com o novo estado do toggle (a contagem muda → o preview muda).
  const handleToggleDup = async (novo: boolean) => {
    setManterDup(novo)
    if (!file) return
    setErro(null); setLoading(true)
    try {
      const data = await enviar(file, 'preview', novo)
      setWarnings(data.warnings ?? [])
      setDiff(data.diff)
      setProtegidos(new Set())   // ids podem ter mudado
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao reanalisar')
    }
    setLoading(false)
  }

  const handleConfirmar = async () => {
    if (!file) return
    setErro(null)
    setLoading(true)
    try {
      const data = await enviar(file, 'commit', manterDup, [...protegidos])
      setResumo(data.resumo)
      setEtapa('sucesso')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao confirmar importação')
    }
    setLoading(false)
  }

  const handleFechar = () => {
    setEtapa('upload'); setErro(null); setDiff(null); setResumo(null); setFile(null)
    setWarnings([]); setManterDup(false); setProtegidos(new Set()); setAberto('remover')
    onClose()
  }

  const toggleProteger = (id: number) => setProtegidos(prev => {
    const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s
  })
  const toggleBucket = (k: BucketKey) => setAberto(prev => prev === k ? null : k)

  const removerEfetivo = diff ? diff.aRemover.length - protegidos.size : 0

  return (
    <ListDrawer titulo="Importar lançamentos" subtitulo="Importa a planilha de lançamentos curada manualmente" onClose={handleFechar}>
      {/* Instruções desde o início (item 7) — valem para upload e preview. */}
      {etapa !== 'sucesso' && (
        <div className="mb-4 rounded-lg bg-zinc-50 border border-zinc-100 px-3 py-2.5 text-xs leading-relaxed text-[var(--text-muted)]">
          Ao importar a planilha, <strong>todos os lançamentos da importação anterior são substituídos</strong>. A
          importação sincroniza apenas as suas linhas — lançamentos de outros usuários não são tocados.{' '}
          <strong>Lançamentos adicionados manualmente não são excluídos.</strong>
        </div>
      )}
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
          {/* Toggle "manter duplicadas" (item 5) — só aparece quando há duplicatas na planilha, e as informa.
              v4.23.3 (item 2): o aviso vira expansível e lista QUAIS linhas duplicam (mesmo padrão dos buckets). */}
          {diff.duplicatasPlanilha > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
              <button type="button" onClick={() => toggleBucket('duplicatas')}
                className="w-full flex items-center gap-1.5 text-left">
                {aberto === 'duplicatas' ? <ChevronDown size={14} className="shrink-0 text-amber-700" /> : <ChevronRight size={14} className="shrink-0 text-amber-700" />}
                <span className="text-xs text-amber-800">
                  Detectamos <strong>{diff.duplicatasPlanilha}</strong> {diff.duplicatasPlanilha === 1 ? 'linha idêntica repetida' : 'linhas idênticas repetidas'} dentro da planilha.
                </span>
              </button>
              {aberto === 'duplicatas' && (
                <div className="overflow-hidden rounded border border-amber-200 bg-white">
                  <table className="w-full table-fixed"><CabecalhoBucket />
                    <tbody>{diff.duplicatasLinhas.map((l, i) => <tr key={i} className="border-b border-zinc-50"><CelulasLinha l={l} /></tr>)}</tbody>
                  </table>
                </div>
              )}
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-xs text-zinc-700">
                  Manter duplicadas
                  <span className="block text-[10px] text-zinc-500">Tratar as linhas idênticas como lançamentos separados (em vez de uma só).</span>
                </span>
                <input type="checkbox" checked={manterDup} disabled={loading}
                  onChange={e => handleToggleDup(e.target.checked)}
                  className="accent-[var(--brand)] cursor-pointer shrink-0" />
              </label>
            </div>
          )}

          {/* Buckets navegáveis (M4) — acordeão, 1 aberto por vez */}
          <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 overflow-hidden">
            <div>
              <BucketHeader k="adicionar" label="A adicionar" count={diff.aAdicionar.length} color="var(--positive-deep)" aberto={aberto} onToggle={toggleBucket} />
              {aberto === 'adicionar' && diff.aAdicionar.length > 0 && (
                <div className="px-3 pb-2">
                  <table className="w-full table-fixed"><CabecalhoBucket />
                    <tbody>{diff.aAdicionar.map((l, i) => <tr key={i} className="border-b border-zinc-50"><CelulasLinha l={l} /></tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <BucketHeader k="atualizar" label="A atualizar" count={diff.aAtualizar.length} color="var(--brand)" aberto={aberto} onToggle={toggleBucket} />
              {aberto === 'atualizar' && diff.aAtualizar.length > 0 && (
                <div className="px-3 pb-2">
                  <table className="w-full table-fixed">
                    <thead>
                      <tr className="border-b border-zinc-100 text-left text-[10px] uppercase tracking-wide text-zinc-400">
                        <th className="py-1 px-1.5 w-[120px]">Pessoa</th>
                        <th className="py-1 px-1.5 text-right w-[104px]">Valor</th>
                        <th className="py-1 px-1.5">Alterações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.aAtualizar.map(u => (
                        <tr key={u.id} className="border-b border-zinc-50">
                          <td className="py-1 px-1.5 text-[11px]"><span className="block truncate" title={u.novo.pessoa}>{u.novo.pessoa}</span></td>
                          <td className="py-1 px-1.5 text-right">{valorCompacto(u.novo.valor_final, u.novo.tipo)}</td>
                          <td className="py-1 px-1.5 text-[11px] text-zinc-500">
                            {u.camposDivergentes.map(c => {
                              const rotulo = c === 'descricao' ? 'descrição' : 'conta'
                              const antigo = String((u.atual[c] as string | null) ?? '—')
                              const novo   = String((c === 'descricao' ? u.novo.descricao : u.novo.conta_previsao) ?? '—')
                              return <span key={c} className="block truncate" title={`${rotulo}: ${antigo} → ${novo}`}>{rotulo}: <span className="text-zinc-400 line-through">{antigo}</span> → {novo}</span>
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <BucketHeader k="manter" label="A manter" count={diff.aManter.length} color="var(--text-muted)" aberto={aberto} onToggle={toggleBucket} />
              {aberto === 'manter' && diff.aManter.length > 0 && (
                <div className="px-3 pb-2">
                  <table className="w-full table-fixed"><CabecalhoBucket />
                    <tbody>{diff.aManter.map((l: LinhaResumo) => <tr key={l.id} className="border-b border-zinc-50"><CelulasLinha l={l} /></tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <BucketHeader k="remover" label="A remover" count={diff.aRemover.length} color="var(--negative-deep)"
                sufixo={protegidos.size > 0 ? `${protegidos.size} protegida(s) · ${removerEfetivo} a remover` : undefined}
                aberto={aberto} onToggle={toggleBucket} />
              {aberto === 'remover' && diff.aRemover.length > 0 && (
                <div className="px-3 pb-2">
                  <p className="text-[10px] text-zinc-400 mb-1">
                    Desmarque para <strong>não remover desta vez</strong> — a linha reaparece na próxima importação (não vira manual).
                  </p>
                  <table className="w-full table-fixed"><CabecalhoBucket remover />
                    <tbody>{diff.aRemover.map((l: LinhaResumo) => (
                      <tr key={l.id} className={`border-b border-zinc-50 ${protegidos.has(l.id) ? 'opacity-50' : ''}`}>
                        <td className="py-1 px-1.5 text-center">
                          <input type="checkbox" checked={!protegidos.has(l.id)} onChange={() => toggleProteger(l.id)}
                            className="accent-[var(--negative-deep)] cursor-pointer" aria-label="Remover esta linha" />
                        </td>
                        <CelulasLinha l={l} />
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
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
              {loading ? 'Processando…' : 'Confirmar importação'}
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
