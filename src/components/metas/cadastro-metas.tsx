'use client'

// Pai que liga os DOIS quadros do Cadastro de Metas (v5.4.4). Existe por UM motivo: o
// estado das metas de SUBSETOR precisa ser visível aos DOIS quadros — a célula travada
// de Weddings no quadro de cima (`CadastroGrade`) mostra a soma AO VIVO do que está
// sendo digitado no quadro de baixo (`CadastroGradeSubsetor`), mesmo antes de salvar.
// Sem levantar esse estado aqui, os dois quadros mostrariam números diferentes na
// mesma tela enquanto houvesse edição não salva.
//
// Cada quadro mantém o PRÓPRIO botão Salvar (duas Server Actions distintas,
// `salvarMetas`/`salvarMetasSubsetor`) — este componente não os unifica, só compartilha
// o estado de LEITURA (`valoresSub`) que alimenta a derivação.
import { useState } from 'react'
import CadastroGrade, {
  type MetaItem, type SetorCol, type CelulaValor, chaveAnoMes,
} from '@/components/metas/cadastro-grade'
import CadastroGradeSubsetor, {
  construirMapaSub, chaveSub, pendenciasSub,
  type MetaSubsetorItem, type CelulaValorSub,
} from '@/components/metas/cadastro-grade-subsetor'
import { somarPorMes } from '@/lib/metas/metas-derivadas'
import { SUBSETOR_ORDER } from '@/lib/config'

interface Props {
  ano:                      number
  setores:                  SetorCol[]
  metas:                    MetaItem[]
  ultimaAlteracao:          { alterado_em: string; alterado_por: string | null } | null
  metasSubsetor:            MetaSubsetorItem[]
  ultimaAlteracaoSubsetor:  { alterado_em: string; alterado_por: string | null } | null
}

export default function CadastroMetas({
  ano, setores, metas, ultimaAlteracao, metasSubsetor, ultimaAlteracaoSubsetor,
}: Props) {
  // Estado das metas de SUBSETOR, levantado aqui (não dentro do quadro de baixo) —
  // é o mapa que alimenta a derivação de Weddings no quadro de cima.
  const [valoresSub, setValoresSub] = useState<Record<string, CelulaValorSub>>(() => construirMapaSub(metasSubsetor))

  // Re-hidrata quando o servidor troca de dado (nova navegação de ano OU o
  // `router.refresh()` pós-Salvar de QUALQUER um dos dois quadros — os dois disparam
  // revalidatePath('/metas/cadastro')). Mesmo padrão "ajustar durante a renderização"
  // usado nos dois componentes filhos.
  const [metasSubPrev, setMetasSubPrev] = useState(metasSubsetor)
  if (metasSubsetor !== metasSubPrev) {
    setMetasSubPrev(metasSubsetor)
    setValoresSub(construirMapaSub(metasSubsetor))
  }

  function onChangeSub(subsetor: string, mes: number, campo: keyof CelulaValorSub, novo: number | null) {
    const k = chaveSub(subsetor, mes)
    setValoresSub(prev => ({
      ...prev,
      [k]: { ...(prev[k] ?? { valorMeta: null, metaContratos: null, pctReceita: null }), [campo]: novo },
    }))
  }

  // `weddingsDerivado` — CALCULADO NO CORPO DO RENDER, nunca em `useEffect` +
  // `setState` (a regra `set-state-in-effect` do lint v7/React Compiler reprova; ver
  // skill `react-padroes`). Reusa `somarPorMes` — a MESMA função usada para o "Total"
  // do quadro de baixo — para os dois números nunca divergirem por definição.
  const itensParaSoma: { ano: number; mes: number; valorMeta: number; pctReceita: number | null }[] = []
  for (const subsetor of SUBSETOR_ORDER) {
    for (let mes = 1; mes <= 12; mes++) {
      const cel = valoresSub[chaveSub(subsetor, mes)]
      if (cel?.valorMeta != null) itensParaSoma.push({ ano, mes, valorMeta: cel.valorMeta, pctReceita: cel.pctReceita })
    }
  }
  const weddingsDerivado = new Map<string, CelulaValor>(
    somarPorMes(itensParaSoma).map(m => [chaveAnoMes(m.ano, m.mes), { valorMeta: m.valorMeta, pctReceita: m.pctReceita ?? null }]),
  )

  // O seletor de ano vive UMA vez, no cabeçalho do quadro de cima, e o `?ano=` vale para
  // os dois. Logo a guarda de descarte daquele seletor precisa saber das pendências de
  // BAIXO — senão trocar o ano com o quadro de cima limpo apagaria em silêncio o que
  // estivesse digitado aqui. Usa a MESMA função pura que o quadro de baixo usa para
  // montar o que envia, então as duas contagens não podem divergir.
  const pendenciasSubsetor = pendenciasSub(valoresSub, construirMapaSub(metasSubsetor), ano).length

  return (
    <div className="space-y-10">
      <CadastroGrade
        ano={ano}
        setores={setores}
        metas={metas}
        ultimaAlteracao={ultimaAlteracao}
        weddingsDerivado={weddingsDerivado}
        pendenciasExternas={pendenciasSubsetor}
      />
      <CadastroGradeSubsetor
        ano={ano}
        metas={metasSubsetor}
        ultimaAlteracao={ultimaAlteracaoSubsetor}
        valores={valoresSub}
        onChange={onChangeSub}
      />
    </div>
  )
}
