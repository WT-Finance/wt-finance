import 'server-only'

import { ultimaCargaAplicada } from './log'
import type { BaseIngestao } from './bases'

// "Última atualização" do M7 (anexo v6.0.0/M7 §3.2) para as telas que leem base carregada por
// upload e ainda não tinham carimbo: /financeiro/fluxo-caixa, /performance(+corporativo/trips) e
// /performance/weddings. Reusa a MESMA fonte que a tela /admin/ingestao usa — `ultimaCargaAplicada`
// (`@/lib/ingestao/log`, que envelopa a RPC `ingestao_carga_ultima`, service_role-only) — no lugar
// de inventar uma segunda leitura de `ingestao.carga`.
//
// Molde de `@/lib/dre/ultima-carga-movimentacao.ts` (precedente da DRE, v5.4.1): devolve SÓ o
// instante da última carga `aplicada`, nunca `usuario_id`/`chave_id`/`arquivos`/nome de arquivo —
// o selo da tela é público de leitura (qualquer usuário com acesso à área vê a data), a LINHA de
// carga inteira não é.
//
// FAIL-SAFE, dobrado: `ultimaCargaAplicada` já devolve `null` (nunca lança) em erro de RPC, base
// sem carga aplicada, ou formato inesperado — com o `console.error` correspondente lá dentro.
// Aqui só extraímos `concluido_em`; qualquer coisa que não seja string também vira `null`, com
// LOG PRÓPRIO (formato inesperado é um caso que `ultimaCargaAplicada` não cobre, porque ele só
// valida a linha inteira, não este campo específico). Consumidor OMITE o selo quando `null` —
// "sem data" seria pior que selo nenhum (lição v5.2.1), e vai acontecer em TODAS estas telas até
// a primeira carga pelo caminho novo (M9): esperado, não defeito.
export async function buscarUltimaCargaDaBase(base: BaseIngestao): Promise<string | null> {
  try {
    const linha = await ultimaCargaAplicada(base)
    if (!linha) return null
    if (typeof linha.concluido_em !== 'string') {
      console.error(`[ingestao/ultima-carga-da-base] concluido_em em formato inesperado para ${base}:`, linha.concluido_em)
      return null
    }
    return linha.concluido_em
  } catch (err) {
    console.error(`[ingestao/ultima-carga-da-base] falha ao ler a última carga de ${base}:`, err)
    return null
  }
}
