'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import ModalCentral from '@/components/shared/modal-central'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import CamposDinamicos, { type AnexoLocal } from './campos-dinamicos'
import { criarSolicitacao, uploadAnexo, type AnexoMeta } from '@/app/solicitacoes/actions'
import type { TipoAbertura, Destinatarios } from '@/lib/solicitacoes/schemas'

const INPUT = 'foco-neutro w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition'
type AnexoItem = AnexoLocal & { meta?: AnexoMeta }

export default function ModalNovaSolicitacao({ tipos, destinatarios, onFechar }: {
  tipos: TipoAbertura[]; destinatarios: Destinatarios; onFechar: () => void
}) {
  const router = useRouter()
  const [tipoId, setTipoId] = useState<number | ''>('')
  const [dataLimite, setDataLimite] = useState('')
  const [destMode, setDestMode] = useState<'role' | 'usuario'>('role')
  const [destRole, setDestRole] = useState<string>('')
  const [destUser, setDestUser] = useState<string>('')
  const [descricao, setDescricao] = useState('')
  const [valores, setValores] = useState<Record<string, string>>({})
  const [anexos, setAnexos] = useState<Record<number, AnexoItem[]>>({})
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const tipo = tipos.find(t => t.id === tipoId)

  // guarda de anexos: derivado do estado atual para evitar re-render de prop
  const todosAnexos = Object.values(anexos).flat()
  const subindo = todosAnexos.some(a => a.enviando)
  const comAnexoErro = todosAnexos.some(a => a.erro)

  function trocarTipo(novo: number) {
    const temPreenchimento = Object.values(valores).some(Boolean) || Object.keys(anexos).length > 0
    if (temPreenchimento && !window.confirm('Trocar o tipo limpa os campos preenchidos. Continuar?')) return
    setTipoId(novo); setValores({}); setAnexos({})
  }

  function setAnexosCampo(id: number, fn: (arr: AnexoItem[]) => AnexoItem[]) {
    setAnexos(prev => ({ ...prev, [id]: fn(prev[id] ?? []) }))
  }
  async function onAnexoSelect(campoId: number, files: FileList) {
    for (const file of Array.from(files)) {
      const idx = (anexos[campoId]?.length ?? 0)
      setAnexosCampo(campoId, a => [...a, { nome: file.name, enviando: true }])
      const fd = new FormData(); fd.set('file', file); fd.set('campo_id', String(campoId))
      const res = await uploadAnexo(fd)
      setAnexosCampo(campoId, a => a.map((it, i) => i === idx
        ? (res.ok ? { nome: file.name, meta: res.anexo } : { nome: `${file.name} — ${res.erro}`, erro: true })
        : it))
    }
  }
  const onAnexoRemove = (campoId: number, idx: number) => setAnexosCampo(campoId, a => a.filter((_, i) => i !== idx))

  const anexosUI: Record<number, AnexoLocal[]> = Object.fromEntries(
    Object.entries(anexos).map(([k, arr]) => [k, arr.map(({ nome, enviando, erro }) => ({ nome, enviando, erro }))]))

  async function enviar() {
    setErro(null)
    if (!tipo) { setErro('Escolha o tipo de solicitação.'); return }
    if (!dataLimite) { setErro('Informe a data-limite.'); return }
    const destinatario_role_id = destMode === 'role' ? (destRole ? Number(destRole) : null) : null
    const destinatario_user_id = destMode === 'usuario' ? (destUser || null) : null
    if (!destinatario_role_id && !destinatario_user_id) { setErro('Escolha um destinatário.'); return }
    // guarda defensiva: impede race via teclado/submit duplo com anexo ainda subindo
    if (subindo) { setErro('Aguarde o envio dos anexos terminar.'); return }
    // avisa o usuário sobre anexo com falha (em vez de silenciar o erro)
    if (comAnexoErro) { setErro('Há anexo com falha de envio — remova-o ou tente novamente.'); return }
    const anexosMeta = Object.values(anexos).flat().map(a => a.meta).filter((m): m is AnexoMeta => !!m)
    setEnviando(true)
    const res = await criarSolicitacao({
      tipo_id: tipo.id, destinatario_user_id, destinatario_role_id,
      data_limite: dataLimite, descricao, respostas: valores, anexos: anexosMeta,
    })
    setEnviando(false)
    if (!res.ok) { setErro(res.erro); return }
    router.refresh(); onFechar()
  }

  return (
    <ModalCentral titulo="Nova solicitação" subtitulo="Abra um pedido ao financeiro." onClose={onFechar}>
      {erro && <div className="mb-3"><FaixaMensagem tipo="erro" texto={erro} onFechar={() => setErro(null)} /></div>}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="ns-tipo" className="block text-xs font-medium text-zinc-600 mb-1">Tipo <span className="text-danger">*</span></label>
            <select id="ns-tipo" value={tipoId} onChange={e => trocarTipo(Number(e.target.value))} className={INPUT} autoFocus>
              <option value="">Selecione…</option>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ns-data" className="block text-xs font-medium text-zinc-600 mb-1">Data limite <span className="text-danger">*</span></label>
            <input id="ns-data" type="date" value={dataLimite} onChange={e => setDataLimite(e.target.value)} className={INPUT} />
          </div>
        </div>

        <div>
          <span className="block text-xs font-medium text-zinc-600 mb-1">Destinatário <span className="text-danger">*</span></span>
          <div className="flex gap-2 mb-2">
            <button type="button" onClick={() => setDestMode('role')} className={`${PILL} ${destMode === 'role' ? PILL_PRIMARIA : PILL_NEUTRO}`} style={destMode === 'role' ? PILL_PRIMARIA_STYLE : undefined}>Permissão</button>
            <button type="button" onClick={() => setDestMode('usuario')} className={`${PILL} ${destMode === 'usuario' ? PILL_PRIMARIA : PILL_NEUTRO}`} style={destMode === 'usuario' ? PILL_PRIMARIA_STYLE : undefined}>Usuário</button>
          </div>
          {destMode === 'role' ? (
            <select aria-label="Permissão destinatária" value={destRole} onChange={e => setDestRole(e.target.value)} className={INPUT}>
              <option value="">Selecione a permissão…</option>
              {destinatarios.roles.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          ) : (
            <select aria-label="Usuário destinatário" value={destUser} onChange={e => setDestUser(e.target.value)} className={INPUT}>
              <option value="">Selecione o usuário…</option>
              {destinatarios.usuarios.map(u => <option key={u.user_id} value={u.user_id}>{u.email}</option>)}
            </select>
          )}
        </div>

        <div>
          <label htmlFor="ns-desc" className="block text-xs font-medium text-zinc-600 mb-1">Descrição</label>
          <textarea id="ns-desc" rows={2} value={descricao} onChange={e => setDescricao(e.target.value)} className={`${INPUT} resize-none`} placeholder="Contexto do pedido (opcional)" />
        </div>

        {tipo && tipo.campos.length > 0 && (
          <div className="border-t border-zinc-100 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">Campos de {tipo.nome}</p>
            <CamposDinamicos campos={tipo.campos} valores={valores}
              onValor={(id, val) => setValores(p => ({ ...p, [String(id)]: val }))}
              anexos={anexosUI} onAnexoSelect={onAnexoSelect} onAnexoRemove={onAnexoRemove} />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onFechar} className={`${PILL} ${PILL_NEUTRO}`}>Cancelar</button>
          {/* desabilitado enquanto há upload em voo (subindo); erro de anexo é tratado via FaixaMensagem no clique */}
          <button type="button" onClick={enviar} disabled={enviando || subindo} className={`${PILL} ${PILL_PRIMARIA}`} style={PILL_PRIMARIA_STYLE}>
            {(enviando || subindo) && <Loader2 size={13} className="animate-spin" />} Enviar solicitação
          </button>
        </div>
      </div>
    </ModalCentral>
  )
}
