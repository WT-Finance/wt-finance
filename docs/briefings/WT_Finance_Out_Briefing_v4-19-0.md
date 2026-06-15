# WT Finance — Out-Briefing v4.19.0

**Data:** 2026-06-14 · **Branch:** `feat/v4-19-0-data-drawer-tipos-multiselecao` (base `main`) · **Versão:** 4.18.0 → **4.19.0** (MINOR)
**Tema:** **Regra de data configurável por campo, refinos de Solicitações e multi-seleção de operações (Weddings).** Regime autônomo com fronteira de produto. **Merge e deploy ficam com o usuário.**

---

## Missões (todas implementadas)

| Bloco | Commit | Conteúdo |
|-------|--------|----------|
| **M1 — Drawer** | `321bca7` | Drawer de detalhe redisposto em 3 zonas: cabeçalho (status + limite, vermelho se vencida), faixa de metadados (destinatário/solicitante/aberta em — hora no fuso SP via `fmtDataHoraSP`), campos com hierarquia rótulo→valor em grade de dois. Anexos em bloco próprio com ícone por tipo de arquivo. `decidido_em` também passa a exibir hora SP. **Visual puro.** |
| **M2 — Tabela de tipos** | `4db9a21` | Ações da linha em ícone (Editar/Arquivar-Desarquivar/Excluir, padrão de aba-usuarios). **Excluir desabilitado + tooltip** quando o tipo tem solicitações (`n_solicitacoes > 0`) — a regra de só-excluir-virgem fica visível na UI em vez de erro pós-clique. **Visual puro** (+ o gate de disable deliberado). |
| **M3 — Regra de data (banco)** | `7d79427` | Migration **0140 aditiva**: colunas `data_permite_passado` (bool NOT NULL DEFAULT true) e `data_aviso_dias_futuro` (int NULL). 4 RPCs conhecem as colunas (`solic_tipos_abertura`/`admin_solic_listar_tipos` emitem; `admin_solic_salvar_tipo` persiste; `criar_solicitacao` bloqueia data < HOJE SP quando `permite_passado=false`). Snapshot intocado. |
| **M4 — Regra de data (UI)** | `591fa0e` | As 5 camadas da fontanaria: `campoDefSchema` (Zod, optional), map do `handleSubmit`, map do `salvarTipo`, + os SELECTs/INSERT na 0140. Construtor: sub-bloco de data (permitir passado + avisar N dias). Preenchimento: `min` (espelho do bloqueio server) + aviso inline não-bloqueante (reusa `hojeSP`). Teste de contrato prova a sobrevivência das chaves. |
| **M5 — Multi-seleção (RPC)** | `8395702` | Migration **0141 levemente destrutiva** (DROP+CREATE de núcleo+wrapper; 3º param `text → text[]`): predicado → `operacao = ANY(p_operacoes)`. GRANTs realinhados (`authenticated`/`service_role`, nunca `anon`). Retorno inalterado. |
| **M6 — Multi-seleção (front)** | `41231bc` | `dropdown-operacao` multi-seleção: checkbox por linha, "Todas as operações" mutuamente exclusiva (vazio = Todas), rótulo do gatilho vira contador, param URL como lista. Só os 2 gráficos da Visão Analítica reagem. `database.ts`: `p_operacao` → `p_operacoes`. |
| **M7 — Fechamento** | (release) | versão 4.19.0, CHANGELOG, CHANGELOG_DIRETORIA, ADR-0118, CLAUDE.md (fontanaria multicamada), out-briefing, auto-auditoria, gates, PR. |

## Migrations
- **0140** `solicitacao_campo_regra_data` — **aditiva** (ADD COLUMN + 4 CREATE OR REPLACE; DEFAULT true ⇒ retrocompatível, sem bloqueio novo em linha existente).
- **0141** `acumulado_weddings_multiselecao` — **levemente destrutiva** (DROP+CREATE de `get_acumulado_weddings` núcleo+wrapper, `text → text[]`). **Confirmação humana obtida** antes do `db push` (ADR-0116); backup-gate como rede. Reversível (reproduzível de 0106+0121); consumidor único (`weddings-content`); sobrecarga 2-arg intocada.

**Aplicação em produção (2026-06-14):** backup-gate **VERDE** (backup-do-dia `2026-06-14-pre-migration`, 38/38 tabelas, restore-test spot 4/4 com count+checksum idênticos prod×restaurado) → confirmação humana → `db push` das duas (exit 0). **Verificado pós-push:** (a) `npm test` com `REQUIRE_CONTRACT=1` verde — `solic_tipos_abertura`/`admin_solic_listar_tipos` emitem e parseiam as 2 colunas novas contra a RPC viva; (b) `get_acumulado_weddings(text[])` via REST: NULL = todas (R$ 49,9 Mi), array filtra; (c) **agregado de 2 operações == soma manual** (A R$ 7.843,95 + B R$ 12.448,84 = R$ 20.292,79, idêntico ao `[A,B]`).

## ADR
- **0118** — Regra de data por campo (colunas dedicadas, bloqueio server-side em fuso SP, snapshot intocado, fontanaria de 5 camadas) + multi-seleção de operações (fronteira nos 2 gráficos, soma agregada, migration destrutiva com confirmação).

## CLAUDE.md
- Nova convenção: **config/regra nova por campo/entidade atravessa VÁRIAS camadas de mapeamento — verificar ponta-a-ponta** (cada camada que faz pick/strip descarta chaves desconhecidas em silêncio; esquecer uma = feature some sem erro de build; o teste de contrato é o que pega).

## Auto-auditoria adversarial (§6) — 8 dimensões, todas ✓ (workflow de skeptics)
1. **Fontanaria 5 camadas:** as 2 chaves sobrevivem ponta-a-ponta (snake_case idêntico JS↔SQL); nenhuma camada derruba; `data_aviso_dias_futuro` ausente do loop de `criar_solicitacao` é por design (servidor não enforça aviso). ✓
2. **Fuso SP:** bloqueio usa `(now() AT TIME ZONE 'America/Sao_Paulo')::date`; client `hojeSP()` (Intl en-CA SP) concorda; cenário meia-noite UTC sem off-by-one; `diasEntre` exato. ✓
3. **Bloqueio server-autoritativo + aviso não-bloqueante:** `min` é cosmético; RAISE no servidor é a barreira (RPC re-lê a coluna); aviso só renderiza `<p>`, não bloqueia `enviar()`, dispara só > N dias futuro. ✓
4. **Fronteira multi-seleção:** só `get_acumulado_weddings` recebe a lista; só os 2 gráficos consomem; KPIs/Mix/Carteira/Próximos não recebem. ✓
5. **"Todas" exclusivo + soma:** vazio = Todas (null = sem filtro); single-op retrocompatível; `= ANY` só alarga o WHERE (SUM exato, sem fan-out). ✓
6. **Migration destrutiva:** ordem de DROP (wrapper→núcleo); GRANTs sem anon (cross-check 0133); 2-arg intocada; shape JSON byte-idêntico. ✓
7. **Tokens/DS + visual-only:** drawer/tipos neutros (zero `var(--brand)`/hex/shorthand); dropdown corretamente usa `var(--brand)` (setor Weddings); handlers M1/M2 preservados. ✓
8. **parseRpc drift:** chaves `.optional()` → sem HTTP 500 pré/pós-0140; teste prova sobrevivência (não só success). ✓

## Fronteira de produto (respeitada)
- Multi-seleção **NÃO** reescopa a página inteira de Weddings (opção 2 descartada) — só os 2 gráficos. Métricas derivadas (margem %, ratios) ficam fora.
- Snapshot da solicitação **intocado** (regra de data é portão de open-time, sem trilha de auditoria).
- **Fluxo de Caixa dormente; exportação de relatório e `solicitacao_evento` não entraram.** Nenhum item de produto novo decidido sozinho.

## Gates
`tsc` 0 · `lint` 13 (baseline, zero novos) · `build` limpo · `npm test` **121** (119 + 2 do `campoDefSchema`).

## Arquivos (principais)
- **Banco:** `supabase/migrations/0140_solicitacao_campo_regra_data.sql`, `0141_acumulado_weddings_multiselecao.sql`.
- **M1:** `src/components/solicitacoes/drawer-solicitacao.tsx`.
- **M2:** `src/components/admin/solicitacoes/tipos-content.tsx`.
- **M4:** `src/lib/solicitacoes/schemas.ts`, `src/components/admin/solicitacoes/editor-tipo.tsx`, `src/app/admin/solicitacoes/actions.ts`, `src/components/solicitacoes/campos-dinamicos.tsx`, `src/lib/rpc-contrato.test.ts`.
- **M6:** `src/types/database.ts`, `src/app/performance/weddings/page.tsx`, `src/components/performance/weddings-content.tsx`, `src/components/weddings/dropdown-operacao.tsx`.
- **Fechamento:** `package.json`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `docs/adr/0118-*`, `CLAUDE.md`, este out-briefing.

---
**PR:** `feat/v4-19-0-data-drawer-tipos-multiselecao` → `main`. Merge e deploy ficam com o usuário.
