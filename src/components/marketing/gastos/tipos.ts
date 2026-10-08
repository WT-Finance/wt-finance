// Tipos da página "Gastos de Marketing" (v6.3.0).
//
// Estes tipos são o CONTRATO que as RPCs (migration 0292) devolvem — a página foi construída em
// cima deles com uma fixture (GATE 1, mockup) e, na M3, só a FONTE do dado trocou (agora as
// RPCs, validadas por `src/lib/marketing/schemas.ts`); componentes, módulos de
// `src/lib/marketing/` e testes ficaram. Por isso o formato aqui já é o de uma RPC: dado cru,
// nada derivado no servidor que o cliente não saiba refazer.
//
// ── Origem do dado (já medido na M0) ────────────────────────────────────────────────────
// `financeiro.fato_fluxo`, só lançamentos PAGOS (realizados), filtrados pelo bloco MKT da DRE de
// caixa. Por construção o total da página É a linha "(-) Despesas Marketing" da DRE de caixa.
//
// ── SINAL (decisão firme do Yan) ────────────────────────────────────────────────────────
// O gasto é NEGATIVO, exatamente como na DRE — o `valor` vem da base SEM inversão. Um estorno
// (raro) é POSITIVO e reduz o gasto. Vale em toda a página: KPIs, tabelas, ranking, lançamentos
// e tooltip. Nenhum componente aplica `Math.abs` para exibir valor monetário.
//
// ── RPCs (migration 0292; schemas Zod em `src/lib/marketing/schemas.ts`) ────────────────
//   get_marketing_gastos_resumo(p_ano)       → ResumoMarketing    (por mês × categoria + metadados)
//   get_marketing_gastos_fornecedores(p_ano) → FornecedoresMarketing (por mês × fornecedor)
//   get_marketing_gastos_lancamentos(p_ano)  → LancamentoMkt[]    (o ano inteiro; sem paginação)
// O resumo é chamado duas vezes (ano selecionado e anterior). Filtro, ordenação e busca da
// tabela de lançamentos rodam no CLIENTE: ~230 linhas/ano não justificam paginar no servidor.
// O contrato de completude (Σ lançamentos ≡ Σ resumo ≡ Σ fornecedores ≡ linha da DRE) vira caso
// de `rpc-contrato.test.ts` na M3; `src/lib/marketing/completude.test.ts` prova a mesma
// identidade sobre a fixture.

/** Resultado de uma leitura que pode falhar sem derrubar a página (invariante 14: a seção
 *  degrada, a página fica de pé). Espelha o `allSettled` por item que a M3 vai fazer. */
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
   *  das pills de ano da página. */
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
  /** 'fixture' = mockup (aparece o selo "dados fictícios"); a página de produção passa 'rpc'. */
  fonte: 'fixture' | 'rpc'
  resumo: Carregado<ResumoMarketing>
  resumoAnterior: Carregado<ResumoMarketing>
  fornecedores: Carregado<FornecedoresMarketing>
  lancamentos: Carregado<LancamentoMkt[]>
}

/** Estados que a fixture sabe forjar (massa de teste; a página de produção não usa mais). */
export type EstadoMockup = 'vazio' | 'erro'
