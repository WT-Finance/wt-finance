'use client'

import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { getBrowserClient } from '@/lib/supabase/client'
import { rpcMetas } from '@/lib/metas/rpc-metas'
import { parseRpc, executivaKpisSchema, metasListarSchema } from '@/lib/schemas-rpc'
import { metasDoSetor, type MetaRow } from '@/lib/metas/paineis'
import {
  resolverMeses, janelaDoMes, montarComparativo, chaveMes,
  type PresetComparativo, type MesRef, type ComparativoData,
} from '@/lib/metas/comparativo'

// Hook CLIENT-SIDE da seção Comparativo (v5.6.1) — mesmo MOTOR do server
// (carregar-acompanhamento.ts): metas_listar por ano + get_executiva_kpis por mês,
// parseRpc em tudo, depois montarComparativo (módulo puro) compõe o payload de
// exibição. Roda no browser porque a troca de setor/período/meses NÃO deve dar
// round-trip no RSC da página /metas (a Visão geral acima continua servida pelo
// servidor; só este bloco busca por conta própria).
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
}

export function useComparativo(
  setorKey: string,
  preset: PresetComparativo,
  personalizados: MesRef[],
): ResultadoComparativo {
  const hoje = format(new Date(), 'yyyy-MM-dd')
  const meses = resolverMeses(preset, hoje, personalizados)
  const chaveAtual = `${setorKey}|${preset}|${meses.map(chaveMes).join(',')}`

  const [estado, setEstado] = useState<{ chave: string; data: ComparativoData | null }>({
    chave: '',
    data: null,
  })
  const pedidoRef = useRef<string | null>(null)

  useEffect(() => {
    // Recomputado aqui (a partir só do que está nas deps) em vez de reusar `meses`/
    // `chaveAtual` do corpo do hook — evita que o efeito precise desses dois na lista
    // de deps (o array `meses` muda de referência a cada render).
    const mesesPedido = resolverMeses(preset, hoje, personalizados)
    const chavePedido = `${setorKey}|${preset}|${mesesPedido.map(chaveMes).join(',')}`
    pedidoRef.current = chavePedido

    async function carregar() {
      const db = getBrowserClient()

      // O anel agora é a meta do PRÓPRIO mês em foco (ajuste 11/08) — os anos das
      // metas são exatamente os anos dos meses da comparação.
      const anos = [...new Set(mesesPedido.map(m => m.ano))]

      const [metasResArr, kpisResArr] = await Promise.all([
        Promise.all(anos.map(a => rpcMetas(db, 'metas_listar', { p_ano: a }))),
        Promise.all(mesesPedido.map(m => {
          const { from, to } = janelaDoMes(m)
          return db.rpc('get_executiva_kpis', { p_from: from, p_to: to, p_setor: setorKey })
        })),
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

      const realizadoPorMes = new Map<string, number | null>(
        mesesPedido.map((m, i) => {
          const kpis = parseRpc(executivaKpisSchema, kpisResArr[i], `get_executiva_kpis ${chaveMes(m)}`)
          return [chaveMes(m), kpis?.faturamento.valor ?? null]
        }),
      )

      const metas = metasDoSetor(metaRows, setorKey)
      const data = montarComparativo({ meses: mesesPedido, hoje, metas, realizadoPorMes })

      setEstado({ chave: chavePedido, data })
    }

    void carregar().catch((e: unknown) => {
      // NUNCA silencioso: erro real (rede/runtime) é distinto de "mês sem vendas" —
      // silêncio equivalente custou 18 dias na v5.3.5 (achado ALTO do revisor).
      console.error('[Comparativo] falha ao carregar', e)
      if (pedidoRef.current !== chavePedido) return
      setEstado({ chave: chavePedido, data: null })
    })
  }, [setorKey, preset, personalizados, hoje])

  return { data: estado.data, carregando: estado.chave !== chaveAtual }
}
