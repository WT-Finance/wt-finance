-- ---------------------------------------------------------------------------
-- 0245 — hardening(v5.5.0): faixa PLAUSÍVEL para uma taxa MENSAL de CDI.
--
-- ADITIVA. Declaração prévia (regime do CLAUDE.md): apenas
-- `ALTER TABLE ... ADD CONSTRAINT ... CHECK`. Nenhum DROP, nenhuma coluna alterada,
-- nenhuma linha reescrita. A validação roda contra o conteúdo atual e passa: a maior
-- taxa gravada é 1,28% a.m. (jul/2025), bem dentro da faixa.
--
-- POR QUE (achado MÉDIO do `revisor-db`): a `dim_taxa_cdi` nasceu com
-- `CHECK (taxa > -1 AND taxa < 1)` — sanidade de coluna (±100%), não regra de
-- negócio. O guard REAL de plausibilidade mensal (±5%) vive em TypeScript, na rota
-- de ingestão (`TETO_TAXA_MENSAL`), e portanto **não cobre o caminho que o próprio
-- ADR-0166 admite existir**: "intervenção excepcional é ato humano via SQL".
--
-- O erro típico desse caminho — digitar `0.5` pensando em `0.05` — passaria pelo
-- CHECK de ±100% sem acender nada. E o estrago não ficaria naquele mês: o
-- carry-forward projeta a última taxa conhecida sobre TODO o futuro, então um valor
-- absurdo num mês contamina o rendimento projetado inteiro. É exatamente a
-- amplificação que a `0240` já teve de consertar uma vez, só que por erro humano em
-- vez de bug de ingestão.
--
-- ⚠️ POR QUE UM CHECK NOVO EM VEZ DE APERTAR O EXISTENTE:
-- o `revisor-db` propôs `DROP CONSTRAINT` + `ADD CONSTRAINT` com a faixa nova. Isso
-- é classificado como **DESTRUTIVO** pelo gate (`ALTER ... DROP` top-level) e exige
-- humano em TTY — o agente não aplica, por construção (ADR-0131). Acrescentar uma
-- SEGUNDA restrição dá a MESMA proteção efetiva (um INSERT precisa satisfazer as
-- duas, então o limite real passa a ser ±5%) sendo puramente aditiva.
-- O custo é uma restrição redundante convivendo com a frouxa. Se algum dia valer
-- consolidar as duas numa só, aí sim é uma destrutiva de uma linha, com humano.
--
-- 5% a.m. ≈ 79% a.a. — folga de ordens de grandeza sobre qualquer CDI realista, e
-- ainda assim barra tanto o dedo errado quanto a série 4392 (anualizada) nos níveis
-- de taxa de hoje. NÃO é proteção completa contra a troca de série: com CDI anual a
-- ~4% a.a., como em 2020, o valor anualizado passaria. Quem garante a série certa é
-- a constante `SERIE_SGS_CDI_MENSAL`, não este CHECK — ele é a segunda linha.
--
-- REVERSIBILIDADE: `ALTER TABLE analytics.dim_taxa_cdi
--   DROP CONSTRAINT dim_taxa_cdi_taxa_mensal_plausivel;` (destrutiva, humano em TTY).
--
-- Verificação pós-push: a restrição existe em `pg_constraint`; a ingestão continua
-- devolvendo 200 e idempotente (nenhuma taxa real se aproxima do teto).
-- ---------------------------------------------------------------------------

ALTER TABLE analytics.dim_taxa_cdi
  ADD CONSTRAINT dim_taxa_cdi_taxa_mensal_plausivel
  CHECK (taxa > -0.05 AND taxa < 0.05);

COMMENT ON CONSTRAINT dim_taxa_cdi_taxa_mensal_plausivel ON analytics.dim_taxa_cdi IS
  'Faixa de negócio (±5% a.m.). Convive com dim_taxa_cdi_taxa_plausivel (±100%, '
  'sanidade de coluna): o INSERT satisfaz as duas, então o limite efetivo é este. '
  'Existe para o caminho de escrita MANUAL via SQL, que não passa pelo guard da rota.';

NOTIFY pgrst, 'reload schema';
