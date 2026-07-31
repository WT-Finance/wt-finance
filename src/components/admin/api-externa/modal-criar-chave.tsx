'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Copy, Loader2 } from 'lucide-react'
import { criarChaveApi } from '@/app/admin/api-externa/actions'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import ModalCentral from '@/components/shared/modal-central'
import { Input } from '@/components/ui/field'

// v5.4.0/M2 (Round6, decisão do Yan 31/07: "retirar a whitelist de tipos da
// chave de API, cada chave de API deve ter acesso a todos os tipos expostos,
// não precisamos de tanta complexidade de restrições" — migration 0224) —
// modal de criar chave de API: um único campo, "Referência" (era "Plataforma",
// com whitelist de tipos e parágrafo de ajuda embaixo — os três saíram). Em
// sucesso, mostra o SEGREDO em claro UMA VEZ (mesmo padrão da senha
// provisória — modal-convidar.tsx, admin/acessos): depois de fechar este
// modal, o segredo não é recuperável (só revogar e criar outra chave).

interface Sucesso {
  plataforma: string
  segredo:    string
}

export function ModalCriarChave({
  onFechar,
}: {
  onFechar: () => void
}) {
  const router = useRouter()
  const [plataforma, setPlataforma] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<Sucesso | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    if (!plataforma.trim()) {
      setErro('Informe a referência.')
      return
    }
    setEnviando(true)
    const res = await criarChaveApi({ plataforma })
    setEnviando(false)
    if (!res.ok) {
      setErro(res.erro)
      return
    }
    setSucesso({ plataforma: res.plataforma, segredo: res.segredo })
    router.refresh()
  }

  async function handleCopiar() {
    if (!sucesso) return
    try {
      await navigator.clipboard.writeText(sucesso.segredo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setErro('Não foi possível copiar automaticamente — selecione o segredo e copie manualmente.')
    }
  }

  return (
    <ModalCentral titulo="Nova chave de API" onClose={onFechar}>
      {erro && (
        <div role="alert" className="mb-4 rounded-lg border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
          {erro}
        </div>
      )}

      {!sucesso ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="chave-referencia" className="block text-xs font-medium text-zinc-600 mb-1">
              Referência <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <Input
              id="chave-referencia" type="text" required autoFocus value={plataforma}
              onChange={e => setPlataforma(e.target.value)}
              placeholder="Ex.: Monde, ClickUp, App do fornecedor…"
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onFechar} className={`${PILL} ${PILL_NEUTRO}`}>
              Cancelar
            </button>
            <button
              type="submit" disabled={enviando}
              className={`${PILL} ${PILL_PRIMARIA}`}
              style={PILL_PRIMARIA_STYLE}
            >
              {enviando && <Loader2 size={14} className="animate-spin" />}
              {enviando ? 'Criando…' : 'Criar chave'}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div role="status" className="rounded-lg border border-success bg-success-bg px-3 py-2 text-sm text-success">
            Chave de <span className="font-medium">{sucesso.plataforma}</span> criada.
          </div>

          <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning bg-warning-bg px-3 py-2 text-xs text-warning">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Guarde este segredo agora — ele NÃO será mostrado de novo. Se perdê-lo, a única saída é
              revogar esta chave e criar uma nova.
            </span>
          </div>

          <div>
            <label htmlFor="chave-segredo" className="block text-xs font-medium text-zinc-600 mb-1">
              Segredo da chave (repasse ao integrador)
            </label>
            <div className="flex gap-2">
              <input
                id="chave-segredo" type="text" readOnly value={sucesso.segredo}
                onFocus={e => e.target.select()}
                className="foco-neutro w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-mono text-zinc-700 outline-none"
              />
              <button
                type="button" onClick={handleCopiar}
                className={`shrink-0 ${PILL} ${PILL_PRIMARIA}`}
                style={PILL_PRIMARIA_STYLE}
              >
                {copiado ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="button" onClick={onFechar} className={`${PILL} ${PILL_PRIMARIA}`} style={PILL_PRIMARIA_STYLE}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </ModalCentral>
  )
}
