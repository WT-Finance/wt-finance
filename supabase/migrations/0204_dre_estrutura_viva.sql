-- ---------------------------------------------------------------------------
-- 0204 — feat(dre): estrutura VIVA da DRE — dre_bloco + dre_categoria_map + RPC de leitura
-- v5.3.0 / M1 (DRE Gerencial · Onda 2). Briefing: Janus_Briefing_v5-3-0_DRE_Onda2.pdf.
--
-- DECLARAÇÃO (regime aditivo): esta migration é ADITIVA/retrocompatível com a main viva —
--   • CREATE TABLE ×2 (novas), CREATE FUNCTION ×2 (novas: trigger de atualizado_em + RPC),
--     nenhum objeto existente alterado/removido;
--   • NÃO escreve em dados pré-existentes (o seed vem na 0205 e só INSERE nas tabelas NOVAS).
--
-- A estrutura do demonstrativo (ordem das categorias, categoria→bloco, excluídas) deixa de
-- ser arquivo (struct.json da controladoria) e vira DADO em tabela, editável pela interface
-- (M5) e auditável pelo diário (0199; triggers anexados na 0205, APÓS o seed, para o seed
-- não poluir o histórico). Decisões firmes do Yan: estrutura GLOBAL (uma oficial, não por
-- usuário); chave do de-para = categoria_id (20/130 categorias são re-parenteadas vs o grupo
-- Monde — o de-para é CURADO, não derivável); fórmulas ancoradas por CHAVE de bloco (grafo,
-- nunca posição); estado EXCLUÍDA explícito (bandeja mostra só pendentes).
-- ---------------------------------------------------------------------------

-- ── 1. Blocos do demonstrativo (cabeçalhos, sub-blocos e totalizadores) ────────
CREATE TABLE financeiro.dre_bloco (
  id            BIGSERIAL   PRIMARY KEY,           -- exigido pelo trigger genérico do diário (PK "id")
  chave         TEXT        NOT NULL UNIQUE,       -- id ESTÁVEL do bloco ('ENT_H','RV','REPASSE'…) — âncora das fórmulas
  rotulo        TEXT        NOT NULL,
  tipo          TEXT        NOT NULL CHECK (tipo IN ('blocoH','sub','tot')),
  ordem         INT         NOT NULL,              -- ordem no demonstrativo (fonte da renderização)
  formula       JSONB,                             -- p/ tot e blocoH-agregador: array de CHAVES insumo (ex.: ["ENT_H","PAG_H"]).
                                                   -- NULL = bloco soma as próprias categorias. Provadas na investigação (§A.2).
  nota_estrela  BOOLEAN     NOT NULL DEFAULT FALSE,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now() -- trava otimista (receita da 0202)
);

-- ── 2. De-para categoria → bloco (o mapa curado) ───────────────────────────────
-- Uma linha por categoria DECIDIDA: mapeada num bloco OU deliberadamente excluída da DRE.
-- Categoria SEM linha aqui = BANDEJA "Não classificadas" (consulta, não coluna — categoria
-- nova do Monde entra na bandeja automaticamente; nada some em silêncio).
CREATE TABLE financeiro.dre_categoria_map (
  id            BIGSERIAL   PRIMARY KEY,
  categoria_id  INT         NOT NULL UNIQUE REFERENCES financeiro.dim_categoria(id),
  bloco_chave   TEXT        REFERENCES financeiro.dre_bloco(chave),
  ordem         INT         NOT NULL DEFAULT 0,    -- ordem DENTRO do bloco (reordenar é livre/cosmético)
  nota_estrela  BOOLEAN     NOT NULL DEFAULT FALSE,
  excluida      BOOLEAN     NOT NULL DEFAULT FALSE,
  rotulo        TEXT,                              -- override de exibição (ex.: prefixo contábil "(-) …" do modelo);
                                                   -- NULL = usa dim_categoria.categoria
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Estado coerente: ou está NUM bloco, ou está EXCLUÍDA — nunca os dois, nunca nenhum.
  CONSTRAINT dre_map_estado CHECK (
    (excluida AND bloco_chave IS NULL) OR (NOT excluida AND bloco_chave IS NOT NULL)
  )
);

CREATE INDEX idx_dre_map_bloco ON financeiro.dre_categoria_map (bloco_chave, ordem);

COMMENT ON TABLE financeiro.dre_bloco IS
  'Estrutura viva da DRE por Fluxo de Caixa (v5.3.0/ADR-0156): blocos do demonstrativo. Fórmulas por CHAVE (grafo, nunca posição). Editável via RPCs gated financeiro/dre; auditada pelo diário (0199).';
COMMENT ON TABLE financeiro.dre_categoria_map IS
  'De-para CURADO categoria→bloco da DRE (v5.3.0/ADR-0156). Sem linha = bandeja Não classificadas; excluida = fora da DRE (transferências internas), visível e reversível no editor.';

-- ── 3. Trava otimista: atualizado_em mantido por BEFORE UPDATE (receita da 0202/0094) ──
CREATE OR REPLACE FUNCTION financeiro.fn_dre_touch_atualizado_em()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_touch_dre_bloco
  BEFORE UPDATE ON financeiro.dre_bloco
  FOR EACH ROW EXECUTE FUNCTION financeiro.fn_dre_touch_atualizado_em();
CREATE TRIGGER trg_touch_dre_categoria_map
  BEFORE UPDATE ON financeiro.dre_categoria_map
  FOR EACH ROW EXECUTE FUNCTION financeiro.fn_dre_touch_atualizado_em();

-- ── 4. Segurança: RLS deny-by-default; app nunca toca tabela direto ────────────
ALTER TABLE financeiro.dre_bloco         ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro.dre_categoria_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financeiro.dre_bloco         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON financeiro.dre_categoria_map FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE financeiro.dre_bloco_id_seq         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE financeiro.dre_categoria_map_id_seq FROM PUBLIC, anon, authenticated;

-- ── 5. RPC de leitura da estrutura (editor M5 e conferências) ───────────────────
-- Padrão INLINE pós-v4.29: exigir_acesso na primeira linha do corpo; REVOKE/GRANT explícitos.
-- Devolve UM json: token da trava (greatest dos atualizado_em das duas tabelas), blocos na
-- ordem, maps (com nome real + rótulo de exibição) e a bandeja (dim sem linha no map).
CREATE OR REPLACE FUNCTION public.dre_estrutura()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);
  RETURN json_build_object(
    'token', (
      SELECT greatest(
        (SELECT max(atualizado_em) FROM financeiro.dre_bloco),
        (SELECT max(atualizado_em) FROM financeiro.dre_categoria_map)
      )
    ),
    'blocos', (
      SELECT COALESCE(json_agg(json_build_object(
        'chave', b.chave, 'rotulo', b.rotulo, 'tipo', b.tipo,
        'ordem', b.ordem, 'formula', b.formula, 'nota_estrela', b.nota_estrela
      ) ORDER BY b.ordem), '[]'::json)
      FROM financeiro.dre_bloco b
    ),
    'maps', (
      SELECT COALESCE(json_agg(json_build_object(
        'categoria_id', m.categoria_id,
        'nome', dc.categoria,
        'rotulo', COALESCE(m.rotulo, dc.categoria),
        'bloco_chave', m.bloco_chave,
        'ordem', m.ordem,
        'nota_estrela', m.nota_estrela,
        'excluida', m.excluida
      ) ORDER BY m.bloco_chave NULLS LAST, m.ordem), '[]'::json)
      FROM financeiro.dre_categoria_map m
      JOIN financeiro.dim_categoria dc ON dc.id = m.categoria_id
    ),
    'bandeja', (
      SELECT COALESCE(json_agg(json_build_object(
        'categoria_id', dc.id, 'nome', dc.categoria, 'grupo_monde', dc.grupo_categoria
      ) ORDER BY dc.categoria), '[]'::json)
      FROM financeiro.dim_categoria dc
      WHERE NOT EXISTS (SELECT 1 FROM financeiro.dre_categoria_map m WHERE m.categoria_id = dc.id)
    )
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.dre_estrutura() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.dre_estrutura() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
