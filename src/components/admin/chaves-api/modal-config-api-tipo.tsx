'use client'

import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { salvarConfigApiTipo } from '@/app/admin/chaves-api/actions'
import type { Destinatarios, TipoAdmin } from '@/lib/solicitacoes/schemas'
import ModalCentral from '@/components/shared/modal-central'
import Checkbox from '@/components/ui/checkbox'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'

// v5.4.0/Round2 (2026-07-28) — modal de configuração de API de UM tipo, dentro
// da seção "Tipos expostos" (/admin/chaves-api). Substitui a antiga seção "API
// externa" do editor de tipos (@/components/admin/solicitacoes/editor-tipo):
// nome/campos/slug NUNCA são tocados aqui — só exposto_via_api/
// api_roles_permitidas, via admin_solic_tipo_api_config (migration 0215).
//
// ADR-0160: o rótulo é "Equipes que podem RECEBER via API" (destinos válidos
// do disparo externo) — não "criar", que era a semântica enganosa do editor
// antigo (quem cria via API é sempre a plataforma integradora; a role é só o
// destino que ela pode endereçar).

export function ModalConfigApiTipo({
  tipo,
  roles,
  onFechar,
  onSalvo,
}: {
  tipo:     TipoAdmin
  roles:    Destinatarios['roles']
  onFechar: () => void
  onSalvo:  (mensagem: string) => void
}) {
  const [exposto, setExposto] = useState(tipo.exposto_via_api ?? false)
  const [rolesSelecionadas, setRolesSelecionadas] = useState<number[]>(
    () => (tipo.api_roles_permitidas ?? []).map(r => r.id),
  )
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function toggleRole(id: number) {
    setRolesSelecionadas(prev => (prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]))
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    setSalvando(true)
    const res = await salvarConfigApiTipo({ tipoId: tipo.id, exposto, roles: rolesSelecionadas })
    setSalvando(false)
    if (!res.ok) {
      setErro(res.erro ?? 'Não foi possível salvar.')
      return
    }
    onSalvo(`Configuração de API de «${tipo.nome}» salva.`)
  }

  return (
    <ModalCentral
      titulo={`API externa — ${tipo.nome}`}
      subtitulo={tipo.slug ? `Identificador: ${tipo.slug}` : undefined}
      onClose={onFechar}
    >
      {erro && (
        <div role="alert" className="mb-4 rounded-lg border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
          {erro}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-700">
          <Checkbox id="tipo-api-exposto" checked={exposto} onChange={setExposto} aria-label="Exposto via API" />
          <label htmlFor="tipo-api-exposto" className="cursor-pointer">Exposto via API</label>
        </div>
        <p className="text-2xs text-zinc-400">
          Só tipos expostos aparecem na descoberta (<code className="font-mono">GET /api/externo/tipos</code>) e
          aceitam criação por uma plataforma integradora.
        </p>

        <div>
          <p className="mb-2 text-xs font-medium text-zinc-600">Equipes que podem receber via API</p>
          {roles.length === 0 ? (
            <p className="text-xs text-zinc-400">Nenhuma equipe (permissão) cadastrada ainda.</p>
          ) : (
            <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-lg border border-zinc-200 p-3 sm:grid-cols-2">
              {roles.map(role => (
                <div key={role.id} className="flex items-center gap-2 text-sm text-zinc-700">
                  <Checkbox
                    id={`tipo-api-role-${role.id}`}
                    checked={rolesSelecionadas.includes(role.id)}
                    onChange={() => toggleRole(role.id)}
                    aria-label={role.nome}
                  />
                  <label htmlFor={`tipo-api-role-${role.id}`} className="cursor-pointer truncate">
                    {role.nome}
                  </label>
                </div>
              ))}
            </div>
          )}
          <p className="mt-1 text-2xs text-zinc-400">
            Destinos válidos que uma criação via API pode endereçar para este tipo — não quem
            &ldquo;cria&rdquo; (isso é sempre a plataforma integradora, pela chave dela).
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onFechar} className={`${PILL} ${PILL_NEUTRO}`}>
            Cancelar
          </button>
          <button
            type="submit" disabled={salvando}
            className={`${PILL} ${PILL_PRIMARIA}`}
            style={PILL_PRIMARIA_STYLE}
          >
            {salvando && <Loader2 size={14} className="animate-spin" />}
            Salvar
          </button>
        </div>
      </form>
    </ModalCentral>
  )
}
