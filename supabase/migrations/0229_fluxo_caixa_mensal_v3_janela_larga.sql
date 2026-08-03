-- ---------------------------------------------------------------------------
-- 0229 — feat(v5.4.2): janela LARGA em get_fluxo_caixa_mensal_v3__nucleo
--        (Fluxo de Caixa do Financeiro · gráfico mensal).
--
-- ADITIVA / retrocompatível. Declaração prévia (regime do CLAUDE.md):
--   • O QUE FAZ: CREATE OR REPLACE do corpo de
--     get_fluxo_caixa_mensal_v3__nucleo, alargando a janela do horizonte de
--     "23 meses atrás + mês atual + 18 à frente" (42 meses) para
--     "36 atrás + mês atual + 36 à frente" (73 meses). Só as duas expressões de
--     INTERVAL mudam; a agregação, a fonte e as colunas são as mesmas.
--   • POR QUE É ADITIVA: a ASSINATURA é idêntica (função SEM parâmetros) — então
--     é REPLACE puro, sem DROP+CREATE (a ADR-0126 exige DROP+CREATE só quando um
--     PARÂMETRO novo entra, que não é o caso). O SHAPE de cada linha é idêntico
--     (mes, entrada_efetivada, entrada_prevista, saida_efetivada, saida_prevista,
--     resultado_mensal) — muda a QUANTIDADE de linhas, não o formato. Função de
--     leitura, não escreve em dado pré-existente.
--   • NENHUM NÚMERO EXISTENTE MUDA: cada mês é um agregado independente do
--     próprio mês (não há acumulado nem baseline), então acrescentar meses nas
--     bordas não altera nenhum mês que já era devolvido. Isso é o que separa este
--     caso do gráfico acumulado de Weddings, onde alargar a busca deslocaria a
--     linha de base — lá o cliente rebaseia por isso.
--   • REVERSIBILIDADE: reaplicar as duas expressões da 0080 (`-23 months` /
--     `+18 months`) restaura a janela anterior.
--
-- POR QUE ELA EXISTE: o gráfico mensal do Financeiro ganhou o slider de janela do
-- padrão de Weddings (v5.4.2, 36 meses para cada lado). Diferente da RPC de
-- Weddings — onde a janela SEMPRE foi parâmetro do chamador e alargar não exigiu
-- migration —, aqui o horizonte é HARDCODED no corpo, então o slider não teria o
-- que fatiar sem esta alteração. O cliente busca a janela larga uma vez e recorta;
-- arrastar não refetcha.
--
-- Consumidor único verificado antes de alterar (grep em `src/` e `supabase/seed/`):
-- `src/app/financeiro/fluxo-caixa/page.tsx` → `FluxoMensalChart`. Nenhum outro
-- consumidor no app, nenhum no seed.
--
-- Correção de comentário de carona: o header da 0080 dizia "24 meses atrás" e o
-- código fazia `- INTERVAL '23 months'` (42 meses no total, não 43). A janela nova
-- é simétrica de propósito, e o comentário abaixo diz o que o código faz.
--
-- Wrapper público INTOCADO: public.get_fluxo_caixa_mensal_v3() (0121) segue com
-- app.exigir_acesso(ARRAY['financeiro/fluxo-caixa']) e delegando ao __nucleo.
-- Grants inalterados (__nucleo permanece service_role-only).
--
-- Verificação pós-push: via REST/service_role (o `db query` não executa o corpo
-- de função gated), conferindo a contagem de meses, as bordas da janela e que os
-- meses que já vinham antes mantêm os MESMOS valores.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_fluxo_caixa_mensal_v3__nucleo()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Janela larga e SIMÉTRICA: 36 meses atrás + mês atual + 36 à frente = 73 meses.
  -- O cliente fatia dentro dela (slider de 36 para cada lado), sem refetch.
  v_mes_inicio text := TO_CHAR(date_trunc('month', CURRENT_DATE) - INTERVAL '36 months', 'YYYY-MM');
  v_mes_fim    text := TO_CHAR(date_trunc('month', CURRENT_DATE) + INTERVAL '36 months', 'YYYY-MM');
BEGIN
  RETURN (
    SELECT JSON_AGG(row_to_json(r) ORDER BY r.mes)
    FROM (
      SELECT
        gs.mes,
        COALESCE(SUM(CASE WHEN v.is_realizado = TRUE  AND v.tipo_movimento = 'entrada' THEN v.valor_unit ELSE 0 END), 0) AS entrada_efetivada,
        COALESCE(SUM(CASE WHEN v.is_realizado = FALSE AND v.tipo_movimento = 'entrada' THEN v.valor_unit ELSE 0 END), 0) AS entrada_prevista,
        COALESCE(SUM(CASE WHEN v.is_realizado = TRUE  AND v.tipo_movimento = 'saida'   THEN v.valor_unit ELSE 0 END), 0) AS saida_efetivada,
        COALESCE(SUM(CASE WHEN v.is_realizado = FALSE AND v.tipo_movimento = 'saida'   THEN v.valor_unit ELSE 0 END), 0) AS saida_prevista,
        COALESCE(
          SUM(CASE WHEN v.tipo_movimento = 'entrada' THEN v.valor_unit ELSE -v.valor_unit END),
          0
        ) AS resultado_mensal
      FROM (
        SELECT TO_CHAR(generate_series(
          (v_mes_inicio || '-01')::date,
          (v_mes_fim    || '-01')::date,
          '1 month'::interval
        ), 'YYYY-MM') AS mes
      ) gs
      LEFT JOIN financeiro.vw_fluxo_caixa_kpis_b v ON v.mes = gs.mes
      GROUP BY gs.mes
    ) r
  );
END $$;

NOTIFY pgrst, 'reload schema';
