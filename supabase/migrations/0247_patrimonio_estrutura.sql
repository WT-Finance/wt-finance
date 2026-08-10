-- ---------------------------------------------------------------------------
-- 0247 — feat(v5.6.0/M1): schema `patrimonio` — Inventário de Ativos (estrutura)
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria o schema NOVO `patrimonio` com 3 enums e 5 tabelas
--     (categoria, area, detentor, ativo, movimentacao), a sequência do código
--     patrimonial, o seed de categoria/área, a área RBAC nova
--     'gestao-pessoas/inventario' e os triggers do diário genérico da 0199.
--     As RPCs vêm na 0248 — esta migration é só ESTRUTURA.
--   • ADITIVA / RETROCOMPATÍVEL: só CREATE SCHEMA/TYPE/TABLE/INDEX/SEQUENCE/FUNCTION/
--     TRIGGER e INSERT idempotente (ON CONFLICT DO NOTHING) em tabelas NOVAS. A única
--     escrita em tabela pré-existente é o INSERT de catálogo em app.rbac_areas e
--     app.rbac_role_permissoes — idempotente, sem tocar nenhuma linha já existente.
--     NÃO altera coluna nem dado pré-existente. Superfície 100% nova: nenhuma tela
--     consome nada disto ainda, então o risco sobre a main viva é zero.
--   • MODELO (briefing v5.6.0, invariantes 1 e 2): o RAZÃO de movimentações é a fonte
--     da verdade. Localização, detentor e status do ativo são DERIVADOS da última
--     movimentação — `patrimonio.ativo` NÃO tem area_id, detentor_id nem status. A
--     ORIGEM de uma movimentação também não é armazenada: é o destino da anterior na
--     cadeia (gravar origem como snapshot garante divergência quando há retroativa,
--     que é liberada de propósito).
--   • RBAC: área ÚNICA de página ('gestao-pessoas/inventario') — quem edita a página
--     cadastra e movimenta, sem dois níveis. Gate inicial APERTADO: só os roles que já
--     têm 'admin/acessos' recebem a área nova (mesmo padrão da 0161/0165); o admin
--     libera os demais pelo editor de roles.
--   • Reversão (manual, destrutiva): DROP SCHEMA patrimonio CASCADE, remover a linha de
--     app.rbac_role_permissoes/app.rbac_areas e as 4 entradas de diário por trigger.
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS patrimonio;

-- Nenhum papel do PostgREST alcança o schema: todo acesso é por RPC SECURITY DEFINER em
-- `public` (dono postgres). Defensivo e explícito, na postura da 0120/0122.
REVOKE ALL ON SCHEMA patrimonio FROM PUBLIC;

COMMENT ON SCHEMA patrimonio IS
  'Inventário de ativos (v5.6.0). Razão append-only de movimentações; localização e status são DERIVADOS da última movimentação, nunca colunas em patrimonio.ativo.';

-- ── 1. Enums ────────────────────────────────────────────────────────────────────
-- Os 8 tipos governam DUAS coisas: quais campos de destino são obrigatórios (CHECK
-- `mov_destino_por_tipo`, abaixo) e qual status o ativo passa a ter (derivado na leitura,
-- RPC da 0248). O espelho em TS vive em src/components/gestao-pessoas/inventario/derivar.ts
-- (DESTINO_POR_TIPO / STATUS_POR_TIPO) e tem guard próprio em derivar.test.ts — as duas
-- pontas mudam JUNTAS.
CREATE TYPE patrimonio.tipo_movimentacao AS ENUM (
  'cadastro',            -- abertura; todo ativo nasce com uma (invariante 5)
  'transferencia',
  'devolucao_estoque',   -- volta ao estoque: fica SEM detentor
  'envio_manutencao',    -- terceiro em texto livre (assistência)
  'retorno_manutencao',
  'emprestimo',
  'baixa',
  'reativacao'           -- caminho de volta de uma baixa registrada por engano
);

CREATE TYPE patrimonio.motivo_baixa AS ENUM ('venda', 'descarte', 'perda', 'doacao', 'sinistro');

CREATE TYPE patrimonio.estado_conservacao AS ENUM ('novo', 'bom', 'regular', 'ruim');

-- ── 2. Catálogos (categoria e área) ─────────────────────────────────────────────
-- ⚠️ ÁREA = DEPARTAMENTO ADMINISTRATIVO. NÃO é setor de negócio (Trips/Weddings/
-- Corporativo) — a UI usa rótulo distinto de propósito, para não colidir com a taxonomia
-- do resto da plataforma.
CREATE TABLE patrimonio.categoria (
  id        smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome      text NOT NULL CHECK (btrim(nome) <> ''),
  ordem     smallint NOT NULL DEFAULT 100,
  ativo     boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
-- UNIQUE NORMALIZADO (app.norm_nome = lower + trim + colapso de espaços, IMMUTABLE):
-- "Informática", "informatica " e "Informática  " são o mesmo catálogo.
CREATE UNIQUE INDEX categoria_nome_norm_uniq ON patrimonio.categoria (app.norm_nome(nome));

CREATE TABLE patrimonio.area (
  id        smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome      text NOT NULL CHECK (btrim(nome) <> ''),
  ordem     smallint NOT NULL DEFAULT 100,
  ativo     boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX area_nome_norm_uniq ON patrimonio.area (app.norm_nome(nome));

COMMENT ON TABLE patrimonio.area IS
  'Departamento administrativo (Financeiro, Comercial, ...). NÃO é setor de negócio — não confundir com Trips/Weddings/Corporativo.';

-- ── 3. Detentor ─────────────────────────────────────────────────────────────────
-- Duas colunas de propósito. SEM vínculo com usuário da plataforma: decisão consciente
-- (o caminho de volta é ADD COLUMN usuario_id uuid NULL um dia, puramente aditivo).
-- Vira tabela — e não texto livre — porque exige agregação ("o que a Maria tem?").
CREATE TABLE patrimonio.detentor (
  id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome      text NOT NULL CHECK (btrim(nome) <> ''),
  ativo     boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX detentor_nome_norm_uniq ON patrimonio.detentor (app.norm_nome(nome));

-- ── 4. Ativo — SÓ identidade e ficha ────────────────────────────────────────────
-- Invariante 1: nada de area_id / detentor_id / status aqui. Se um dia aparecer uma
-- coluna dessas, o razão deixou de ser a fonte da verdade.
CREATE TABLE patrimonio.ativo (
  id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo             text NOT NULL CHECK (btrim(codigo) <> ''),
  categoria_id       smallint NOT NULL REFERENCES patrimonio.categoria(id),
  descricao          text NOT NULL CHECK (btrim(descricao) <> ''),
  numero_serie       text,
  fornecedor         text,
  data_aquisicao     date CHECK (data_aquisicao IS NULL OR data_aquisicao >= DATE '2000-01-01'),
  valor_aquisicao    numeric(14,2) CHECK (valor_aquisicao IS NULL OR valor_aquisicao >= 0),
  nota_fiscal        text,
  estado_conservacao patrimonio.estado_conservacao,
  obs                text,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  criado_por         uuid REFERENCES auth.users(id),
  atualizado_em      timestamptz,
  atualizado_por     uuid REFERENCES auth.users(id)
);
-- Código UNIQUE normalizado: barra duplicata por variação de caixa/espaço ("wg-0001 " ==
-- "WG-0001"), tanto na criação quanto na EDIÇÃO da ficha.
CREATE UNIQUE INDEX ativo_codigo_norm_uniq ON patrimonio.ativo (app.norm_nome(codigo));
CREATE INDEX ativo_categoria_idx ON patrimonio.ativo (categoria_id);

-- ── 5. Movimentação — o RAZÃO, append-only ──────────────────────────────────────
-- Só `obs` é editável (via RPC própria, auditada pelo diário). Erro de destino se
-- conserta com uma movimentação NOVA, nunca com UPDATE/DELETE.
CREATE TABLE patrimonio.movimentacao (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ativo_id              integer NOT NULL REFERENCES patrimonio.ativo(id),
  tipo                  patrimonio.tipo_movimentacao NOT NULL,
  -- Retroativa é LIBERADA (invariante 8): a data do fato é livre; o limite inferior só
  -- barra erro de digitação de ano. A ordenação determinística é (data, criado_em).
  data_movimentacao     date NOT NULL CHECK (data_movimentacao >= DATE '2000-01-01'),
  area_destino_id       smallint REFERENCES patrimonio.area(id),
  detentor_destino_id   integer  REFERENCES patrimonio.detentor(id),
  destino_texto         text,                       -- terceiro/local livre (assistência, sala)
  motivo_baixa          patrimonio.motivo_baixa,
  obs                   text,
  -- Auditoria, NÃO dado de negócio (invariante 7): vem da sessão, nunca digitado.
  -- Anulável pelo mesmo motivo de financeiro.diario_alteracoes.usuario_id: operação de
  -- sistema/service_role não tem auth.uid(). A UI nunca envia este campo.
  registrado_por        uuid REFERENCES auth.users(id),
  registrado_por_nome   text,                       -- denormalizado: sobrevive à exclusão do usuário
  criado_em             timestamptz NOT NULL DEFAULT now(),

  -- CHECK POR TIPO — o contrato "que destino cada tipo exige" vira restrição de banco.
  -- Espelha DESTINO_POR_TIPO de derivar.ts. `ELSE false` é deliberado: se um 9º valor
  -- entrar no enum sem regra aqui, a inserção FALHA em vez de passar silenciosamente
  -- (um CASE sem ELSE devolve NULL, e CHECK com NULL PASSA — fail-open).
  CONSTRAINT mov_destino_por_tipo CHECK (
    CASE tipo
      -- Abertura: nasce numa ÁREA; o detentor é OPCIONAL e é ele que decide se o ativo
      -- nasce EM USO ou EM ESTOQUE (decisão do Yan, 10/08/2026).
      WHEN 'cadastro' THEN
        area_destino_id IS NOT NULL
        AND destino_texto IS NULL AND motivo_baixa IS NULL
      WHEN 'transferencia' THEN
        area_destino_id IS NOT NULL AND detentor_destino_id IS NOT NULL
        AND destino_texto IS NULL AND motivo_baixa IS NULL
      WHEN 'retorno_manutencao' THEN
        area_destino_id IS NOT NULL AND detentor_destino_id IS NOT NULL
        AND destino_texto IS NULL AND motivo_baixa IS NULL
      WHEN 'reativacao' THEN
        area_destino_id IS NOT NULL AND detentor_destino_id IS NOT NULL
        AND destino_texto IS NULL AND motivo_baixa IS NULL
      -- Estoque: fica SEM detentor (a lista mostra travessão, não erro).
      WHEN 'devolucao_estoque' THEN
        area_destino_id IS NOT NULL AND detentor_destino_id IS NULL
        AND destino_texto IS NULL AND motivo_baixa IS NULL
      -- Terceiro em texto: o item sai das áreas enquanto está na assistência.
      WHEN 'envio_manutencao' THEN
        area_destino_id IS NULL AND detentor_destino_id IS NULL
        AND btrim(coalesce(destino_texto, '')) <> '' AND motivo_baixa IS NULL
      -- Empréstimo: quem levou (a previsão de retorno vai em obs); local é opcional.
      WHEN 'emprestimo' THEN
        area_destino_id IS NULL AND detentor_destino_id IS NOT NULL
        AND motivo_baixa IS NULL
      WHEN 'baixa' THEN
        area_destino_id IS NULL AND detentor_destino_id IS NULL
        AND destino_texto IS NULL AND motivo_baixa IS NOT NULL
      ELSE false
    END
  )
);

-- Índice do estado derivado: o DISTINCT ON (ativo_id) ORDER BY data DESC, criado_em DESC
-- da RPC de listagem percorre exatamente esta ordem.
CREATE INDEX mov_ativo_ordem_idx ON patrimonio.movimentacao (ativo_id, data_movimentacao DESC, criado_em DESC);
-- Índice do razão completo (aba Movimentações, mais recentes primeiro).
CREATE INDEX mov_ordem_global_idx ON patrimonio.movimentacao (data_movimentacao DESC, criado_em DESC);

COMMENT ON TABLE patrimonio.movimentacao IS
  'Razão APPEND-ONLY. Só obs é editável. A ORIGEM não é gravada: é o destino da movimentação anterior do mesmo ativo, derivada na leitura.';

-- ── 6. Código patrimonial: sequência server-side com override manual ────────────
CREATE SEQUENCE patrimonio.ativo_codigo_seq AS integer START 1;

-- O override manual pode ter consumido um código que a sequência ainda vai gerar; por isso
-- o laço avança até achar um livre, em vez de devolver um código que estouraria o UNIQUE.
CREATE OR REPLACE FUNCTION patrimonio.proximo_codigo()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_codigo     text;
  v_tentativas integer := 0;
BEGIN
  LOOP
    v_codigo := 'WG-' || lpad(nextval('patrimonio.ativo_codigo_seq')::text, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM patrimonio.ativo a WHERE app.norm_nome(a.codigo) = app.norm_nome(v_codigo)
    );
    v_tentativas := v_tentativas + 1;
    IF v_tentativas > 10000 THEN
      RAISE EXCEPTION 'CODIGO_ESGOTADO: nenhum código livre após % tentativas', v_tentativas
        USING ERRCODE = '22023';
    END IF;
  END LOOP;
  RETURN v_codigo;
END;
$$;
REVOKE EXECUTE ON FUNCTION patrimonio.proximo_codigo() FROM PUBLIC, anon, authenticated;

-- ── 7. Seed dos catálogos (confirmado pelo Yan em 10/08/2026) ───────────────────
INSERT INTO patrimonio.categoria (nome, ordem) VALUES
  ('Informática', 10), ('Mobiliário', 20), ('Eletrônicos', 30),
  ('Telefonia', 40), ('Veículos', 50), ('Outros', 90)
ON CONFLICT DO NOTHING;

INSERT INTO patrimonio.area (nome, ordem) VALUES
  ('Diretoria', 10), ('Financeiro', 20), ('Comercial', 30), ('Operações', 40),
  ('Marketing', 50), ('Tecnologia', 60), ('Gestão de Pessoas', 70)
ON CONFLICT DO NOTHING;

-- ── 8. RLS deny-by-default (postura dos schemas do projeto, 0120/0123) ──────────
-- O app NUNCA toca estas tabelas direto (zero .from() no código); as RPCs SECURITY
-- DEFINER (dono postgres) ignoram RLS. Sem policy = deny-all para não-donos.
ALTER TABLE patrimonio.categoria    ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrimonio.area         ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrimonio.detentor     ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrimonio.ativo        ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrimonio.movimentacao ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON patrimonio.categoria    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON patrimonio.area         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON patrimonio.detentor     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON patrimonio.ativo        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON patrimonio.movimentacao FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE patrimonio.ativo_codigo_seq FROM PUBLIC, anon, authenticated;

-- ── 9. Área RBAC nova ───────────────────────────────────────────────────────────
-- Permissão ÚNICA de página: quem edita a página cadastra e movimenta (sem dois níveis).
-- Grupo próprio 'Gestão de Pessoas' no editor de roles; ordem 60 (antes do bloco
-- Administração, que começa em 50 — o editor ordena dentro do grupo).
-- ⚠️ O catálogo local (src/lib/auth/areas.ts) TEM de ganhar a mesma chave no MESMO commit:
-- rpc-contrato.test.ts exige paridade exata entre AREAS e app.rbac_areas.
INSERT INTO app.rbac_areas (area, rotulo, grupo, ordem) VALUES
  ('gestao-pessoas/inventario', 'Inventário de Ativos', 'Gestão de Pessoas', 60)
ON CONFLICT (area) DO NOTHING;

-- Gate APERTADO (padrão 0161/0165): só os roles que já têm 'admin/acessos'.
INSERT INTO app.rbac_role_permissoes (role_id, area)
  SELECT DISTINCT role_id, 'gestao-pessoas/inventario'
  FROM app.rbac_role_permissoes
  WHERE area = 'admin/acessos'
ON CONFLICT (role_id, area) DO NOTHING;

-- ── 10. Diário de alterações (reuso da 0199) ────────────────────────────────────
-- A função de trigger da 0199 é GENÉRICA (qualquer tabela com PK `id`) — nada novo a
-- criar. No `ativo`, audita a ficha; na `movimentacao`, audita a edição de obs (a única
-- mutação permitida) e registra o INSERT do razão.
CREATE TRIGGER trg_diario_patrimonio_ativo
  AFTER INSERT OR UPDATE OR DELETE ON patrimonio.ativo
  FOR EACH ROW EXECUTE FUNCTION financeiro.fn_diario_alteracoes();

CREATE TRIGGER trg_diario_patrimonio_movimentacao
  AFTER INSERT OR UPDATE OR DELETE ON patrimonio.movimentacao
  FOR EACH ROW EXECUTE FUNCTION financeiro.fn_diario_alteracoes();
