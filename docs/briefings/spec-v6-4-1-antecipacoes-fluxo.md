# v6.4.1 — Antecipações em âmbar no "Fluxo de Caixa Mensal"

## Contexto

Com o registro de antecipações da v6.4.0 (`financeiro.antecipacao`, fonte única, 38 linhas históricas), o Yan
pediu que o gráfico **Fluxo de Caixa Mensal** da página Fluxo de Caixa mostre quanto das **entradas
efetivadas** de cada mês veio de antecipação de recebíveis, em **âmbar**, dentro da barra.

Decisões do Yan (15/10, registradas no out-briefing da v6.4.0 §8):

- o segmento âmbar mostra o **valor líquido**, no mês da `data` da antecipação;
- o tooltip diz "Entradas efetivadas R$ X · das quais antecipação R$ Y (Z%)", com a nota "segundo o registro
  de antecipações";
- a entrega é um patch próprio, depois do merge da v6.4.0.

A leitura é honesta: nos 25/25 meses com antecipação, as entradas realizadas da própria conta (Asaas/Blimboo)
são ≥ o líquido antecipado. Ressalva: o recorte vem do registro, não de uma marcação do Monde.

Worktree `feat/v6-4-1-antecipacoes-fluxo` (de `a8cefb5`). Numeração livre: migration **0299**, ADR **0184**
(sem ADR previsto: é um recorte de leitura).

## Validação contra o repo (explorador)

- **Página e componente.** A página é `src/app/financeiro/fluxo-caixa/page.tsx` (`requireArea('financeiro/fluxo-caixa')`
  :104). O gráfico é `src/components/financeiro/fluxo-mensal-chart.tsx`, em Recharts direto (legado, aceito pela
  skill `graficos`).
- **Barras.** As 4 `<Bar>` ficam lado a lado (`barSize=5`), **sem `stackId`**. A tooltip customizada é
  `FluxoTooltip` (:47-74) e a legenda é `FluxoLegend` (:78-110), um array fixo.
- **Dados.** Vêm de `get_fluxo_caixa_mensal_v3()` (gate `financeiro/fluxo-caixa`, 0121; corpo 0229), com
  `mes` 'YYYY-MM' e `entrada_efetivada` = Realizado por `data_competencia`. A página faz `unwrapRpc` sem Zod.
- **Acesso às antecipações.** Nenhuma leitura de `financeiro.antecipacao` é permitida com
  `financeiro/fluxo-caixa`: as RPCs da v6.4.0 exigem `financeiro/geral` ou a área de gestão.
- **Cor.** Não há token para a série. `--warning` (âmbar) existe; `--chart-warning` é laranja. A skill
  `graficos` manda criar token semântico novo.

## Abordagem

1. **Migration `0299_fluxo_antecipacoes_mensal.sql` (aditiva).**
   - RPC nova `public.get_fluxo_antecipacoes_mensal() RETURNS json`.
   - Retorno `[{mes:'YYYY-MM', liquido, antecipado, n}]`, por mês da `data`, sobre todas as contas.
   - `PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa'])` inline, `SECURITY DEFINER`, `search_path ''`.
   - `REVOKE PUBLIC, anon`; `GRANT authenticated, service_role, verificador` (contrato).
   - **Não altera** `get_fluxo_caixa_mensal_v3`: o contrato e o consumidor atuais ficam intactos.
   - Guard de efetividade; `revisor-db` antes de aplicar; aplicação por `db:migrate --aditiva`.
   - Depois de aplicar: `database.ts` e baseline regenerados.
2. **Módulo puro `src/lib/fluxo/antecipacao-mensal.ts`** (+ teste).
   - `mesclarAntecipacoes(rows, antecipacoes)` acrescenta a cada mês:
     - `antecipacao` = min(líquido, `entrada_efetivada`), com flag `antecipacaoExcedeu` quando o registro passa
       das entradas (a cor nunca "estoura" a barra; o tooltip avisa);
     - `entrada_efetivada_sem_antecipacao`;
     - `pctAntecipacao`.
   - Mês sem registro = 0.
3. **Página.** Busca a RPC nova em paralelo, com validação Zod/`parseRpc`.
   - Se falhar, o gráfico rende **sem** o âmbar e mostra uma nota discreta (degradação, sem quebrar o
     gráfico existente).
4. **Gráfico** (`fluxo-mensal-chart.tsx`).
   - A barra `entrada_efetivada` vira **dois segmentos empilhados** (`stackId="entrada"`, mesma coluna de 5 px).
     As outras 3 barras não mudam.
   - Base = antecipação em **âmbar**, sem raio. Topo = restante em `--positive`, com `[2,2,0,0]`. O topo
     verde preserva o arredondamento; com âmbar em 100% da barra, o topo some sem prejuízo.
   - **Tooltip:** a linha das entradas efetivadas passa a ler o ponto inteiro: "R$ X · das quais antecipação
     R$ Y (Z%)", mais "segundo o registro de antecipações" quando Y > 0.
   - **Legenda:** item "Antecipação (dentro das entradas efetivadas)".
5. **Cor.** Token novo `--chart-antecipacao` em `src/styles/tokens.css` (âmbar, com variante dark), registrado
   em `fluxoColors` (`src/lib/charts/chart-theme.ts` ou onde estiver). É arquivo-ímã: dono único, o orquestrador.
6. **Contratos** (`src/lib/rpc-contrato.test.ts`).
   - Forma da RPC nova pelo schema.
   - Σ `liquido` ≡ Σ do registro, via `get_geral_antecipacoes` por ano: dois números vizinhos, um caso.
   - `anon` negado.
   - Allowlist do `verificador` derivada.
7. **Fechamento** (`/fechamento-versao`): `revisor` (+ `revisor-db` antes de aplicar), gates, CHANGELOG,
   CHANGELOG_DIRETORIA ("o gráfico de fluxo de caixa mostra, em âmbar, quanto das entradas veio de
   antecipação"), bump 6.4.1, out-briefing, WORKING-CONTEXT, PR draft.

## Arquivos críticos

- `supabase/migrations/0299_fluxo_antecipacoes_mensal.sql` (novo);
- `src/types/database.ts`, `supabase/baseline/schema-v6.json`;
- `src/app/financeiro/fluxo-caixa/page.tsx`;
- `src/components/financeiro/fluxo-mensal-chart.tsx`;
- `src/lib/fluxo/antecipacao-mensal.ts` (+ `.test.ts`) — novo;
- `src/styles/tokens.css`, `src/lib/charts/chart-theme.ts` (ímãs);
- `src/lib/rpc-contrato.test.ts`.

## Verificação

- **Ensaio em transação revertida** com a migration: a RPC devolve os meses com Σ líquido = 7.057.349,44 (as
  38 linhas). Com identidade de usuário com `financeiro/fluxo-caixa` é atendido; sem a área, negado.
- **REST service_role** pós-push; contratos M7-like verdes.
- **Teste do módulo puro:** mês sem antecipação, antecipação parcial, antecipação > entradas (clamp + flag),
  meses só previstos.
- **Gates:** tsc, lint, build, `npm test`.
- **Visual:** sem credencial humana e sem navegador em sessão de background, então o Yan confere no preview
  (abr/26 deve mostrar R$ 700,3 mil âmbar dentro de R$ 7,21 mi).
