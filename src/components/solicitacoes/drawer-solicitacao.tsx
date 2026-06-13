'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Download, Check, X, Ban } from 'lucide-react'
import ListDrawer from '@/components/shared/list-drawer'
import ModalCentral from '@/components/shared/modal-central'
import ConfirmModal from '@/components/shared/confirm-modal'
import { FaixaMensagem } from '@/components/admin/acessos/faixa-mensagem'
import { PILL, PILL_NEUTRO, PILL_PERIGO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/admin/acessos/botoes'
import { CAMPO } from '@/lib/ui/campos'
import { concluirSolicitacao, rejeitarSolicitacao, cancelarSolicitacao, anexoUrl } from '@/app/solicitacoes/actions'
import { STATUS_LABEL, statusBadge, fmtDataBR, fmtValor, vencida } from '@/lib/solicitacoes/format'
import type { Solicitacao } from '@/lib/solicitacoes/schemas'

const INPUT = `${CAMPO} resize-none`

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

  return (
    <ListDrawer titulo={sol.tipo_nome ?? 'Solicitação'} subtitulo={`Aberta por ${sol.solicitante_email ?? '—'}`} onClose={onClose}>
      {erro && <div className="mb-3"><FaixaMensagem tipo="erro" texto={erro} onFechar={() => setErro(null)} /></div>}

      <div className="flex items-center gap-2 mb-4">
        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadge(sol.status)}`}>{STATUS_LABEL[sol.status]}</span>
        <span className={`text-xs ${vencida(sol.data_limite, sol.status) ? 'font-medium text-red-600' : 'text-zinc-500'}`}>Limite: {fmtDataBR(sol.data_limite)}</span>
      </div>

      <dl className="space-y-2 text-sm mb-4">
        <Linha rotulo="Destinatário" valor={`${sol.destinatario.rotulo ?? '—'} ${sol.destinatario.tipo === 'role' ? '(permissão)' : ''}`} />
        <Linha rotulo="Aberta em" valor={fmtDataBR(sol.criado_em)} />
        {sol.descricao && <Linha rotulo="Descrição" valor={sol.descricao} />}
      </dl>

      {sol.respostas.length > 0 && (
        <div className="border-t border-zinc-100 pt-3 mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">Campos</p>
          <dl className="space-y-2 text-sm">
            {sol.respostas.map(r => (
              <div key={r.campo_id}>
                <dt className="text-xs text-zinc-500">{r.rotulo}</dt>
                {r.tipo_campo === 'anexo'
                  ? <dd className="mt-0.5 space-y-1">{sol.anexos.filter(a => a.campo_id === r.campo_id).map(a => (
                      <button key={a.id} type="button" disabled={baixando !== null} onClick={() => baixarAnexo(a.id)} className="foco-neutro inline-flex items-center gap-1.5 rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-60">
                        {baixando === a.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} {a.nome}
                      </button>))}
                      {sol.anexos.filter(a => a.campo_id === r.campo_id).length === 0 && <span className="text-zinc-400 text-xs">—</span>}
                    </dd>
                  : <dd className="text-zinc-800">{fmtValor(r)}</dd>}
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* anexos sem campo (gerais), se houver */}
      {sol.anexos.some(a => a.campo_id == null) && (
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">Anexos</p>
          {sol.anexos.filter(a => a.campo_id == null).map(a => (
            <button key={a.id} type="button" disabled={baixando !== null} onClick={() => baixarAnexo(a.id)} className="foco-neutro mr-1 mb-1 inline-flex items-center gap-1.5 rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-60">{baixando === a.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} {a.nome}</button>
          ))}
        </div>
      )}

      {sol.status !== 'aberta' && (
        <div className="border-t border-zinc-100 pt-3 mb-4 text-xs text-zinc-500">
          <p>{STATUS_LABEL[sol.status]} por {sol.decidido_por_email ?? '—'} em {fmtDataBR(sol.decidido_em)}.</p>
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

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return <div className="flex gap-2"><dt className="w-28 shrink-0 text-xs text-zinc-500">{rotulo}</dt><dd className="text-zinc-800">{valor}</dd></div>
}
