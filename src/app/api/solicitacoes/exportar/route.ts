import * as XLSX from '@e965/xlsx'
import { requireAreaApi } from '@/lib/auth/sessao'
import { getCaixa } from '@/lib/solicitacoes/rpc'
import { hojeSP } from '@/lib/solicitacoes/format'
import { montarExportacaoSolicitacoes, nomeArquivoExportacao } from '@/lib/solicitacoes/exportar'

export const dynamic = 'force-dynamic'

// v6.3.1 — Exportar TODAS as solicitações para Excel (decisão do Yan, 08/10/2026).
//
// Gestão-only nas duas pontas: o guard exige a área `solicitacoes`, e `solic_caixa('todas')`
// recusa no banco quem não a tem (0128). É a MESMA leitura da visão "Ver todas" — mesma RPC,
// mesmo `parseRpc` —, então a planilha não pode ver nada que a tela de gestão não veja.
// A lista é sempre a completa: a rota não recebe escopo, visão nem busca da tela.
//
// A planilha nasce no SERVIDOR (e não no cliente, como a da DRE) porque a tela nem sempre
// tem a lista inteira na mão — na "Minha caixa" ela vem recortada pelo destinatário.
export async function GET(): Promise<Response> {
  const sessao = await requireAreaApi('solicitacoes')
  if (sessao instanceof Response) return sessao

  const lista = await getCaixa('todas')
  if (lista === null) {
    return Response.json({ error: 'Não foi possível carregar as solicitações.' }, { status: 500 })
  }

  const wb = XLSX.utils.book_new()
  for (const aba of montarExportacaoSolicitacoes(lista, new Date())) {
    const ws = XLSX.utils.aoa_to_sheet(aba.linhas)
    ws['!cols'] = aba.larguras.map(wch => ({ wch }))
    if (aba.filtro && ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] }
    XLSX.utils.book_append_sheet(wb, ws, aba.nome)
  }
  const arquivo: Uint8Array = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true })

  return new Response(new Uint8Array(arquivo), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomeArquivoExportacao(hojeSP())}"`,
      'Cache-Control': 'no-store',
    },
  })
}
