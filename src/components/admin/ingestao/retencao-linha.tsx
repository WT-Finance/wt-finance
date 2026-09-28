'use client'

import { Archive } from 'lucide-react'
import { Card } from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import { Relativo } from './relativo'
import type { IngestaoPainel } from './tipos'

// Limpeza do arquivo cru (v6.0.0/M6b — errata 3(b)): o cru sai do armazenamento depois de 3 meses,
// e em 7 dias se nunca virou carga. O dado carregado no banco não expira. Só LEITURA aqui — ligar o
// cron é passo do deploy (M9), por SQL, como documentado na migration 0282.

type Ultima = NonNullable<IngestaoPainel['retencao_ultima']>

const ROTULO_STATUS: Record<Ultima['status'], string> = {
  ok: 'OK',
  simulado: 'Simulação',
  recusado: 'Recusada por segurança',
  erro: 'Erro',
}

function resumo(u: Ultima): string {
  const total = u.expirados + u.orfaos
  const verbo = u.status === 'simulado' ? 'apagaria' : u.status === 'ok' ? 'apagou' : 'não apagou'
  if (u.status === 'ok' || u.status === 'simulado') {
    if (total === 0) return 'nada a apagar'
    return `${verbo} ${total} arquivo(s) — ${u.expirados} expirado(s), ${u.orfaos} sem carga`
  }
  return verbo
}

export function RetencaoLinha({
  ultima,
  cronAtivo,
}: {
  ultima: IngestaoPainel['retencao_ultima']
  cronAtivo: boolean | null | undefined
}) {
  const ligada = cronAtivo === true
  return (
    <Card>
      <div className="flex items-center gap-2">
        <Archive className="h-4 w-4 text-zinc-500" aria-hidden />
        <h2 className="text-sm font-semibold text-zinc-900">Limpeza do armazenamento</h2>
        <Badge variant={ligada ? 'success' : 'neutro'}>{ligada ? 'Ligada' : 'Desligada'}</Badge>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Última rodada:{' '}
        {ultima ? (
          <>
            <Relativo iso={ultima.concluido_em} /> · {ROTULO_STATUS[ultima.status]} · {resumo(ultima)}
          </>
        ) : 'nunca rodou'}
      </p>
      {ultima?.erro && (ultima.status === 'erro' || ultima.status === 'recusado') && (
        <p className={`mt-1 text-xs ${ultima.status === 'erro' ? 'text-danger' : 'text-warning-deep'}`}>{ultima.erro}</p>
      )}
      <p className="mt-2 max-w-3xl text-xs text-zinc-500">
        Uma vez por dia, o arquivo original de cada carga sai do armazenamento depois de 3 meses — e em 7
        dias, se nunca virou carga (conferência cancelada, reprocesso não confirmado). O dado carregado no
        banco não expira. Depois de 3 meses não é mais possível reprocessar a partir do arquivo original.
      </p>
    </Card>
  )
}
