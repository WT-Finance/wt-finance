import { z } from 'zod'
import { requireArea } from '@/lib/auth/sessao'
import { getServerClient } from '@/lib/supabase/server'
import { buscarUltimaSincronizacaoMonde } from '@/lib/metas/ultima-sincronizacao'
import { rpcMetas } from '@/lib/metas/rpc-metas'
import { parseRpc } from '@/lib/schemas-rpc'
import ComparacaoContent from '@/components/metas/comparacao-content'
import MetasAutoRefresh from '@/components/metas/metas-auto-refresh'

// Comparação Upload × Monde (v5.1.2/M6) — tela SÓ-LEITURA de validação, mês a mês,
// entre a fonte que hoje alimenta as Metas (upload) e a ingestão paralela da API
// Monde (ver investigação project_monde_api_metas_investigacao). NÃO há ação de
// virada aqui — é auditoria/QA da paridade dos dois caminhos, consumindo a RPC
// `monde_comparacao_mensal` (SECURITY DEFINER, já aplicada). Mesma área de leitura
// do Acompanhamento (OR — qualquer uma das duas libera).
//
// Schema reflete o retorno REAL da RPC (FULL OUTER JOIN upload×monde por mês×macro;
// o lado ausente já chega zerado do banco, não precisa de .optional() aqui).
const linhaComparacaoSchema = z.object({
  mes:           z.string(),
  macro:         z.string(),
  upload_fat:    z.number(),
  upload_rec:    z.number(),
  upload_vendas: z.number(),
  monde_fat:     z.number(),
  monde_rec:     z.number(),
  monde_vendas:  z.number(),
}).passthrough()

const comparacaoMensalSchema = z.array(linhaComparacaoSchema)

/** 'yyyy-MM-dd' de HOJE no fuso de São Paulo (en-CA formata em ISO ordenável). */
function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

export default async function ComparacaoMondePage() {
  await requireArea(['metas/acompanhamento', 'metas'])

  const from = '2023-01-01'
  const to = hojeSP()

  const db = await getServerClient()
  const res = await rpcMetas(db, 'monde_comparacao_mensal', { p_from: from, p_to: to })
  // RPC fora do contrato ou drift de shape → nunca 500: degrada para vazio (a UI
  // mostra o aviso "sem dados", igual a um período legitimamente sem ingestão).
  const linhas = parseRpc(comparacaoMensalSchema, res, 'monde_comparacao_mensal') ?? []

  // "Última atualização" = frescor do espelho Monde (última sincronização) — mesmo helper do
  // Acompanhamento. Fail-safe → null.
  const ultimaSincronizacao = await buscarUltimaSincronizacaoMonde()

  return (
    <div>
      {/* Auto-refresh (v5.1.9): a comparação também é Server Component → converge ao dado do
          Monde (cron ~15min) sem reload, como o Acompanhamento (5min). */}
      <MetasAutoRefresh intervaloMs={300_000} />
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Comparação - Upload manual | API Monde</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-zinc-400">
          Comparação visual (read-only) dos dados provenientes do mecanismo de upload manual frente
          aos dados provenientes da integração com a API do Monde.
        </p>
      </div>
      <ComparacaoContent linhas={linhas} ultimaSincronizacao={ultimaSincronizacao} />
    </div>
  )
}
