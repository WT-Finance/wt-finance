# ADR-0123 — Fluxo de Caixa Gerencial: contas gerenciáveis, agregada configurável, cores + hardening

**Status:** Aceito (v4.21.0, 2026-06-16)
**Relacionado:** estende o modelo do gerencial (0094/0095/0096). Fecha o dormente **M2** da auditoria 2026-06-13 (service role). **M4** (view lenta) fica FORA (outro subsistema).
**Escopo:** Fluxo de Caixa Gerencial. Migrations 0146 (aditiva), 0147 (hardening de RPCs), 0148 (RPC nova).

## Contexto

O Gerencial tinha "contas" como híbrido frágil: uma tabela fina `analytics.gerencial_saldos` (conta PK + saldo + ordem + ativo, só SELECT/UPDATE), **nomes hardcoded** no componente da agregada (`Itaú/Asaas/Blimboo/Clara`), e `conta_previsao` texto-livre nos lançamentos. Sem add/remove de conta, sem limite, sem marca de consolidado, sem cores na tela. Além disso, página/RPCs rodavam via `getAdminClient` (service_role), sem `exigir_acesso` (auditoria M2).

## Decisões

### 1. Modelo da agregada — NÃO distribui por conta (o que mantém a versão enxuta)
As 3 colunas da Visualização Agregada são o **mesmo resultado diário** (a_receber − a_pagar de TODAS as linhas) sobre **3 bases de saldo inicial**. `conta_previsao` é **irrelevante** para a agregada — **sem** `GROUP BY conta_previsao`, **sem** normalização. (A investigação mostrou `conta_previsao` praticamente limpo — 47 linhas, 100% planilha; normalização vira polimento cosmético futuro.)
- **Saldo [isolada]** = saldo da conta com `papel='isolada'` + resultado acumulado.
- **Consolidado** = soma dos saldos das contas `consolidado=true` + resultado acumulado.
- **Consol.+[reserva]** = Consolidado + saldo da conta `papel='reserva'` + resultado acumulado.

### 2. Contas viram entidade (estende, não recria)
`gerencial_saldos` ganha `limite NUMERIC` (crédito; alimenta as faixas), `consolidado BOOLEAN`, `papel TEXT CHECK ('isolada'|'reserva')`. **Papéis exclusivos** por **índice único parcial** `(papel) WHERE papel IS NOT NULL` (≤1 isolada, ≤1 reserva; uma conta tem ≤1 papel). Grants `INSERT/DELETE` novos + RPCs `create/update/delete_gerencial_conta` (update trata exclusividade do papel liberando de quem detinha; rename suportado — `conta` é PK sem FK de `conta_previsao`). **Backfill** das 4 contas atuais preserva a tela.

### 3. Agregada data-driven + cabeçalhos dinâmicos
Zero nomes literais no código: a agregada lê contas/papéis/marca-consolidado da entidade. Cabeçalhos "Saldo [isolada]" / "Consol.+[reserva]" seguem os papéis; a coluna some se o papel não estiver atribuído (sem quebrar).

### 4. Cores por faixa (tokens semânticos)
Coluna **isolada** (tem `limite`): 3 faixas — `< −limite` `--danger`, `[−limite,0)` `--warning`, `≥0` `--success`. **Consolidado**/**Consol.+reserva**: 2 faixas (`--danger`/`--success`). A faixa amarela é função do `limite` da conta (não hardcodado).

### 5. Hardening M2 — fim do service role no gerencial
Todas as RPCs do gerencial (`get_gerencial_*`, CRUD de lançamento e de conta, `batch_gerencial_import`, `delete_gerencial_lancamentos_bulk`) passam a chamar `app.exigir_acesso(['financeiro/gerencial'])` + `GRANT authenticated` (mantendo `service_role`, que pula o guard pelo ramo trusted). Página standalone, seção embutida do Fluxo de Caixa, actions e a API Route de import migradas de `getAdminClient` → `getServerClient`. **Defesa em profundidade real:** a negação vale no nível da RPC — `authenticated` sem a área é barrado pela própria função, não só pela página.

### 6. Exclusão em massa (Base de Dados)
Checkbox por linha + "selecionar visíveis" + "Apagar selecionados (N)" com confirmação. **Aviso extra** quando a seleção inclui `origem='planilha'` (curadas — re-trazidas pelo próximo import). RPC `delete_gerencial_lancamentos_bulk`. Ícone de origem (planilha/manual).

## Consequências
- **Positivas:** contas gerenciáveis sem mexer no banco a cada mudança; agregada se adapta às contas/papéis; faixas de cor tornam o risco imediato; o gerencial deixa de depender de service_role (defesa em profundidade). Migration aditiva, reversível.
- **Atenção:** migration 0146 contém `UPDATE` de backfill (das colunas RECÉM-CRIADAS) → o heurístico do db-gate marca como destrutiva; aplicada com backup-gate VERDE + **confirmação humana consciente** (não EOF), pois é aditiva de fato.
- **Fora de escopo (registrado):** distribuição por conta / GROUP BY `conta_previsao` / normalização; projeções flexíveis (formato fixo); **M4** (view lenta `vw_fluxo_caixa_kpis_b`, outro subsistema); destaque da 1ª data negativa; totais no rodapé.
