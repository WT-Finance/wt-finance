// Tipos da página "Gastos de Marketing" (v6.3.0).
//
// Estes tipos são o CONTRATO que as RPCs (migration 0292) devolvem; os schemas Zod que o validam
// em runtime estão em `src/lib/marketing/schemas.ts`. O formato é o de uma RPC: dado cru, nada
// derivado no servidor que o cliente não saiba refazer.
//
// ── Origem do dado ──────────────────────────────────────────────────────────────────────
// `financeiro.fato_fluxo`, só lançamentos PAGOS (realizados), filtrados pelo bloco MKT da DRE de
// caixa. Por construção o total da página É a linha de Marketing da DRE de caixa.
//
// ── SINAL (decisão firme do Yan) ────────────────────────────────────────────────────────
// O gasto é NEGATIVO, exatamente como na DRE — o `valor` vem da base SEM inversão. Um estorno
// (raro) é POSITIVO e reduz o gasto. Vale em toda a página: KPIs, tabelas, ranking, lançamentos
// e tooltip. Nenhum componente aplica `Math.abs` para exibir valor monetário.
//
// ── RPCs (migration 0292) ───────────────────────────────────────────────────────────────
//   get_marketing_gastos_resumo(p_ano)       → ResumoMarketing    (por mês × categoria + metadados)
//   get_marketing_gastos_fornecedores(p_ano) → FornecedoresMarketing (por mês × fornecedor)
//   get_marketing_gastos_lancamentos(p_ano)  → LancamentoMkt[]    (o ano inteiro; sem paginação)
// O resumo é chamado duas vezes (ano selecionado e anterior). Filtro, ordenação e busca da
// tabela de lançamentos rodam no CLIENTE: ~230 linhas/ano não justificam paginar no servidor.
// O contrato de completude (Σ lançamentos ≡ Σ resumo ≡ Σ fornecedores ≡ linha da DRE) é provado
// contra a base viva em `src/lib/rpc-contrato.test.ts`; `src/lib/marketing/completude.test.ts`
// prova a mesma identidade sobre a fixture (`src/lib/marketing/fixture.ts`).

/** Resultado de uma leitura que pode falhar sem derrubar a página (invariante 14: a seção
 *  degrada, a página fica de pé). Espelha o `allSettled` por item feito em `page.tsx`. */
export type Carregado<T> = { ok: true; dados: T } | { ok: false }

/** Um lançamento pago. `valor` com o sinal da DRE (gasto < 0, estorno > 0). */
export interface LancamentoMkt {
  /** ⚠️ O `id` RENUMERA a cada carga da base (vem de `fato_fluxo`, que é recriada): serve SÓ de
   *  `key` do React na lista. Nunca em URL, nunca persistido, nunca guardado como seleção. */
  id: number
  /** Data de movimentação ('YYYY-MM-DD', date puro — sem fuso). */
  data: string
  categoria: string
  /** `null`/vazio = lançamento sem fornecedor — a UI mostra "(sem fornecedor)", nunca esconde. */
  fornecedor: string | null
  descricao: string | null
  /** Nº do documento (NF, fatura…). */
  documento: string | null
  valor: number
}

/** Linha do resumo do ano: total de uma categoria num mês. */
export interface LinhaMesCategoria {
  /** 1..12 */
  mes: number
  categoria: string
  valor: number
  qtd: number
}

/** Linha do resumo do ano: total de um fornecedor num mês. */
export interface LinhaMesFornecedor {
  mes: number
  fornecedor: string | null
  valor: number
  qtd: number
}

export interface ResumoMarketing {
  ano: number
  /** Anos com algum lançamento MKT realizado na base (SEM filtro de ano), crescente. É a fonte
   *  das pills de ano da página — e diz se o ano anterior TEM histórico: ano fora desta lista é
   *  ausência de dado (a UI mostra "—"), não zero. */
  anosDisponiveis: number[]
  porMesCategoria: LinhaMesCategoria[]
  /** Primeira e última data de movimentação do dado do ano; `null` = ano sem lançamento. */
  cobertura: { min: string; max: string } | null
  /** timestamptz da última carga da base de movimentação (ISO COM offset; exibir por `fmtDataSP`). */
  ultimaCarga: string | null
  /** Última data ('YYYY-MM-DD') com fatura de cartão lançada. A fatura entra com atraso —
   *  Google/Meta/Adobe são pagos no cartão, e o mês corrente fica subcontado até ela entrar.
   *  ⚠️ É GLOBAL (a RPC não filtra por ano): em ano fechado o aviso seria enganoso. A página só o
   *  exibe quando o ano selecionado é o corrente (`gastos-content.tsx`). */
  ultimaDataCartao: string | null
}

export interface FornecedoresMarketing {
  ano: number
  porMesFornecedor: LinhaMesFornecedor[]
}

/** O que a página recebe do servidor. Cada leitura falha sozinha (`Carregado`). */
export interface DadosGastosMarketing {
  ano: number
  /** Anos com pill, em ordem crescente. */
  anosDisponiveis: number[]
  /** Hoje em São Paulo ('YYYY-MM-DD'), calculado NO SERVIDOR — o cliente não usa relógio
   *  próprio (mismatch de hidratação e fuso). Define o mês corrente. */
  hoje: string
  resumo: Carregado<ResumoMarketing>
  resumoAnterior: Carregado<ResumoMarketing>
  fornecedores: Carregado<FornecedoresMarketing>
  lancamentos: Carregado<LancamentoMkt[]>
}
