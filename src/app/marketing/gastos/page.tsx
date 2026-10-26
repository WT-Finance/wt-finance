import { redirect } from 'next/navigation'

// v6.4.2 — a página de Despesas de Marketing passou para /marketing/despesas (a área RBAC segue
// 'marketing/gastos'). Esta rota permanece apenas como redirecionamento para links antigos, e
// leva junto a query (`?anos=…`/`?ano=…`) para o link salvo abrir no mesmo recorte.
export default async function GastosMarketingRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const params = new URLSearchParams()
  for (const [chave, valor] of Object.entries(sp)) {
    for (const v of Array.isArray(valor) ? valor : valor === undefined ? [] : [valor]) params.append(chave, v)
  }
  const query = params.toString()
  redirect(query ? `/marketing/despesas?${query}` : '/marketing/despesas')
}
