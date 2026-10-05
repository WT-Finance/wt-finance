-- ---------------------------------------------------------------------------
-- 0290 — feat(v6.2.0): espelho Monde na API OFICIAL v3 — índice de cabeçalhos + caches de nome
--
-- DECLARAÇÃO (CLAUDE.md): ADITIVA / retrocompatível com a `main` viva.
--   • CREATE de 3 tabelas NOVAS (monde.venda_cabecalho, monde.pessoa, monde.produto_catalogo),
--     1 função auxiliar NOVA (monde.cabecalho_hash) e 10 RPCs NOVAS public.monde_* (service_role).
--   • SEMENTE = INSERT … ON CONFLICT DO NOTHING **só nas tabelas novas**, lendo (SELECT) o espelho
--     existente. NÃO altera tabela, coluna nem dado pré-existente; NÃO toca monde.venda/venda_item,
--     a mv nem nenhuma RPC de leitura. A `main` viva não conhece estas tabelas — nada nela muda.
--   • UPDATE/upsert só vivem DENTRO de corpos de função e só tocam as tabelas NOVAS.
--   DOWN: DROP das 10 RPCs, de monde.cabecalho_hash e das 3 tabelas (sem dado a restaurar: tudo aqui é
--   derivado do espelho ou da API).
--
-- Por quê: a `monde-data` (intermediária do TTARS) foi desligada em 02/10/2026 e responde 410. O
-- Janus passa a ler direto de https://web.monde.com.br/api/v3, que (medido em 05/10/2026):
--   • NÃO filtra a lista por data e a ordena por CRIAÇÃO (created_at/sale_number desc) — a sonda
--     achou 0 inversões em created_at e 41 em sale_date em 300 vendas;
--   • não tem "alterado desde" — a instrução do Yan é guardar o cabeçalho de cada venda e só abrir
--     /sales/{id} de venda nova ou com status/totals diferente da última leitura;
--   • manda pagante/vendedor/fornecedor só como {id} (nome em /people/{id}) e o produto do catálogo
--     só como {id} (nome em /products/{id}).
--
-- `monde.venda_cabecalho` é esse índice de mudança. `cabecalho_hash` = status + final_amount + revenue
-- + products + discount + fees — SEM `balance`, que mexe a cada pagamento e não toca coluna nenhuma do
-- espelho. `lido_hash` é o hash do cabeçalho na última leitura bem-sucedida do detalhe: diferente ⇒
-- a venda está na fila. `classificacao` guarda o veredito do transform (espelhada/welcome/sem_setor/
-- erro) — é de onde a cura e o tripwire apuram o mês sem reabrir detalhe nenhum.
--
-- O hash é calculado AQUI (não no TS) para que a semente e a varredura usem a MESMA fórmula: número
-- normalizado por trim_scale, então 1179.29 e 1179.290 dão o mesmo hash.
--
-- SEMENTE. O `raw` guardado no espelho JÁ É o payload de GET /sales/{id} da v3 (diff da 74833 fresca
-- × guardada em 05/10: só custom_fields editados depois). Então:
--   • venda_cabecalho nasce "lida" para toda venda do espelho com raw no formato v3 — a 1ª varredura
--     só enfileira o que mudou desde a última sincronização do TTARS, não ~2.600 vendas de uma vez;
--     visto_em = sincronizado_em (não now()): a apuração do mês só conta o que uma varredura REAL viu;
--   • pessoa nasce com os pares id→nome já gravados (pagante, vendedor fora do campo 11, fornecedor
--     casado item a item pela ordem dos arrays — a mesma ordem medida em 05/10), o mais recente por id.
--     origem='semente' e atualizado_em = sincronizado_em: o TTL de 30 dias do código re-busca na API.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Tabelas
-- ===========================================================================
CREATE TABLE IF NOT EXISTS monde.venda_cabecalho (
  sale_id         uuid PRIMARY KEY,                 -- id da venda no Monde (abre /sales/{id})
  venda_numero    text NOT NULL,                    -- sale_number (número na v3, texto aqui como no espelho)
  data_venda      date NOT NULL,                    -- sale_date
  criado_monde    timestamp NOT NULL,               -- created_at SEM fuso (horário de Brasília, como vem)
  status          text NOT NULL,                    -- opened | closed | canceled
  totais          jsonb NOT NULL,                   -- totals da lista, como veio
  cabecalho_hash  text NOT NULL,                    -- monde.cabecalho_hash(status, totais)
  visto_em        timestamptz NOT NULL,             -- última varredura que listou a venda
  lido_hash       text,                             -- cabecalho_hash na última leitura OK do detalhe
  lido_em         timestamptz,                      -- última tentativa de leitura do detalhe
  classificacao   text CHECK (classificacao IN ('espelhada', 'welcome', 'sem_setor', 'erro')),
  erro            text
);
CREATE INDEX IF NOT EXISTS venda_cabecalho_data_venda_idx ON monde.venda_cabecalho (data_venda);
CREATE INDEX IF NOT EXISTS venda_cabecalho_criado_idx     ON monde.venda_cabecalho (criado_monde DESC);
ALTER TABLE monde.venda_cabecalho ENABLE ROW LEVEL SECURITY;   -- deny-by-default (postura do schema)

CREATE TABLE IF NOT EXISTS monde.pessoa (
  id             uuid PRIMARY KEY,                  -- id da pessoa no Monde
  nome           text,                              -- /people/{id}.name (PJ: name, não legal_name)
  cpf_cnpj       text,
  origem         text NOT NULL CHECK (origem IN ('semente', 'api')),
  atualizado_em  timestamptz NOT NULL
);
ALTER TABLE monde.pessoa ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS monde.produto_catalogo (
  id             uuid PRIMARY KEY,                  -- id do produto do catálogo (/products/{id})
  nome           text,
  kind           text,
  atualizado_em  timestamptz NOT NULL
);
ALTER TABLE monde.produto_catalogo ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- 2. Hash do cabeçalho (fórmula ÚNICA — semente e varredura)
-- ===========================================================================
CREATE OR REPLACE FUNCTION monde.cabecalho_hash(p_status text, p_totais jsonb)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT md5(concat_ws('|',
    coalesce(p_status, ''),
    (SELECT string_agg(
       CASE jsonb_typeof(p_totais -> k)
         WHEN 'number' THEN trim_scale((p_totais ->> k)::numeric)::text
         ELSE coalesce(p_totais ->> k, '')
       END, '|' ORDER BY ord)
     FROM unnest(ARRAY['final_amount', 'revenue', 'products', 'discount', 'fees']) WITH ORDINALITY AS t(k, ord))
  ));
$$;
REVOKE EXECUTE ON FUNCTION monde.cabecalho_hash(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION monde.cabecalho_hash(text, jsonb) TO service_role;

-- ===========================================================================
-- 3. RPCs (service_role-only — mesma postura das monde_ingest_*)
-- ===========================================================================

-- 3.1 Registra uma página de cabeçalhos da lista. Devolve quantos eram novos e quantos ficaram na fila.
CREATE OR REPLACE FUNCTION public.monde_cabecalho_registrar(p_cabecalhos jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v jsonb;
BEGIN
  WITH e AS (
    SELECT DISTINCT ON ((x ->> 'sale_id')::uuid)
      (x ->> 'sale_id')::uuid              AS sale_id,
      x ->> 'venda_numero'                 AS venda_numero,
      (x ->> 'data_venda')::date           AS data_venda,
      (x ->> 'criado_monde')::timestamp    AS criado_monde,
      x ->> 'status'                       AS status,
      coalesce(x -> 'totais', '{}'::jsonb) AS totais
    FROM jsonb_array_elements(coalesce(p_cabecalhos, '[]'::jsonb)) AS x
    WHERE x ->> 'sale_id' IS NOT NULL
    ORDER BY (x ->> 'sale_id')::uuid
  ), up AS (
    INSERT INTO monde.venda_cabecalho AS c
      (sale_id, venda_numero, data_venda, criado_monde, status, totais, cabecalho_hash, visto_em)
    SELECT e.sale_id, e.venda_numero, e.data_venda, e.criado_monde, e.status, e.totais,
           monde.cabecalho_hash(e.status, e.totais), now()
    FROM e
    ON CONFLICT (sale_id) DO UPDATE SET
      venda_numero = EXCLUDED.venda_numero, data_venda = EXCLUDED.data_venda,
      criado_monde = EXCLUDED.criado_monde, status = EXCLUDED.status, totais = EXCLUDED.totais,
      cabecalho_hash = EXCLUDED.cabecalho_hash, visto_em = now(),
      -- Data ou número da venda mudou ⇒ RELER, mesmo com o hash igual (ALTO do revisor-db): a venda
      -- mudaria de mês na apuração sem mudar no espelho, e a cura do mês antigo a apagaria.
      lido_hash = CASE
        WHEN c.data_venda IS DISTINCT FROM EXCLUDED.data_venda
          OR c.venda_numero IS DISTINCT FROM EXCLUDED.venda_numero THEN NULL
        ELSE c.lido_hash END
    RETURNING (xmax = 0) AS novo, (c.lido_hash IS DISTINCT FROM c.cabecalho_hash) AS pendente
  )
  SELECT jsonb_build_object(
    'registrados', count(*),
    'novos',       count(*) FILTER (WHERE novo),
    'pendentes',   count(*) FILTER (WHERE pendente),
    -- Instante do BANCO (início da transação): a varredura usa o da 1ª página como `p_visto_desde`
    -- da apuração — relógio do app adiantado tiraria páginas da conta (MÉDIO do revisor-db).
    'agora',       now()
  ) INTO v FROM up;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_cabecalho_registrar(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_cabecalho_registrar(jsonb) TO service_role;

-- 3.2 Fila de leitura de detalhe: primeiro as PENDENTES (nunca lidas / cabeçalho mudou / erro — erro
-- por último, para não monopolizar o orçamento), depois a REVISITA (já lidas, dentro da janela,
-- lidas há mais tempo primeiro). A revisita cobre edição que não mexe no cabeçalho (Setor, fornecedor).
CREATE OR REPLACE FUNCTION public.monde_cabecalho_fila(
  p_limite int, p_revisita_desde date, p_revisita_antes timestamptz
)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  WITH pend AS (
    SELECT sale_id, venda_numero, cabecalho_hash, 1 AS grupo,
           -- Não-erro: mais nova primeiro. Erro: no fim, e a tentada há mais tempo primeiro — erro
           -- permanente não monopoliza a ponta da fila em todo tick (MÉDIO do revisor-db).
           row_number() OVER (ORDER BY coalesce(classificacao = 'erro', false),
             CASE WHEN classificacao = 'erro' THEN lido_em END ASC NULLS FIRST,
             criado_monde DESC, sale_id) AS ord
    FROM monde.venda_cabecalho
    WHERE lido_hash IS DISTINCT FROM cabecalho_hash
  ), rev AS (
    SELECT sale_id, venda_numero, cabecalho_hash, 2 AS grupo,
           row_number() OVER (ORDER BY lido_em ASC NULLS FIRST, sale_id) AS ord
    FROM monde.venda_cabecalho
    WHERE lido_hash = cabecalho_hash
      AND data_venda >= p_revisita_desde
      AND (lido_em IS NULL OR lido_em < p_revisita_antes)
  ), t AS (
    SELECT * FROM pend WHERE ord <= p_limite
    UNION ALL
    SELECT * FROM rev WHERE ord <= p_limite
  ), lim AS (
    SELECT * FROM t ORDER BY grupo, ord LIMIT greatest(p_limite, 0)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'sale_id', sale_id, 'venda_numero', venda_numero, 'cabecalho_hash', cabecalho_hash,
           'motivo', CASE grupo WHEN 1 THEN 'pendente' ELSE 'revisita' END
         ) ORDER BY grupo, ord), '[]'::jsonb)
  FROM lim;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_cabecalho_fila(int, date, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_cabecalho_fila(int, date, timestamptz) TO service_role;

-- 3.3 Grava o veredito de cada leitura. Chamado SÓ depois do promover da venda — marcar antes e
-- falhar no promover deixaria a venda "lida" sem estar no espelho. `erro` zera `lido_hash`: a venda
-- volta à fila (no fim dela) e o mês fica não-íntegro até a próxima leitura dar certo.
CREATE OR REPLACE FUNCTION public.monde_cabecalho_marcar(p_resultados jsonb)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_n   int;
  v_ruim int;
BEGIN
  -- Classificação ausente/fora do domínio LANÇA (ALTO do revisor-db): o CHECK da coluna aceita NULL,
  -- e uma venda com hash lido e classificação NULL não conta em categoria nenhuma da apuração — sairia
  -- de `espelhaveis_ids` sem bloquear a cura.
  SELECT count(*) INTO v_ruim
  FROM jsonb_array_elements(coalesce(p_resultados, '[]'::jsonb)) AS x
  WHERE x ->> 'sale_id' IS NULL
     OR coalesce(x ->> 'classificacao', '') NOT IN ('espelhada', 'welcome', 'sem_setor', 'erro')
     OR (x ->> 'classificacao' <> 'erro' AND x ->> 'lido_hash' IS NULL);
  IF v_ruim > 0 THEN
    RAISE EXCEPTION 'monde_cabecalho_marcar: % resultado(s) sem sale_id, classificação válida ou lido_hash', v_ruim;
  END IF;

  UPDATE monde.venda_cabecalho c SET
    lido_hash     = CASE WHEN r.classificacao = 'erro' THEN NULL ELSE r.lido_hash END,
    lido_em       = now(),
    classificacao = r.classificacao,
    erro          = CASE WHEN r.classificacao = 'erro' THEN left(r.erro, 500) ELSE NULL END
  FROM (
    SELECT (x ->> 'sale_id')::uuid AS sale_id, x ->> 'lido_hash' AS lido_hash,
           x ->> 'classificacao' AS classificacao, x ->> 'erro' AS erro
    FROM jsonb_array_elements(coalesce(p_resultados, '[]'::jsonb)) AS x
  ) r
  WHERE c.sale_id = r.sale_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_cabecalho_marcar(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_cabecalho_marcar(jsonb) TO service_role;

-- 3.4 Força a releitura de um intervalo de data de venda (modos manuais `window`/`backfill`).
CREATE OR REPLACE FUNCTION public.monde_cabecalho_forcar(p_from date, p_to date)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_n int;
BEGIN
  UPDATE monde.venda_cabecalho SET lido_hash = NULL
  WHERE data_venda BETWEEN p_from AND p_to AND lido_hash IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_cabecalho_forcar(date, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_cabecalho_forcar(date, date) TO service_role;

-- 3.4b Invalida as vendas que a CURA acabou de remover do espelho (MÉDIO do revisor-db): sem isto o
-- cabeçalho seguiria "lido e espelhado", e uma venda que VOLTASSE à lista com o mesmo cabeçalho nunca
-- seria relida — ficaria fora do espelho contando como espelhável.
CREATE OR REPLACE FUNCTION public.monde_cabecalho_invalidar(p_numeros text[])
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_n int;
BEGIN
  UPDATE monde.venda_cabecalho SET lido_hash = NULL
  WHERE venda_numero = ANY(coalesce(p_numeros, '{}'::text[]));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_cabecalho_invalidar(text[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_cabecalho_invalidar(text[]) TO service_role;

-- 3.5 Apuração de um mês para a cura e o tripwire. Só conta o que a varredura iniciada em
-- `p_visto_desde` LISTOU: venda que sumiu da lista fica fora de `api` e de `espelhaveis_ids` — e por
-- isso vira candidata da cura, a mesma semântica de antes (v5.6.3).
CREATE OR REPLACE FUNCTION public.monde_cabecalho_apurar(p_from date, p_to date, p_visto_desde timestamptz)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'api',         count(*),
    'espelhaveis', count(*) FILTER (WHERE lido_hash = cabecalho_hash AND classificacao = 'espelhada'),
    'welcome',     count(*) FILTER (WHERE lido_hash = cabecalho_hash AND classificacao = 'welcome'),
    'sem_setor',   count(*) FILTER (WHERE lido_hash = cabecalho_hash AND classificacao = 'sem_setor'),
    'erros',       count(*) FILTER (WHERE classificacao = 'erro'),
    'pendentes',   count(*) FILTER (WHERE lido_hash IS DISTINCT FROM cabecalho_hash
                                      AND classificacao IS DISTINCT FROM 'erro'),
    'espelhaveis_ids', coalesce(jsonb_agg(sale_id)
                         FILTER (WHERE lido_hash = cabecalho_hash AND classificacao = 'espelhada'), '[]'::jsonb)
  )
  FROM monde.venda_cabecalho
  WHERE data_venda BETWEEN p_from AND p_to
    AND visto_em >= p_visto_desde;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_cabecalho_apurar(date, date, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_cabecalho_apurar(date, date, timestamptz) TO service_role;

-- 3.6 Cache de pessoas: leitura por lote de ids e gravação do que veio da API.
CREATE OR REPLACE FUNCTION public.monde_pessoa_obter(p_ids uuid[])
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(jsonb_object_agg(id::text, jsonb_build_object(
           'nome', nome, 'cpf_cnpj', cpf_cnpj, 'atualizado_em', atualizado_em)), '{}'::jsonb)
  FROM monde.pessoa
  WHERE id = ANY(coalesce(p_ids, '{}'::uuid[]));
$$;
REVOKE EXECUTE ON FUNCTION public.monde_pessoa_obter(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_pessoa_obter(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.monde_pessoa_registrar(p_pessoas jsonb)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_n int;
BEGIN
  INSERT INTO monde.pessoa AS p (id, nome, cpf_cnpj, origem, atualizado_em)
  SELECT DISTINCT ON ((x ->> 'id')::uuid)
         (x ->> 'id')::uuid, x ->> 'nome', x ->> 'cpf_cnpj', 'api', now()
  FROM jsonb_array_elements(coalesce(p_pessoas, '[]'::jsonb)) AS x
  WHERE x ->> 'id' IS NOT NULL
  ORDER BY (x ->> 'id')::uuid
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome, cpf_cnpj = EXCLUDED.cpf_cnpj, origem = 'api', atualizado_em = now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_pessoa_registrar(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_pessoa_registrar(jsonb) TO service_role;

-- 3.7 Cache do catálogo de produtos (813 itens em 05/10 — cabe inteiro numa resposta).
CREATE OR REPLACE FUNCTION public.monde_catalogo_obter()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(jsonb_object_agg(id::text, jsonb_build_object('nome', nome, 'kind', kind)), '{}'::jsonb)
  FROM monde.produto_catalogo;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_catalogo_obter() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_catalogo_obter() TO service_role;

CREATE OR REPLACE FUNCTION public.monde_catalogo_registrar(p_produtos jsonb)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_n int;
BEGIN
  INSERT INTO monde.produto_catalogo AS p (id, nome, kind, atualizado_em)
  SELECT DISTINCT ON ((x ->> 'id')::uuid)
         (x ->> 'id')::uuid, x ->> 'nome', x ->> 'kind', now()
  FROM jsonb_array_elements(coalesce(p_produtos, '[]'::jsonb)) AS x
  WHERE x ->> 'id' IS NOT NULL
  ORDER BY (x ->> 'id')::uuid
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, kind = EXCLUDED.kind, atualizado_em = now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_catalogo_registrar(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_catalogo_registrar(jsonb) TO service_role;

-- ===========================================================================
-- 4. Semente (INSERT só nas tabelas novas; lê o espelho)
-- ===========================================================================
-- Só `raw` no formato v3 (tem `id` e `created_at`; o formato antigo de 2025 não tem) e `sale_id`
-- preenchido. Desempate do DISTINCT ON por sincronizado_em e id — nunca empate sem desempate.

-- 4.1 Cabeçalhos "já lidos" a partir do raw.
INSERT INTO monde.venda_cabecalho
  (sale_id, venda_numero, data_venda, criado_monde, status, totais, cabecalho_hash,
   visto_em, lido_hash, lido_em, classificacao)
SELECT DISTINCT ON (v.sale_id)
  v.sale_id, v.venda_numero, v.data_venda, (v.raw ->> 'created_at')::timestamp,
  v.raw ->> 'status', v.raw -> 'totals',
  monde.cabecalho_hash(v.raw ->> 'status', v.raw -> 'totals'),
  v.sincronizado_em,
  monde.cabecalho_hash(v.raw ->> 'status', v.raw -> 'totals'),
  v.sincronizado_em,
  'espelhada'
FROM monde.venda v
WHERE v.sale_id IS NOT NULL
  AND v.raw ? 'id' AND v.raw ? 'created_at' AND v.raw ->> 'status' IS NOT NULL
  AND jsonb_typeof(v.raw -> 'totals') = 'object'
ORDER BY v.sale_id, v.sincronizado_em DESC, v.id DESC
ON CONFLICT (sale_id) DO NOTHING;

-- 4.2 Pessoas a partir dos pares id→nome já gravados.
WITH v3 AS (
  SELECT v.* FROM monde.venda v
  WHERE v.raw ? 'id' AND v.raw ? 'created_at'
), pagantes AS (
  SELECT v.raw -> 'payer' ->> 'id' AS pid, v.pagante AS nome, v.pagante_doc AS doc, v.sincronizado_em, v.id AS ord
  FROM v3 v WHERE v.pagante IS NOT NULL
), vendedores AS (
  -- Fora de Weddings-com-campo-11 o `vendedor` gravado É o nome do seller (34/34 conferidos na API).
  SELECT v.raw -> 'seller' ->> 'id', v.vendedor, NULL::text, v.sincronizado_em, v.id
  FROM v3 v
  WHERE v.vendedor IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE jsonb_typeof(v.raw -> 'custom_fields') WHEN 'array' THEN v.raw -> 'custom_fields' ELSE '[]'::jsonb END) c
      WHERE c ->> 'id' = '11' AND nullif(btrim(c ->> 'value'), '') IS NOT NULL)
), produtos AS (
  SELECT v.id AS venda_id, v.sincronizado_em, k.nome AS kind, p.val -> 'supplier' ->> 'id' AS sid,
         count(*) OVER (PARTITION BY v.id, k.nome) AS n_tipo
  FROM v3 v
  CROSS JOIN LATERAL unnest(ARRAY['hotels', 'airline_tickets', 'insurances', 'cruises', 'car_rentals',
    'ground_transportations', 'train_tickets', 'travel_packages', 'others', 'operations',
    'cvc_packages', 'excursions']) AS k(nome)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE jsonb_typeof(v.raw -> k.nome) WHEN 'array' THEN v.raw -> k.nome ELSE '[]'::jsonb END
  ) AS p(val)
), itens AS (
  SELECT i.venda_id, i.product_kind, i.fornecedor,
         count(*) OVER (PARTITION BY i.venda_id, i.product_kind) AS n_tipo
  FROM monde.venda_item i
), fornecedores AS (
  -- Só o par SEM ambiguidade (MÉDIO do revisor-db): exatamente 1 produto daquele tipo na venda, dos
  -- dois lados. Nada de casar por posição — a ordem de `venda_item.id` não é garantida pelo promover,
  -- e um nome errado contaminaria todas as vendas daquele fornecedor. O que fica de fora vem da API.
  SELECT pr.sid, it.fornecedor, NULL::text, pr.sincronizado_em, pr.venda_id
  FROM produtos pr
  JOIN itens it ON it.venda_id = pr.venda_id AND it.product_kind = pr.kind
  WHERE pr.n_tipo = 1 AND it.n_tipo = 1 AND it.fornecedor IS NOT NULL
), todos AS (
  SELECT * FROM pagantes UNION ALL SELECT * FROM vendedores UNION ALL SELECT * FROM fornecedores
), docs AS (
  -- CPF/CNPJ = o documento NÃO NULO mais recente da pessoa como pagante (MÉDIO do revisor-db): a linha
  -- vencedora do nome pode ser de vendedor/fornecedor, que não traz documento.
  SELECT DISTINCT ON (t.pid) t.pid, t.doc
  FROM todos t WHERE t.doc IS NOT NULL
  ORDER BY t.pid, t.sincronizado_em DESC, t.ord DESC
)
INSERT INTO monde.pessoa (id, nome, cpf_cnpj, origem, atualizado_em)
SELECT DISTINCT ON (t.pid::uuid) t.pid::uuid, t.nome, d.doc, 'semente', t.sincronizado_em
FROM todos t
LEFT JOIN docs d ON d.pid = t.pid
WHERE t.pid ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
ORDER BY t.pid::uuid, t.sincronizado_em DESC, t.ord DESC
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
