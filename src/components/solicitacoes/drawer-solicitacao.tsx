'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Download, Check, X, Ban, FileText, FileSpreadsheet, FileImage, File as FileIcon } from 'lucide-react'
import ListDrawer from '@/components/shared/list-drawer'
import ModalCentral from '@/components/shared/modal-central'
import ConfirmModal from '@/components/shared/confirm-modal'
import { FaixaMensagem } from '@/components/admin/acessos/faixa-mensagem'
import { PILL, PILL_NEUTRO, PILL_PERIGO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/admin/acessos/botoes'
import { CAMPO } from '@/lib/ui/campos'
import { fmtDataHoraSP } from '@/lib/fmt'
import { concluirSolicitacao, rejeitarSolicitacao, cancelarSolicitacao, anexoUrl } from '@/app/solicitacoes/actions'
import { STATUS_LABEL, statusBadge, fmtDataBR, fmtValor, vencida } from '@/lib/solicitacoes/format'
import type { Solicitacao } from '@/lib/solicitacoes/schemas'

const INPUT = `${CAMPO} resize-none`

// Ícone por tipo de arquivo (anexo): planilha, imagem, PDF/texto, ou genérico.
function iconeArquivo(mime: string, nome: string) {
  const m = (mime || '').toLowerCase()
  const ext = (nome.split('.').pop() ?? '').toLowerCase()
  if (m.includes('sheet') || m === 'text/csv' || ext === 'xlsx' || ext === 'csv') return FileSpreadsheet
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return FileImage
  if (m === 'application/pdf' || ext === 'pdf') return FileText
  return FileIcon
}

export default function DrawerSolicitacao({ sol, onClose }: { sol: Solicitacao; onClose: () => void }) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [rejeitando, setRejeitando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [justificativa, setJustificativa] = useState('')
  // id do anexo sendo baixado no momento (impede duplo-clique e exibe spinner)
  const [baixando, setBaixando] = useState<number | null>(null)

  const aberta = sol.status === 'aberta'
  const podeConcluir = aberta && (sol.sou_atendente || sol.sou_solicitante)
  const podeRejeitar = aberta && sol.sou_atendente
  const podeCancelar = aberta && sol.sou_solicitante
  const venc = vencida(sol.data_limite, sol.status)

  async function run(fn: () => Promise<{ ok: boolean; erro?: string }>) {
    setErro(null); setOcupado(true)
    const r = await fn(); setOcupado(false)
    if (!r.ok) { setErro(r.erro ?? 'Falha na ação.'); return }
    router.refresh(); onClose()
  }
  async function baixarAnexo(id: number) {
    // Evita duplo-clique enquanto já há um download em progresso
    if (baixando !== null) return
    setErro(null)
    setBaixando(id)
    // Abre a janela de forma SÍNCRONA (antes do await) para não ser bloqueada pelo
    // popup-blocker; depois redirecionamos para a URL assinada. Sem 'noopener' na
    // feature string porque com ela window.open retorna null por especificação —
    // zeramos o opener manualmente logo abaixo.
    const w = window.open('', '_blank')
    if (w) w.opener = null
    try {
      const r = await anexoUrl(id)
      if (r.ok) {
        if (w) {
          w.location.href = r.url
        } else {
          // Fallback: o open síncrono já foi bloqueado — tenta o caminho direto
          window.open(r.url, '_blank', 'noopener')
        }
      } else {
        w?.close()
        setErro(r.erro)
      }
    } finally {
      setBaixando(null)
    }
  }

  // Botão de download de um anexo (ícone por tipo de arquivo + nome).
  function BotaoAnexo({ a }: { a: Solicitacao['anexos'][number] }) {
    const Icone = baixando === a.id ? Loader2 : iconeArquivo(a.mime, a.nome)
    return (
      <button
        type="button" disabled={baixando !== null} onClick={() => baixarAnexo(a.id)}
        className="foco-neutro flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-left text-xs text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60"
      >
        <Icone size={15} className={`shrink-0 text-zinc-400 ${baixando === a.id ? 'animate-spin' : ''}`} />
        <span className="min-w-0 flex-1 truncate">{a.nome}</span>
        {baixando !== a.id && <Download size={13} className="shrink-0 text-zinc-400" />}
      </button>
    )
  }

  // Campos não-anexo (vão na grade de dois) e campos anexo (bloco próprio).
  const camposValor = sol.respostas.filter(r => r.tipo_campo !== 'anexo')
  const camposAnexo = sol.respostas.filter(r => r.tipo_campo === 'anexo')
  const anexosGerais = sol.anexos.filter(a => a.campo_id == null)

  return (
    <ListDrawer titulo={sol.tipo_nome ?? 'Solicitação'} subtitulo={`Solicitação #${sol.id}`} onClose={onClose}>
      {erro && <div className="mb-4"><FaixaMensagem tipo="erro" texto={erro} onFechar={() => setErro(null)} /></div>}

      {/* ── Zona 1 — Cabeçalho: status + data-limite (vermelho se vencida) ───────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-4">
        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadge(sol.status)}`}>{STATUS_LABEL[sol.status]}</span>
        <span className={`text-sm ${venc ? 'font-semibold text-red-600' : 'text-zinc-500'}`}>
          Limite: {fmtDataBR(sol.data_limite)}{venc && ' · vencida'}
        </span>
      </div>

      {/* ── Zona 2 — Faixa de metadados: destinatário, solicitante, aberta em (hora SP) ── */}
      <div className="mb-5 rounded-lg border border-zinc-100 bg-zinc-50/70 px-3.5 py-3">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
          <Meta rotulo="Destinatário" valor={`${sol.destinatario.rotulo ?? '—'}${sol.destinatario.tipo === 'role' ? ' (permissão)' : ''}`} />
          <Meta rotulo="Solicitante" valor={sol.solicitante_email ?? '—'} />
          <Meta rotulo="Aberta em" valor={fmtDataHoraSP(sol.criado_em)} />
        </dl>
        {sol.descricao && (
          <div className="mt-2.5 border-t border-zinc-200/70 pt-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Descrição</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-zinc-700">{sol.descricao}</dd>
          </div>
        )}
      </div>

      {/* ── Zona 3 — Campos preenchidos: rótulo pequeno → valor destacado (curtos em grade de dois) ── */}
      {(camposValor.length > 0 || camposAnexo.length > 0) && (
        <div className="mb-5">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Campos</p>
          {camposValor.length > 0 && (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              {camposValor.map(r => (
                <div key={r.campo_id} className={r.tipo_campo === 'texto_longo' ? 'sm:col-span-2' : ''}>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{r.rotulo}</dt>
                  <dd className={`mt-0.5 text-sm font-medium text-zinc-800 ${r.tipo_campo === 'texto_longo' ? 'whitespace-pre-wrap font-normal' : ''}`}>{fmtValor(r)}</dd>
                </div>
              ))}
            </dl>
          )}
          {camposAnexo.map(r => {
            const arquivos = sol.anexos.filter(a => a.campo_id === r.campo_id)
            return (
              <div key={r.campo_id} className="mt-3">
                <dt className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">{r.rotulo}</dt>
                {arquivos.length > 0
                  ? <div className="space-y-1.5">{arquivos.map(a => <BotaoAnexo key={a.id} a={a} />)}</div>
                  : <span className="text-xs text-zinc-400">—</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* Anexos gerais (sem campo), se houver — bloco próprio */}
      {anexosGerais.length > 0 && (
        <div className="mb-5">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Anexos</p>
          <div className="space-y-1.5">{anexosGerais.map(a => <BotaoAnexo key={a.id} a={a} />)}</div>
        </div>
      )}

      {sol.status !== 'aberta' && (
        <div className="border-t border-zinc-100 pt-3 mb-4 text-xs text-zinc-500">
          <p>{STATUS_LABEL[sol.status]} por {sol.decidido_por_email ?? '—'} em {fmtDataHoraSP(sol.decidido_em)}.</p>
          {sol.justificativa && <p className="mt-1"><span className="font-medium">Justificativa:</span> {sol.justificativa}</p>}
        </div>
      )}

      {(podeConcluir || podeRejeitar || podeCancelar) && (
        <div className="sticky -bottom-5 -mx-6 -mb-5 px-6 py-3 bg-white border-t border-zinc-100 flex flex-wrap gap-2">
          {podeConcluir && <button type="button" disabled={ocupado} onClick={() => run(() => concluirSolicitacao(sol.id))} className={`${PILL} ${PILL_PRIMARIA}`} style={PILL_PRIMARIA_STYLE}>{ocupado ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Concluir</button>}
          {podeRejeitar && <button type="button" disabled={ocupado} onClick={() => setRejeitando(true)} className={`${PILL} ${PILL_PERIGO}`}><Ban size={13} /> Rejeitar</button>}
          {podeCancelar && <button type="button" disabled={ocupado} onClick={() => setCancelando(true)} className={`${PILL} ${PILL_NEUTRO}`}><X size={13} /> Cancelar</button>}
        </div>
      )}

      {cancelando && (
        <ConfirmModal
          titulo="Cancelar solicitação"
          mensagem="Cancelar esta solicitação? Esta ação não pode ser desfeita."
          confirmarLabel="Cancelar solicitação"
          cancelarLabel="Voltar"
          onConfirmar={() => run(() => cancelarSolicitacao(sol.id))}
          onFechar={() => setCancelando(false)}
        />
      )}

      {rejeitando && (
        <ModalCentral titulo="Rejeitar solicitação" subtitulo="A justificativa é obrigatória e fica registrada." onClose={() => setRejeitando(false)}>
          <textarea autoFocus rows={3} value={justificativa} onChange={e => setJustificativa(e.target.value)} className={INPUT} placeholder="Motivo da rejeição" />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setRejeitando(false)} className={`${PILL} ${PILL_NEUTRO}`}>Voltar</button>
            <button type="button" disabled={ocupado || justificativa.trim().length === 0}
              onClick={() => { setRejeitando(false); run(() => rejeitarSolicitacao(sol.id, justificativa)) }}
              className={`${PILL} ${PILL_PERIGO}`}>Rejeitar</button>
          </div>
        </ModalCentral>
      )}
    </ListDrawer>
  )
}

function Meta({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{rotulo}</dt>
      <dd className="mt-0.5 truncate text-sm text-zinc-800" title={valor}>{valor}</dd>
    </div>
  )
}
