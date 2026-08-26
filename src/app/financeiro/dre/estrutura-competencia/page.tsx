import Link from 'next/link'
import { ArrowLeft, VenetianMask } from 'lucide-react'
import { requireArea } from '@/lib/auth/sessao'
import { getServerClient } from '@/lib/supabase/server'
import { rpcDre } from '@/lib/dre/rpc-dre'
import { parseRpc } from '@/lib/schemas-rpc'
import { dreCompEstruturaSchema } from '@/lib/dre/schemas'
import EstruturaCompShell from '@/components/financeiro/dre/estrutura-comp-shell'
import { PILL, PILL_GESTAO, PILL_GESTAO_STYLE } from '@/components/shared/botoes'

// Editor da estrutura do regime de COMPETÊNCIA (v5.8.0 · M5) — irmã de
// `/financeiro/dre/estrutura`, acessível pelo botão "Editar estrutura" da TopSection
// "Regime de Competência". Mesma silhueta, mesmo editor, mesmo painel de histórico/desfazer;
// o que muda são as tabelas por baixo (`financeiro.dre_comp_bloco`/`dre_comp_par`, 0260) e,
// por consequência, as RPCs.
//
// ⚠️ O briefing da v5.8.0 dizia "sem editor da árvore nesta versão — curadoria por
// migration". O Yan pediu o editor depois do PR aberto; a curadoria por migration segue
// valendo como a origem do SEED, e daqui para frente a estrutura viva é editável, exatamente
// como já acontece no regime de caixa (onde a estrutura viva divergiu do seed 0205).
//
// UMA chamada só: `dre_comp_estrutura(ano)` traz a estrutura E os totais do ano por linha
// (o caixa precisa de duas — `dre_estrutura` + `get_dre_mensal` — porque lá os totais casam
// por `categoria_id`, que o payload mensal já expõe; aqui a identidade da linha é textual e
// somar por fora exigiria refazer o de-para no cliente).
//
// Fail-safe: falha ao carregar mantém a página viva, com aviso, sem o editor — nunca tela
// em branco nem 500.
//
// RBAC: mesma área 'financeiro/dre' (o prefixo /financeiro/dre em areasDaRota cobre esta
// subrota, como cobre a do caixa).

export default async function DreEstruturaCompetenciaPage() {
  await requireArea('financeiro/dre')

  const db = await getServerClient()

  // ── Provisiona ANTES de ler, e não em paralelo ─────────────────────────────
  // Um par que já está na base mas ainda não tem linha no de-para editável aparece
  // corretamente como "Não classificadas" no demonstrativo (o LEFT JOIN da view garante),
  // mas ficaria INVISÍVEL ao editor — que identifica cada linha por id. Provisionar aqui
  // (idempotente, `NOT EXISTS`) é o que faz o editor nunca ficar cego, e atribui a inserção
  // a quem abriu a tela em vez de gravar um lote anônimo no diário.
  // Achado MÉDIO do `revisor-db` na v5.8.0: a alternativa seria a RPC de leitura tolerar o
  // par sem linha, o que mostraria a órfã e não deixaria mexer nela — pior.
  // Falha aqui NÃO derruba a página: o editor ainda serve para o que já está provisionado.
  const prov = await rpcDre(db, 'provisionar_dre_comp_par')
  if (prov.error) {
    console.error(`[RPC provisionar_dre_comp_par] ${prov.error.message}`)
  }

  // Rejeição não some sem rastro: o sentinel vira um RpcLike com o motivo na `error`, que o
  // parseRpc LOGA com contexto (mesmo padrão do dre/page.tsx e da estrutura do caixa).
  const [estruturaRes] = await Promise.allSettled([
    rpcDre(db, 'dre_comp_estrutura'),
  ]).then(results => results.map(r => (
    r.status === 'fulfilled' ? r.value : { data: null, error: { message: String(r.reason) } }
  )))

  const estrutura = parseRpc(dreCompEstruturaSchema, estruturaRes, 'dre_comp_estrutura')

  // `totais` chega com o id da linha em STRING (chave de objeto JSON) — o editor indexa por
  // número. A conversão é aqui, uma vez, e não dentro do componente compartilhado.
  const totaisPorCategoria: Record<number, number> = {}
  for (const [id, total] of Object.entries(estrutura?.totais ?? {})) {
    totaisPorCategoria[Number(id)] = total
  }

  return (
    <div className="relative">
      {/* Selo de seção — cópia fiel do de `admin/layout.tsx` (DS §Badge de seção). */}
      <span className="absolute right-0 top-0 z-10 inline-flex items-center gap-1.5 rounded-md border border-gestao bg-gestao-soft px-2.5 py-1 text-xs font-semibold text-gestao-fg">
        <VenetianMask size={14} /> Administração
      </span>

      <div className="mb-6">
        {/* `pr-40` só no H1: título longo + selo `absolute` — sem a reserva, em janela
            estreita a primeira linha correria por baixo dele. */}
        <h1 className="pr-40 text-xl font-semibold text-zinc-900">Estrutura do Demonstrativo de Resultado por Competência</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Reordene as linhas e os blocos do demonstrativo por competência
          {estrutura?.ano_totais ? ` · valores de ${estrutura.ano_totais}` : ''}
        </p>
      </div>

      <div className="mb-4">
        <Link href="/financeiro/dre" className={`${PILL} ${PILL_GESTAO}`} style={PILL_GESTAO_STYLE}>
          <ArrowLeft size={13} />
          Voltar
        </Link>
      </div>

      {estrutura ? (
        <EstruturaCompShell estrutura={estrutura} totaisPorCategoria={totaisPorCategoria} />
      ) : (
        <p className="rounded-lg border border-dashed border-wt-border px-4 py-6 text-center text-sm text-text-subtle">
          Não foi possível carregar a estrutura do regime de competência. Recarregue a página.
        </p>
      )}
    </div>
  )
}
