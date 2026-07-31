'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { salvarConfigApiTipo } from '@/app/admin/api-externa/actions'
import type { TipoAdmin } from '@/lib/solicitacoes/schemas'
import CardTabela, { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import Checkbox from '@/components/ui/checkbox'

// v5.4.0/Round3 (2026-07-29) — seção "Tipos Expostos" de /admin/api-externa
// ("API externa"): lista TODOS os tipos de solicitação com um toggle DIRETO
// de exposição via API. DECISÃO DO YAN: a lista "Equipes que podem receber
// via API" morreu — qualquer equipe cadastrada pode ser destinatário de
// qualquer tipo exposto (o `destinatario` do disparo continua obrigatório e
// validado contra app.rbac_roles, só não é mais restrito por tipo). Por isso
// a configuração de um tipo deixou de precisar de modal — é só um booleano
// (exposto_via_api), salvo imediatamente ao alternar o Checkbox da linha
// (mesmo espírito do toggle "arquivado" de tipos-content.tsx, mas sem modal
// intermediário: aqui não há mais nada a escolher além de ligar/desligar).
// v5.4.0/Round4 (2026-07-30, pedido do Yan) — título com E maiúsculo ("Tipos
// Expostos") e a seção passou a vir DEPOIS de "Chaves de API" na página (ver
// chaves-api-content.tsx); a margem inferior (mb-5) migrou para lá.

type ResultadoMsg = { tipo: 'sucesso' | 'erro'; texto: string }

export function TiposExpostos({
  tipos,
  onMudou,
}: {
  tipos:   TipoAdmin[]
  onMudou: (msg: ResultadoMsg) => void
}) {
  // Linha em salvamento (desabilita o Checkbox + Loader2 girando) — mesmo
  // padrão de `ocupado` em tipos-content.tsx.
  const [salvandoId, setSalvandoId] = useState<number | null>(null)

  const ordenados = [...tipos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  async function handleToggle(tipo: TipoAdmin, novoValor: boolean) {
    setSalvandoId(tipo.id)
    const res = await salvarConfigApiTipo(tipo.id, novoValor)
    setSalvandoId(null)
    if (!res.ok) {
      onMudou({ tipo: 'erro', texto: res.erro ?? `Não foi possível atualizar a exposição de «${tipo.nome}».` })
      return
    }
    onMudou({
      tipo: 'sucesso',
      texto: novoValor
        ? `Tipo «${tipo.nome}» exposto via API.`
        : `Tipo «${tipo.nome}» deixou de ser exposto via API.`,
    })
  }

  return (
    <CardTabela titulo="Tipos Expostos">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col />
          <col className="w-40" />
          <col className="w-28" />
        </colgroup>
        <thead>
          <tr className="border-b border-zinc-100">
            <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Nome</th>
            <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Slug</th>
            <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Exposto</th>
          </tr>
        </thead>
        <tbody>
          {ordenados.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-3 py-6 text-center text-sm text-zinc-400">
                Nenhum tipo de solicitação cadastrado ainda.
              </td>
            </tr>
          ) : (
            ordenados.map(tipo => {
              const salvando = salvandoId === tipo.id
              return (
                <tr key={tipo.id} className={`border-b border-zinc-50 last:border-0 ${salvando ? 'opacity-60' : ''}`}>
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
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`tipo-exposto-${tipo.id}`}
                        checked={tipo.exposto_via_api ?? false}
                        onChange={valor => handleToggle(tipo, valor)}
                        disabled={salvando}
                        aria-label={`Exposto via API — ${tipo.nome}`}
                      />
                      {salvando && <Loader2 size={14} className="animate-spin text-zinc-400" aria-hidden="true" />}
                    </div>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </CardTabela>
  )
}
