import type { IndicadorTopo } from '@/lib/financeiro-geral/faixa-topo'
import { Tile } from './comum'

// A faixa de 3 indicadores no topo (Inadimplência, Prejuízos, Antecipações — v6.5.0). O que cada tile mostra
// (e por quê) está em `faixa-topo.ts`; aqui só se desenha. Cada tile degrada sozinho (`vazio`/`erro` próprios,
// inv. 11): o `Tile` já desenha a mensagem no lugar do número, sem derrubar os vizinhos. Um tile por seção com
// conteúdo — Vendas e Cartões ganham o seu quando forem preenchidas, nunca um tile vazio.

export default function FaixaIndicadores({ indicadores }: { indicadores: readonly IndicadorTopo[] }) {
  return (
    <section aria-label="Indicadores" className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {indicadores.map(i => (
        <Tile
          key={i.chave}
          rotulo={i.rotulo}
          valor={i.valor}
          escopo={i.escopo}
          apoio={i.apoio}
          variacao={i.variacao}
          referencia={i.referencia}
          estado={i.estado}
          mensagem={i.mensagem}
        />
      ))}
    </section>
  )
}
