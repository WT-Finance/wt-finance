import type { IndicadorTopo } from '@/lib/financeiro-geral/faixa-topo'
import { Tile } from './comum'

// A faixa de 5 indicadores no topo. O que cada tile mostra (e por quê) está em `faixa-topo.ts`; aqui só
// se desenha. Cada tile degrada sozinho (erro/vazio próprios, inv. 8).

export default function FaixaIndicadores({ indicadores }: { indicadores: readonly IndicadorTopo[] }) {
  return (
    <section aria-label="Indicadores" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
