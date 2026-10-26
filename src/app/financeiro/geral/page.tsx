import { requireArea } from '@/lib/auth/sessao'
import { hojeSP } from '@/lib/fmt'
import { anosSelecionados } from '@/lib/financeiro-geral/periodo'
import { podeGerirAntecipacoes } from '@/lib/financeiro-geral/gestao'
import { fixtureGeral, type EstadoFixture } from '@/lib/financeiro-geral/fixture'
import type { ParamsAnos } from '@/lib/marketing/anos'
import GeralContent from '@/components/financeiro/geral/geral-content'

// Financeiro · Geral v2 (v6.5.0) — ⚠️ MOCKUP DO GATE 1: as três seções com conteúdo (Recebíveis, Perdas e
// prejuízos, Antecipações) são alimentadas pela FIXTURE (`fixture.ts`, números fictícios no formato do
// contrato de `schemas.ts`), não pelas RPCs. Os componentes são os de produção; na M3 só a fonte do dado
// troca (as leituras por RPC, cada uma falhando sozinha, voltam aqui). O registro de antecipações (painel
// e modais) continua lendo e gravando o banco real — ele não muda nesta versão.
//
// Estados do mockup pela URL: `?estado=vazio` (sem carga, anos zerados) e `?estado=erro` (toda leitura
// falha); sem o parâmetro, o estado normal. Anos: `?anos=2025,2026`, como na página real.
export const dynamic = 'force-dynamic'

type Params = ParamsAnos & { estado?: string | string[] }

function estadoDaUrl(v: string | string[] | undefined): EstadoFixture {
  const s = Array.isArray(v) ? v[0] : v
  return s === 'vazio' || s === 'erro' ? s : 'normal'
}

export default async function GeralPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sessao = await requireArea('financeiro/geral')

  const sp = await searchParams
  // "Hoje" NO FUSO DE SÃO PAULO e no SERVIDOR — o runtime roda em UTC e o cliente não pode usar relógio
  // próprio (mismatch de hidratação; perto da virada do ano erraria o ano corrente).
  const hoje = hojeSP()
  const anos = anosSelecionados(sp, parseInt(hoje.slice(0, 4), 10))

  const dados = fixtureGeral(estadoDaUrl(sp.estado), hoje, anos, podeGerirAntecipacoes(sessao.permissoes))

  return <GeralContent dados={dados} mockup />
}
