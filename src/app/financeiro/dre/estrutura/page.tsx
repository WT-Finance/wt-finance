import Link from 'next/link'
import { ArrowLeft, VenetianMask } from 'lucide-react'
import { requireArea } from '@/lib/auth/sessao'
import { getServerClient } from '@/lib/supabase/server'
import { rpcDre } from '@/lib/dre/rpc-dre'
import { parseRpc } from '@/lib/schemas-rpc'
import { dreEstruturaSchema, dreMensalSchema } from '@/lib/dre/schemas'
import { hojeSP } from '@/lib/fmt'
import EstruturaShell from '@/components/financeiro/dre/estrutura-shell'
import { PILL, PILL_GESTAO, PILL_GESTAO_STYLE } from '@/components/shared/botoes'

// Editor da ESTRUTURA VIVA da DRE (v5.3.0 · Onda 2 · M5) — página própria, acessível pelo
// botão "Editar estrutura" da DRE. Editor REAL sobre `dre_estrutura`/`dre_estrutura_salvar`
// (padrão Metas: edição local + salvar em lote) + diário/undo (0206, painel de histórico
// abaixo) + trava otimista pelo token — substitui o mockup do M0.
//
// `totaisPorCategoria` vem de `get_dre_mensal` do ANO CORRENTE (fuso SP via `hojeSP`) — SÓ
// para alimentar os efeitos dos MODAIS de mover/excluir (o corpo do editor não mostra
// valores desde o refino pós-checkpoint); a estrutura em si (blocos/mapa/bandeja)
// é 100% de `dre_estrutura` (fetch em paralelo, tolerante a falha parcial: sem os totais o
// editor ainda funciona, com os valores a 0 — "categoria sem valor → 0").
//
// Fail-safe: falha ao carregar a ESTRUTURA mantém a página viva, com aviso, sem o editor
// (nunca tela em branco nem 500).
//
// RBAC: mesma área 'financeiro/dre' da DRE (permissão única ver+editar — decisão firme;
// o prefixo /financeiro/dre em areasDaRota já cobre esta subrota).
//
// Cabeçalho (v5.3.0, refino pós-checkpoint): H1 + subtítulo no padrão das telas de
// administração (mesma tipografia de /admin/uploads), no lugar da barra recolhível
// TopSection — esta é uma tela de manutenção, não uma seção da DRE. O selo "Administração"
// é REPLICADO aqui (a página não está sob /admin, então não herda o de admin/layout.tsx):
// mesma marcação/tokens --gestao*, `absolute` no top-right e alinhado à altura do H1 —
// por isso o container raiz é `relative` (o respiro px/py continua vindo do <main>).

export default async function DreEstruturaPage() {
  await requireArea('financeiro/dre')

  const db  = await getServerClient()
  const ano = Number(hojeSP().slice(0, 4))

  // Rejeição não some sem rastro: o sentinel vira um RpcLike com o motivo na `error`,
  // que o parseRpc LOGA com contexto (mesmo padrão do dre/page.tsx).
  const [estruturaRes, mensalRes] = await Promise.allSettled([
    rpcDre(db, 'dre_estrutura'),
    rpcDre(db, 'get_dre_mensal', { p_ano: ano }),
  ]).then(results => results.map(r => (
    r.status === 'fulfilled' ? r.value : { data: null, error: { message: String(r.reason) } }
  )))

  const estrutura = parseRpc(dreEstruturaSchema, estruturaRes, 'dre_estrutura')
  const mensal    = parseRpc(dreMensalSchema, mensalRes, 'get_dre_mensal')

  const totaisPorCategoria: Record<number, number> = {}
  for (const linha of mensal?.linhas ?? []) {
    if (linha.t === 'cat' && linha.categoria_id != null) totaisPorCategoria[linha.categoria_id] = linha.total
  }
  for (const linha of mensal?.bandeja ?? []) {
    totaisPorCategoria[linha.categoria_id] = linha.total
  }

  return (
    <div className="relative">
      {/* Selo de seção — cópia fiel do de `admin/layout.tsx` (DS §Badge de seção). */}
      <span className="absolute right-0 top-0 z-10 inline-flex items-center gap-1.5 rounded-md border border-gestao bg-gestao-soft px-2.5 py-1 text-xs font-semibold text-gestao-fg">
        <VenetianMask size={14} /> Administração
      </span>

      <div className="mb-6">
        {/* `pr-40` só no H1: este título é longo (bem mais que os das telas /admin) e o selo é
            `absolute` — sem a reserva, em janela estreita a primeira linha correria por baixo dele. */}
        <h1 className="pr-40 text-xl font-semibold text-zinc-900">Estrutura do Demonstrativo de Resultado por Fluxo de Caixa</h1>
        <p className="text-sm text-zinc-400 mt-0.5">Reordene categorias e blocos do demonstrativo por fluxo de caixa</p>
      </div>

      <div className="mb-4">
        <Link href="/financeiro/dre" className={`${PILL} ${PILL_GESTAO}`} style={PILL_GESTAO_STYLE}>
          <ArrowLeft size={13} />
          Voltar
        </Link>
      </div>

      {estrutura ? (
        <EstruturaShell estrutura={estrutura} totaisPorCategoria={totaisPorCategoria} />
      ) : (
        <p className="rounded-lg border border-dashed border-wt-border px-4 py-6 text-center text-sm text-text-subtle">
          Não foi possível carregar a estrutura da DRE. Recarregue a página.
        </p>
      )}
    </div>
  )
}
