import 'server-only'
import { getServerClient } from '@/lib/supabase/server'
import { buscarUltimaSincronizacaoMonde } from '@/lib/metas/ultima-sincronizacao'
import {
  parseRpc, executivaKpisSchema, metasListarSchema, metasRitmoDiarioSchema,
  metasSubsetorListarSchema, metasSumarioSubsetorSchema,
} from '@/lib/schemas-rpc'
import { format } from 'date-fns'
import { resolverPeriodoMetas, type PresetMetas } from '@/lib/metas/periodo-metas'
import { calcularRitmo, calcularRitmoAgregado, type MetaMensal, type PontoDia } from '@/lib/metas/ritmo'
import {
  aplicarRampaWeddings, somarPorMes,
  type MetaSetorRow, type MetaSubsetorRow,
} from '@/lib/metas/metas-derivadas'
import { rpcMetas } from '@/lib/metas/rpc-metas'
import {
  SETOR_MARCA_COLORS, SUBSETOR_ORDER, SUBSETOR_LABELS, SUBSETOR_NAO_CLASSIFICADO, subsetorColor,
} from '@/lib/config'
import type {
  AcompanhamentoData, NaoClassificado, PainelSetor, PainelSubsetor,
} from '@/components/metas/tipos'

// FONTE ÚNICA DO ACOMPANHAMENTO DE METAS (v5.1.0) — orquestração extraída de
// src/app/metas/page.tsx para ser consumida por DOIS lugares sem duplicar cálculo:
// a página /metas (Acompanhamento) e a pele /metas/tv (Modo TV). Um só motor
// (get_executiva_kpis ×4 + metas_listar + calcularRitmo; Group = soma computada) →
// os números batem por construção nas duas telas. NÃO há terceiro caminho de dados.
// O GUARD de área fica em cada PÁGINA (esta função só busca dado).

// Ordem e identidade dos painéis. Group = barra neutra; setores usam a cor de
// identidade cross-setor (SETOR_MARCA_COLORS). Chave = nome interno do banco.
const PAINEIS: { key: string; display: string; cor: string }[] = [
  { key: 'todos',       display: 'Group',       cor: 'var(--text-muted)' },
  { key: 'Lazer',       display: 'Trips',       cor: SETOR_MARCA_COLORS.Lazer },
  { key: 'Weddings',    display: 'Weddings',    cor: SETOR_MARCA_COLORS.Weddings },
  { key: 'Corporativo', display: 'Corporativo', cor: SETOR_MARCA_COLORS.Corporativo },
]

/**
 * Metas mensais de um setor (Group = soma por mês; pct ponderado por VT).
 *
 * ⚠️ O ramo 'todos' soma TODAS as linhas de `rows` sem olhar setor — é por isso que a
 * derivação de Weddings (rampa da v5.4.4) NÃO pode morar aqui: um `if (key==='Weddings')`
 * neste corpo deixaria o Group somando a linha CRUA de `app.meta_setor` enquanto o card de
 * Weddings mostrava a soma dos subsetores. A rampa é aplicada UMA vez sobre `metaRows`,
 * antes de qualquer painel (ver `aplicarRampaWeddings`), e esta função segue ignorante dela.
 *
 * A média ponderada do 'todos' vive em `somarPorMes` (`metas-derivadas.ts`), definição
 * ÚNICA compartilhada com a Weddings derivada e com o Total do quadro do Cadastro. O ramo
 * de setor continua um `map` direto de propósito: `somarPorMes` seria identidade sobre ele
 * (a UNIQUE do banco garante uma linha por setor/mês), exceto num mês de meta 0 com alvo
 * preenchido, onde devolveria `null` em vez do alvo.
 */
function metasDoSetor(rows: MetaSetorRow[], key: string): MetaMensal[] {
  if (key !== 'todos') {
    return rows
      .filter(r => r.setor_nome === key)
      .map(r => ({ ano: r.ano, mes: r.mes, valorMeta: r.valor_meta, pctReceita: r.pct_receita }))
  }
  return somarPorMes(
    rows.map(r => ({ ano: r.ano, mes: r.mes, valorMeta: r.valor_meta, pctReceita: r.pct_receita })),
  )
}

/** Monta o dado completo do Acompanhamento para um preset de período. Reusado por
 *  /metas e /metas/tv — mesma orquestração, mesmos números. */
export async function carregarAcompanhamento(preset: PresetMetas): Promise<AcompanhamentoData> {
  const { from, to, label } = resolverPeriodoMetas(preset)
  const eParcial = to >= format(new Date(), 'yyyy-MM-dd')

  const db = await getServerClient()

  // Anos que o período toca (1 ou 2) → uma metas_listar por ano.
  const anos = [...new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))])]

  const [kpisResArr, metasResArr, subsResArr, ritmoResArr, sumRes] = await Promise.all([
    Promise.all(PAINEIS.map(p => db.rpc('get_executiva_kpis', {
      p_from: from, p_to: to, p_setor: p.key,
    }))),
    Promise.all(anos.map(a => rpcMetas(db, 'metas_listar', { p_ano: a }))),
    Promise.all(anos.map(a => rpcMetas(db, 'metas_subsetor_listar', { p_ano: a }))),
    Promise.all(PAINEIS.map(p => rpcMetas(db, 'metas_ritmo_diario', { p_from: from, p_to: to, p_setor: p.key }))),
    // Subsetores de Weddings (v5.4.4). Irmã de `get_sumario_subsetor` com o guard das áreas de
    // METAS — o MESMO núcleo, corpo único de propósito: quando o eixo de produto for repontado
    // ao Monde (Scope B) há UM lugar a trocar. A de Performance exige 'performance/weddings', e
    // era por isso que quem tinha só 'metas/acompanhamento' via "Contratos —" no card de
    // Weddings; a irmã conserta isso de carona. Fail-safe: erro/negação → `null`, e a expansão
    // do card simplesmente não aparece.
    rpcMetas(db, 'metas_sumario_subsetor', { p_from: from, p_to: to }),
  ])

  const sumario = parseRpc(metasSumarioSubsetorSchema, sumRes, 'metas_sumario_subsetor')
  const itensSumario = sumario?.subsetores ?? []

  const contratosWeddings: number | null =
    itensSumario.find(s => s.subsetor === 'COMERCIAL')?.n_contratos ?? null

  // "Última atualização" = frescor do espelho Monde = última SINCRONIZAÇÃO (não o último dado
  // mudado). Helper compartilhado com /metas/comparacao (v5.1.9); fail-safe → null (o topo omite).
  const ultimaAtualizacao = await buscarUltimaSincronizacaoMonde()

  // Metas de todos os anos do período (fonte='real', filtrada pela RPC).
  const metaRowsCruas: MetaSetorRow[] = metasResArr.flatMap((res, i) => {
    const parsed = parseRpc(metasListarSchema, res, `metas_listar ${anos[i]}`)
    if (!parsed) return []
    return parsed.metas.map(m => ({
      ano: parsed.ano,
      setor_nome: m.setor_nome,
      mes: m.mes,
      valor_meta: m.valor_meta,
      pct_receita: m.pct_receita,
    }))
  })

  const subRows: MetaSubsetorRow[] = subsResArr.flatMap((res, i) => {
    const parsed = parseRpc(metasSubsetorListarSchema, res, `metas_subsetor_listar ${anos[i]}`)
    if (!parsed) return []
    return parsed.metas.map(m => ({
      subsetor: m.subsetor,
      ano: parsed.ano,
      mes: m.mes,
      valorMeta: m.valor_meta,
      metaContratos: m.meta_contratos,
      pctReceita: m.pct_receita,
    }))
  })

  // A RAMPA, aplicada UMA vez e antes de qualquer painel: a meta de Weddings de um mês passa a
  // ser a soma dos subsetores daquele mês; mês sem subsetor cadastrado mantém a linha antiga de
  // `app.meta_setor`. Feito aqui, o Group (que soma as linhas sem olhar setor) enxerga o MESMO
  // valor que o card de Weddings — se a derivação morasse dentro de `metasDoSetor`, os dois
  // divergiriam por construção.
  const { rows: metaRows, mesesDerivados } = aplicarRampaWeddings(metaRowsCruas, subRows)

  // "hoje" do produto = última venda carregada (global). Sai do painel Group e é a MESMA régua
  // para setores e subsetores — é o que torna o "% esperado" comparável entre eles (o caso de
  // contrato compara os dois caminhos de cálculo campo a campo).
  const primeiroRitmo = parseRpc(metasRitmoDiarioSchema, ritmoResArr[0], 'metas_ritmo_diario ultima')
  const ultimaVenda = primeiroRitmo?.ultima_venda ?? null

  const setores: PainelSetor[] = PAINEIS.map((p, i) => {
    const kpis = parseRpc(executivaKpisSchema, kpisResArr[i], `get_executiva_kpis ${p.key}`)
    const ritmoData = parseRpc(metasRitmoDiarioSchema, ritmoResArr[i], `metas_ritmo_diario ${p.key}`)
    const serie: PontoDia[] = (ritmoData?.serie ?? []).map(d => ({ data: d.data, valor: d.valor_total }))
    const ritmo = calcularRitmo({
      from, to,
      ultimaVenda: ritmoData?.ultima_venda ?? null,
      metas: metasDoSetor(metaRows, p.key),
      serie,
    })
    return {
      key: p.key,
      display: p.display,
      cor: p.cor,
      faturamento:    kpis?.faturamento.valor ?? null,
      receita:        kpis?.receita.valor ?? null,
      margemPct:      kpis?.margem_pct.valor ?? null,
      contratos:      p.key === 'Weddings' ? contratosWeddings : null,
      ritmo,
    }
  })

  // Os 5 subsetores, na ordem canônica. Sem o sumário (erro/negação) a expansão nem existe.
  const subsetores: PainelSubsetor[] | null = sumario
    ? SUBSETOR_ORDER.map(key => {
        const real = itensSumario.find(x => x.subsetor === key)
        const doSubsetor = subRows.filter(r => r.subsetor === key)

        // Par CONVIDADOS: título curto + subtítulo, como a Performance apresenta.
        const ehConvidados = key.startsWith('CONVIDADOS - ')

        const metasReais: MetaMensal[] = doSubsetor.map(r => ({
          ano: r.ano, mes: r.mes, valorMeta: r.valorMeta, pctReceita: r.pctReceita,
        }))

        // COMERCIAL tem DUAS metas (decisão do Yan): a de CONTRATOS governa o topo e a barra do
        // card; a de R$ existe para compor a soma da meta de Weddings. `calcularRitmoAgregado` é
        // agnóstico de unidade, então é a mesma função — só muda o que entra em `valorMeta` e em
        // `realizado`. Nota para o "?" do card: `meta_contratos` mede UM produto
        // ('Contrato de Casamento'), enquanto o R$ de COMERCIAL cobre TRÊS.
        const metasContratos: MetaMensal[] = doSubsetor
          .filter(r => r.metaContratos != null)
          .map(r => ({ ano: r.ano, mes: r.mes, valorMeta: r.metaContratos as number, pctReceita: null }))

        return {
          key,
          display: ehConvidados ? 'Convidados' : (SUBSETOR_LABELS[key] ?? key),
          subtitulo: ehConvidados ? key.slice('CONVIDADOS - '.length) : undefined,
          cor: subsetorColor(key),
          faturamento: real?.faturamento ?? 0,
          receita:     real?.receita ?? 0,
          margemPct:   real?.margem_pct ?? null,
          contratos:   key === 'COMERCIAL' ? (real?.n_contratos ?? 0) : null,
          ritmo: calcularRitmoAgregado({
            from, to, ultimaVenda, metas: metasReais, realizado: real?.faturamento ?? 0,
          }),
          ritmoContratos: key === 'COMERCIAL'
            ? calcularRitmoAgregado({
                from, to, ultimaVenda, metas: metasContratos, realizado: real?.n_contratos ?? 0,
              })
            : null,
        }
      })
    : null

  // O balde fora do mapa. Só existe se houver movimento: há mês com faturamento 0 e receita
  // não-nula (jan/2024: 0,00 / 118,80), então a condição olha os DOIS campos. `produtos` vem
  // vazio se a chave da 0231 ainda não estiver no banco — a faixa mostra o total e diz que o
  // detalhe não está disponível, em vez de desaparecer.
  const itemNC = itensSumario.find(s => s.subsetor === SUBSETOR_NAO_CLASSIFICADO)
  const naoClassificado: NaoClassificado | null =
    itemNC && (itemNC.faturamento !== 0 || itemNC.receita !== 0)
      ? {
          faturamento: itemNC.faturamento,
          receita:     itemNC.receita,
          produtos:    sumario?.produtos_nao_classificados ?? [],
        }
      : null

  return {
    preset, periodoLabel: label, from, to, eParcial, ultimaVenda, ultimaAtualizacao,
    setores, subsetores, naoClassificado, mesesDerivados: [...mesesDerivados],
  }
}
