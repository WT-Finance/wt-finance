-- ---------------------------------------------------------------------------
-- 0170 — chore(cadastro): normaliza pct_juros / pct_multa em app.cliente_corporativo
--
-- ⚠️ DESTRUTIVA (UPDATE em dado existente) — exige CONFIRMAÇÃO HUMANA no apply
--    (`npm run db:migrate -- --destrutiva`; backup-gate como rede de recuperação).
--
--   • O QUE FAZ (limpeza única dos 239 registros atuais):
--       pct_juros / pct_multa: vazio/null OU "padrão" → '2%';  "N% <texto>" → apenas 'N%'.
--       (o valor passa a ser só o percentual: "1% ao mês"→"1%", "5% sobre valor integral
--        da fatura"→"5%", "10% valor integral da fatura"→"10%").
--   • ESCOPO: só as colunas de texto pct_juros/pct_multa; nenhuma outra coluna/tabela é tocada.
--   • IDEMPOTENTE: cada UPDATE tem WHERE que só atinge linhas que MUDAM (re-rodar é no-op);
--       nunca zera um valor (o ramo de extração exige `~ '\d…%'`, senão não entra).
--   • PRÉ-IMAGEM (distintos em produção no momento da escrita, p/ registro/reversão):
--       pct_juros:  187 vazio/null · 43 "padrão" · 9 "1% ao mês".
--       pct_multa:  187 vazio/null · 43 "padrão" · 6 "5% sobre valor integral da fatura"
--                   · 3 "10% valor integral da fatura".
--   • REVERSÃO: o colapso vazio+"padrão"→'2%' NÃO é reversível campo-a-campo (as duas origens
--       ficam indistinguíveis). Recuperação = backup-do-dia gerado pelo backup-gate no apply
--       (~/wt-finance-backups/AAAA-MM-DD-*). Os valores de texto originais estão documentados acima.
--   • Regra de negócio (percentual "puro") acordada com o Yan; só a limpeza dos registros atuais
--     (normalizar a ENTRADA de novos cadastros seria follow-up à parte — fora deste escopo).
-- ---------------------------------------------------------------------------

-- Juros: vazio/"padrão" → 2%
UPDATE app.cliente_corporativo
   SET pct_juros = '2%'
 WHERE pct_juros IS DISTINCT FROM '2%'
   AND (NULLIF(btrim(pct_juros), '') IS NULL OR lower(btrim(pct_juros)) IN ('padrão', 'padrao'));

-- Juros: "N% <texto>" → apenas "N%"
UPDATE app.cliente_corporativo
   SET pct_juros = (regexp_match(pct_juros, '(\d+(?:[.,]\d+)?)\s*%'))[1] || '%'
 WHERE NULLIF(btrim(pct_juros), '') IS NOT NULL
   AND lower(btrim(pct_juros)) NOT IN ('padrão', 'padrao')
   AND pct_juros ~ '\d+(?:[.,]\d+)?\s*%'
   AND pct_juros IS DISTINCT FROM (regexp_match(pct_juros, '(\d+(?:[.,]\d+)?)\s*%'))[1] || '%';

-- Multa: vazio/"padrão" → 2%
UPDATE app.cliente_corporativo
   SET pct_multa = '2%'
 WHERE pct_multa IS DISTINCT FROM '2%'
   AND (NULLIF(btrim(pct_multa), '') IS NULL OR lower(btrim(pct_multa)) IN ('padrão', 'padrao'));

-- Multa: "N% <texto>" → apenas "N%"
UPDATE app.cliente_corporativo
   SET pct_multa = (regexp_match(pct_multa, '(\d+(?:[.,]\d+)?)\s*%'))[1] || '%'
 WHERE NULLIF(btrim(pct_multa), '') IS NOT NULL
   AND lower(btrim(pct_multa)) NOT IN ('padrão', 'padrao')
   AND pct_multa ~ '\d+(?:[.,]\d+)?\s*%'
   AND pct_multa IS DISTINCT FROM (regexp_match(pct_multa, '(\d+(?:[.,]\d+)?)\s*%'))[1] || '%';
