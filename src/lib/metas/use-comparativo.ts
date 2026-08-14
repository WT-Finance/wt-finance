'use client'

import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { getBrowserClient } from '@/lib/supabase/client'
import { rpcMetas } from '@/lib/metas/rpc-metas'
import { parseRpc, executivaKpisSchema, metasListarSchema, contratosCasamentoMesSchema } from '@/lib/schemas-rpc'
import { metasDoSetor, type MetaRow } from '@/lib/metas/paineis'
import {
  resolverPeriodos, janelaDoPeriodo, mesesDoPeriodo, montarComparativo, chavePeriodo,
  type PresetComparativo, type PeriodoRef, type ComparativoData,
} from '@/lib/metas/comparativo'

// Hook CLIENT-SIDE da seção Comparativo (v5.6.1) — mesmo MOTOR do server
// (carregar-acompanhamento.ts): metas_listar por ano + get_executiva_kpis por
// PERÍODO (a RPC aceita janela arbitrária — 1 chamada por período/ano YoY, não N
// por mês; v5.6.4), parseRpc em tudo, depois montarComparativo (módulo puro)
// compõe o payload de exibição. Roda no browser porque a troca de setor/período
// NÃO deve dar round-trip no RSC da página /metas (a Visão geral acima continua
// servida pelo servidor; só este bloco busca por conta própria).
//
// Duas armadilhas cobertas pela skill contrato-rpc-front: a RPC é *thenable*, NUNCA
// `.catch()` direto nela (por isso o try/catch envolve o fetch inteiro, não a chamada
// isolada); e o helper `rpcMetas` precisa do `this` do client (não reatribuído).
//
// Padrões de react-padroes: loading DERIVADO de uma chave (nunca setLoading síncrono
// no efeito, §1a) e o guard de resposta atrasada compara com o último PEDIDO via ref,
// não com o estado já carregado (a versão "intuitiva" é invertida, §3b).

interface ResultadoComparativo {
  data: ComparativoData | null
  carregando: boolean
  /** Contratos de casamento vendidos no PERÍODO EM FOCO (só Weddings; fonte: espelho
   *  Monde via get_contratos_casamento_mes/0249). null = não se aplica ou fail-safe. */
  assessorias: number | null
}

export function useComparativo(
  setorKey: string,
  preset: PresetComparativo,
  personalizado: PeriodoRef | null,
): ResultadoComparativo {
  const hoje = format(new Date(), 'yyyy-MM-dd')
  const periodos = resolverPeriodos(preset, hoje, personalizado)
  const chaveAtual = `${setorKey}|${preset}|${periodos.map(chavePeriodo).join(',')}`

  const [estado, setEstado] = useState<{ chave: string; data: ComparativoData | null; assessorias: number | null }>({
    chave: '',
    data: null,
    assessorias: null,
  })
  const pedidoRef = useRef<string | null>(null)

  useEffect(() => {
    // Recomputado aqui (a partir só do que está nas deps) em vez de reusar `periodos`/
    // `chaveAtual` do corpo do hook — evita que o efeito precise desses dois na lista
    // de deps (o array `periodos` muda de referência a cada render).
    const periodosPedido = resolverPeriodos(preset, hoje, personalizado)
    const chavePedido = `${setorKey}|${preset}|${periodosPedido.map(chavePeriodo).join(',')}`
    pedidoRef.current = chavePedido

    async function carregar() {
      const db = getBrowserClient()

      // O anel é a meta do PRÓPRIO período em foco (ajuste 11/08) — os anos das
      // metas são exatamente os anos tocados pelos meses dos períodos da comparação.
      const anos = [...new Set(periodosPedido.flatMap(p => mesesDoPeriodo(p).map(m => m.ano)))]

      // "Meta de Assessorias" (v5.6.2): só para Weddings, contratos do PERÍODO EM FOCO.
      const foco = periodosPedido[periodosPedido.length - 1]
      const janelaFoco = janelaDoPeriodo(foco)

      const [metasResArr, kpisResArr, assessoriasRes] = await Promise.all([
        Promise.all(anos.map(a => rpcMetas(db, 'metas_listar', { p_ano: a }))),
        Promise.all(periodosPedido.map(p => {
          const { from, to } = janelaDoPeriodo(p)
          return db.rpc('get_executiva_kpis', { p_from: from, p_to: to, p_setor: setorKey })
        })),
        setorKey === 'Weddings'
          ? rpcMetas(db, 'get_contratos_casamento_mes', { p_from: janelaFoco.from, p_to: janelaFoco.to })
          : Promise.resolve(null),
      ])

      if (pedidoRef.current !== chavePedido) return // um pedido mais novo assumiu

      const metaRows: MetaRow[] = metasResArr.flatMap((res, i) => {
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

      const realizadoPorPeriodo = new Map<string, number | null>(
        periodosPedido.map((p, i) => {
          const kpis = parseRpc(executivaKpisSchema, kpisResArr[i], `get_executiva_kpis ${chavePeriodo(p)}`)
          return [chavePeriodo(p), kpis?.faturamento.valor ?? null]
        }),
      )

      const metas = metasDoSetor(metaRows, setorKey)
      const data = montarComparativo({ periodos: periodosPedido, hoje, metas, realizadoPorPeriodo })

      const assessorias = assessoriasRes
        ? parseRpc(contratosCasamentoMesSchema, assessoriasRes, `get_contratos_casamento_mes ${chavePeriodo(foco)}`)?.n_contratos ?? null
        : null

      setEstado({ chave: chavePedido, data, assessorias })
    }

    void carregar().catch((e: unknown) => {
      // NUNCA silencioso: erro real (rede/runtime) é distinto de "mês sem vendas" —
      // silêncio equivalente custou 18 dias na v5.3.5 (achado ALTO do revisor).
      console.error('[Comparativo] falha ao carregar', e)
      if (pedidoRef.current !== chavePedido) return
      setEstado({ chave: chavePedido, data: null, assessorias: null })
    })
  }, [setorKey, preset, personalizado, hoje])

  return { data: estado.data, carregando: estado.chave !== chaveAtual, assessorias: estado.assessorias }
}
