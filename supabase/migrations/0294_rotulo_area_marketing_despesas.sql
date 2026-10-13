-- 0294_rotulo_area_marketing_despesas.sql — v6.3.0
-- Rename do RÓTULO de exibição da área `marketing/gastos` no modal de "Usuários e Acessos":
-- 'Gastos' → 'Despesas'. A página passou a se chamar "Despesas de Marketing" (pedido do Yan, 09/10:
-- alinhar ao nome do grupo de categoria da DRE) e o editor de roles ainda mostrava "Gastos". O modal lê
-- o rotulo de app.rbac_areas via admin_listar_areas (AREA_INFO em src/lib/auth/areas.ts é FALLBACK e
-- já espelha o rótulo novo), então a mudança só aparece na UI depois desta migration. Mesmo precedente
-- da 0168 e da 0184.
--
-- DECLARAÇÃO (ADR-0116): esta migration é DESTRUTIVA por classificação — é UPDATE em dado existente
-- (rbac_areas.rotulo). NÃO altera `area` (a chave continua 'marketing/gastos' — FK, permissões, guards,
-- `app.exigir_acesso` e as RPCs não mudam), `grupo` nem `ordem`. Só metadado de exibição. Reversível:
-- bloco DOWN abaixo. Aplicada por HUMANO em TTY (`npm run db:migrate -- --destrutiva`) — o agente não
-- aplica (o wrapper aborta sem TTY, ADR-0131).

BEGIN;

UPDATE app.rbac_areas SET rotulo = 'Despesas' WHERE area = 'marketing/gastos' AND rotulo = 'Gastos';

-- Guard de efetividade: a área tem de existir com o rótulo novo (pega nome de área digitado errado,
-- que faria o UPDATE afetar zero linhas em silêncio) e o resto da linha não pode ter mudado.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app.rbac_areas
                  WHERE area = 'marketing/gastos' AND rotulo = 'Despesas' AND grupo = 'Marketing' AND ordem = 70) THEN
    RAISE EXCEPTION '0294: área marketing/gastos ausente ou divergente depois do UPDATE (esperado rotulo Despesas, grupo Marketing, ordem 70)';
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ===== DOWN (reverter o rótulo) =====
--   UPDATE app.rbac_areas SET rotulo = 'Gastos' WHERE area = 'marketing/gastos';
-- ===== fim DOWN =====
