-- ---------------------------------------------------------------------------
-- 0255 — feat(db): base nova raw.demonstrativo_competencia (v5.8.0, M1)
--
-- ADITIVA / retrocompatível com a main viva:
--   • CREATE TABLE nova em `raw` (não toca nenhuma base existente)
--   • CREATE FUNCTION novas (truncar/inserir_lote/status) — RPCs de upload, service_role
-- Convivência: nasce isolada. Nada a lê ainda — a árvore, o de-para e a view entram
--   na 0256, e a RPC de leitura na 0257 (M2). O motor de CAIXA (fato_fluxo, dre_bloco,
--   dre_categoria_map, get_dre_mensal) não é tocado por esta versão inteira.
--
-- Fonte: export Monde "Demonstrativo de Resultado" tratado pelo script R
--   (`tratamento_demonstrativo_v1.R`) — 8 colunas tidy, um registro por
--   (Tipo, Grupo, Descrição, Ano, Mês). Fato gerador = data de EMISSÃO, e é isso que
--   separa esta base do regime de caixa: `financeiro.fato_fluxo.data_competencia` é
--   outro eixo (o "mês híbrido" do caixa) e NÃO tem relação com esta coluna.
--
-- Medido no arquivo vivo de 25/08/2026 antes de escrever esta migration:
--   3.244 linhas · 141 pares (Grupo, Descrição) distintos · Σ valor = 568.937,62
--   · cobertura 2024-01 → 2026-08 · Σ por ano: 2024 = 208.743,77 ·
--   2025 = 439.628,52 · 2026 = −79.434,67 · `Competência` coerente com
--   Ano + Mês Nº em 3.244/3.244 linhas (zero divergência).
--
-- `tipo` fica TEXT SEM CHECK de propósito: hoje só existem 'Receitas' (736) e
--   'Despesas' (2.508), mas prender o export num CHECK faria uma variação de rótulo
--   na origem derrubar o upload inteiro em vez de aparecer na bandeja. Mesma escolha
--   que a 0186 fez para `liquidacao`. (E CHECK sobre valor não previsto é justamente
--   onde a v5.6.0 apanhou: `CASE` sem `ELSE false` é FAIL-OPEN.)
--
-- `competencia` é DERIVADA de Ano + Mês Nº no parser (inteiros, imunes a fuso) e a
--   coluna `Competência` do arquivo serve de CONFERÊNCIA CRUZADA, não de fonte —
--   decisão técnica desta versão. É sempre o dia 1 do mês.
-- ---------------------------------------------------------------------------

CREATE TABLE raw.demonstrativo_competencia (
  id             BIGSERIAL   PRIMARY KEY,
  arquivo_origem TEXT        NOT NULL,
  carregado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  tipo           TEXT,                     -- 'Receitas' | 'Despesas' (sem CHECK, ver header)
  grupo          TEXT        NOT NULL,     -- 1ª perna da chave do de-para
  descricao      TEXT        NOT NULL,     -- 2ª perna da chave do de-para
  ano            INT         NOT NULL,
  mes            TEXT,                     -- rótulo pt-BR ('fevereiro') — só apresentação
  mes_num        INT         NOT NULL,
  competencia    DATE        NOT NULL,     -- sempre o dia 1 (derivada de ano + mes_num)
  valor          NUMERIC(18,2) NOT NULL    -- sinal PRESERVADO (receita +, despesa −)
);

-- Cada índice tem um consumidor nomeado na RPC de leitura (0257), e não são a mesma
-- dimensão por dois eixos: `ano` serve o `WHERE ano = p_ano` do recorte anual;
-- `competencia` serve o min/max da COBERTURA (que varre a tabela inteira, sem filtro de
-- ano, e é o que alimenta o cabeçalho da seção); `(grupo, descricao)` é a chave composta
-- do join do de-para (três descrições existem sob dois pais — por isso composta).
CREATE INDEX demonstrativo_comp_ano_idx   ON raw.demonstrativo_competencia (ano);
CREATE INDEX demonstrativo_comp_comp_idx  ON raw.demonstrativo_competencia (competencia);
CREATE INDEX demonstrativo_comp_par_idx   ON raw.demonstrativo_competencia (grupo, descricao);

ALTER TABLE raw.demonstrativo_competencia ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON raw.demonstrativo_competencia TO service_role;
GRANT USAGE, SELECT ON SEQUENCE raw.demonstrativo_competencia_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- RPCs de upload — padrão das 0185/0186: service_role ONLY, sem app.exigir_acesso.
-- O gate de área é do Server Action (requireAreaAction('admin/uploads')); estas
-- funções são inalcançáveis por anon/authenticated por REVOKE, e só o cliente
-- service_role do servidor as chama.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.truncar_demonstrativo_competencia()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  TRUNCATE raw.demonstrativo_competencia RESTART IDENTITY;
END;
$function$;

CREATE OR REPLACE FUNCTION public.inserir_lote_demonstrativo_competencia(p_linhas jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO raw.demonstrativo_competencia (
    arquivo_origem, tipo, grupo, descricao, ano, mes, mes_num, competencia, valor
  )
  SELECT
    x->>'arquivo_origem',
    NULLIF(x->>'tipo',      ''),
    x->>'grupo',
    x->>'descricao',
    (x->>'ano')::INT,
    NULLIF(x->>'mes',       ''),
    (x->>'mes_num')::INT,
    (x->>'competencia')::DATE,
    (x->>'valor')::NUMERIC(18,2)
  FROM jsonb_array_elements(p_linhas) AS x;
END;
$function$;

-- Lado servidor do ALARME DE INGESTÃO (invariante do briefing): devolve contagem e
-- SOMA gravadas, para o Server Action confrontar com o que o parser mediu no arquivo.
--
-- A soma sai em CENTAVOS INTEIROS (`soma_centavos`, BIGINT) e é a ÚNICA representação
-- devolvida: o cliente formata dividindo por 100. Isso evita que a comparação de
-- igualdade trafegue como float pelo JSON, e dá UMA representação em vez de duas.
--
-- Precisão, dito com exatidão (achado BAIXO do revisor-db, v5.8.0): deste lado a conta
-- já é exata — `valor` é NUMERIC(18,2), então `sum(valor) * 100` é inteiro em aritmética
-- NUMERIC e o `round()` aqui é DEFENSIVO, não está desempatando nada. O ponto onde as
-- duas pontas poderiam discordar é anterior: o cast de entrada
-- `(x->>'valor')::NUMERIC(18,2)` arredonda o float JS pela regra do Postgres, enquanto
-- `somaCentavos()` (parse-demonstrativo-competencia.ts) arredonda o MESMO float com
-- `Math.round`. As regras só divergem num empate genuíno na 3ª casa — que não ocorre num
-- valor de moeda com 2 decimais na origem. E se ocorresse, o efeito é FAIL-CLOSED: o
-- alarme de ingestão acusa a divergência e o card não declara sucesso; ninguém passa a
-- usar número torto em silêncio. (A lição da v5.5.1 — ROUND do Postgres é
-- meio-para-longe-de-zero e Math.round do JS é meio-para-cima — é o motivo de NÃO haver
-- aqui um percentual derivado nas duas pontas; ela não é o mecanismo desta soma.)
--
-- `cobertura_*` alimenta o cabeçalho da seção ("cobertura AAAA–AAAA (até mês X)") e
-- `pares` é a contagem de chaves compostas distintas, que o de-para tem de cobrir.
CREATE OR REPLACE FUNCTION public.status_demonstrativo_competencia()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'total',              (SELECT count(*)           FROM raw.demonstrativo_competencia),
    'soma_centavos',      (SELECT COALESCE(round(sum(valor) * 100), 0)::BIGINT
                             FROM raw.demonstrativo_competencia),
    'pares',              (SELECT count(*) FROM (
                             SELECT DISTINCT grupo, descricao FROM raw.demonstrativo_competencia
                           ) p),
    'cobertura_de',       (SELECT min(competencia)   FROM raw.demonstrativo_competencia),
    'cobertura_ate',      (SELECT max(competencia)   FROM raw.demonstrativo_competencia),
    'ultima_atualizacao', (SELECT max(carregado_em)  FROM raw.demonstrativo_competencia)
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.truncar_demonstrativo_competencia()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.inserir_lote_demonstrativo_competencia(jsonb)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.status_demonstrativo_competencia()             FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.truncar_demonstrativo_competencia()            TO service_role;
GRANT EXECUTE ON FUNCTION public.inserir_lote_demonstrativo_competencia(jsonb)  TO service_role;
GRANT EXECUTE ON FUNCTION public.status_demonstrativo_competencia()             TO service_role;

NOTIFY pgrst, 'reload schema';
