'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import type { Destinatarios, TipoAdmin } from '@/lib/solicitacoes/schemas'
import CardTabela, { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import Badge from '@/components/ui/badge'
import Button from '@/components/ui/button'
import { ModalConfigApiTipo } from './modal-config-api-tipo'

// v5.4.0/Round2 (2026-07-28) — seção "Tipos expostos" de /admin/chaves-api
// ("API externa"): lista TODOS os tipos de solicitação com o estado de
// exposição via API e as equipes destino, e um editor por linha
// (ModalConfigApiTipo) que salva SÓ essa configuração (nome/campos/slug do
// tipo continuam no editor de /admin/solicitacoes, agora só-formulário).

export function TiposExpostos({
  tipos,
  roles,
  onMudou,
}: {
  tipos:   TipoAdmin[]
  roles:   Destinatarios['roles']
  onMudou: (mensagem: string) => void
}) {
  const [editando, setEditando] = useState<TipoAdmin | null>(null)

  const ordenados = [...tipos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <>
      <CardTabela titulo="Tipos expostos" className="mb-5">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-36" />
            <col className="w-28" />
            <col className="w-64" />
            <col className="w-16" />
          </colgroup>
          <thead>
            <tr className="border-b border-zinc-100">
              <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Nome</th>
              <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Slug</th>
              <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Exposto</th>
              <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Equipes que podem receber via API</th>
              <th scope="col" className={`${CARD_TABELA_TH} text-right`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {ordenados.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-zinc-400">
                  Nenhum tipo de solicitação cadastrado ainda.
                </td>
              </tr>
            ) : (
              ordenados.map(tipo => {
                const equipes = tipo.api_roles_permitidas ?? []
                return (
                  <tr key={tipo.id} className="border-b border-zinc-50 last:border-0">
                    <td className="px-3 py-2.5">
                      {/* Sufixo textual "(arquivado)" (achado ALTO do revisor, round 2): status
                          nunca só por cor — mesmo padrão de whitelist-tipos.tsx. `block min-w-0`
                          para o truncate efetivamente recortar (span inline não recorta). */}
                      <span className={`block min-w-0 truncate ${tipo.arquivado ? 'text-zinc-400' : 'text-zinc-800'}`}>
                        {tipo.nome}{tipo.arquivado ? ' (arquivado)' : ''}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="block min-w-0 truncate font-mono text-xs text-zinc-500" title={tipo.slug ?? undefined}>{tipo.slug ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {tipo.exposto_via_api
                        ? <Badge variant="success">Exposto</Badge>
                        : <Badge variant="neutro">Não exposto</Badge>}
                    </td>
                    <td className="px-3 py-2.5">
                      {equipes.length === 0 ? (
                        <span className="text-xs text-zinc-400">Nenhuma equipe</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {equipes.map(r => <Badge key={r.id} variant="neutro">{r.nome}</Badge>)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        variant="icone-borda" tone="neutro"
                        onClick={() => setEditando(tipo)}
                        title="Configurar exposição via API"
                        aria-label={`Configurar exposição via API do tipo ${tipo.nome}`}
                      >
                        <Pencil size={14} />
                      </Button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </CardTabela>

      {editando && (
        <ModalConfigApiTipo
          tipo={editando}
          roles={roles}
          onFechar={() => setEditando(null)}
          onSalvo={mensagem => { setEditando(null); onMudou(mensagem) }}
        />
      )}
    </>
  )
}
