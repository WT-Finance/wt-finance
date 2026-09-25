// Cliente HTTP do REPROCESSO (v6.0.0/M6, anexo §7) — roda no NAVEGADOR, mesmo padrão do passo 3
// de `admin/uploads/ingestao-cliente.ts#processarCarga` (não editado por esta missão: outra
// missão pode estar com esse arquivo em mãos). A ÚNICA diferença do upload manual é o cabeçalho
// `x-ingestao-origem: reprocesso` — os tipos de erro/resposta são os MESMOS (reexportados do
// módulo irmão), então o card e o modal de confirmação (`ModalConfirmacaoUpload`) funcionam sem
// nenhuma adaptação.
//
// O reprocesso PASSA pela conferência e pelo modal de confirmação como toda carga humana nesta
// versão (anexo §7): o objeto cru já foi copiado para um `carga_id` NOVO pela server action
// `prepararReprocessoAction` (que roda com service_role — o Storage e `ingestao_carga_obter` são
// service_role-only); esta função só chama o passo 3 (`confirmar:false` depois `confirmar:true`)
// com a SESSÃO do usuário, exatamente como o card de upload já faz.

import type { ArquivoDaCarga, RespostaCarga } from '@/app/admin/uploads/ingestao-cliente'
import { ErroRotaIngestao } from '@/app/admin/uploads/ingestao-cliente'
import type { BaseIngestao } from '@/lib/ingestao/bases'

async function lerRespostaJson(res: Response): Promise<unknown> {
  try { return await res.json() } catch { return null }
}

function extrairErro(json: unknown): { codigo: string; mensagem: string; detalhe?: unknown } {
  if (json && typeof json === 'object' && 'erro' in json) {
    const e = (json as { erro?: { codigo?: string; mensagem?: string; detalhe?: unknown } }).erro
    if (e?.mensagem) return { codigo: e.codigo ?? 'ERRO_DESCONHECIDO', mensagem: e.mensagem, detalhe: e.detalhe }
  }
  return { codigo: 'ERRO_DESCONHECIDO', mensagem: 'Erro inesperado do servidor. Tente novamente.' }
}

/** Passo 3 do contrato, origem `reprocesso` — mesmo corpo de `processarCarga`, cabeçalho
 *  distinto (é o que a rota grava em `ingestao.carga.origem`, para a tela/auditoria saberem
 *  que aquela carga não veio de um upload manual). */
export async function processarCargaReprocesso(
  base: BaseIngestao,
  args: {
    readonly cargaId: string
    readonly arquivos: readonly ArquivoDaCarga[]
    readonly extraidoEm: string
    readonly confirmar: boolean
  },
): Promise<RespostaCarga> {
  const res = await fetch(`/api/ingestao/${base}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ingestao-origem': 'reprocesso',
      'x-ingestao-idempotencia': crypto.randomUUID(),
    },
    body: JSON.stringify({
      carga_id: args.cargaId,
      arquivos: args.arquivos,
      extraido_em: args.extraidoEm,
      confirmar: args.confirmar,
    }),
  })
  const json = await lerRespostaJson(res)
  if (!res.ok) throw new ErroRotaIngestao(extrairErro(json))
  return json as RespostaCarga
}
