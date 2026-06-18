# WT Finance — Out-Briefing v4.22.0

**Data:** 2026-06-17 · **Branch:** `feat/v4-22-0-gerencial-ux` (base `main`) · **Versão:** 4.21.0 → **4.22.0** (MINOR)
**Tema:** **Fluxo de Caixa Gerencial — refinamentos de UX, formato contábil e normalização de contas.** Migration 0149. ADR-0124. **Merge e deploy ficam com o usuário.**

> **Decisão de modelo IMUTÁVEL (a mais importante):** a Visualização Agregada **não** mudou.
> `conta_previsao` continua **irrelevante** para a projeção (3 bases de saldo sobre o mesmo
> resultado diário, sem GROUP BY por conta). A normalização (M6) serve **só** ao filtro/limpeza
> da base. Verificado por **checksum dos inputs da projeção antes/depois** (ver §Banco).

---

## Missões

### M1 — Saldos em cards + painel de gestão
- **`contas-cards.tsx` (novo):** grade data-driven (1 card por conta), **edição inline só do saldo** (caminho otimista `updateConta(conta,{saldo})` + `onContasChange` + `router.refresh`), selo informativo de papel/consolidado (read-only). Reaproveita `NumCell`/`parseNum` (exportados de `contas-manager.tsx`).
- **`visualizacao-agregada-tab.tsx`:** trocou o `ContasManager` inline por cabeçalho "Contas" + **botão engrenagem** ("Gerenciar contas") + `<ContasCards>` sempre visível; o botão abre `<ListDrawer>` com o `<ContasManager>`. `useMemo` das projeções e padrão `prevSaldos` **intocados**.
- **`contas-manager.tsx`:** virou o **painel** de gestão — **removida a coluna "Saldo inicial"** (header + linha + linha de adicionar); restam Conta · Limite · Consolidado · Papel · remover + "Adicionar conta" (nova conta nasce com saldo 0, editável no card).

### M2 — Nomenclatura + badges por token
- `PAPEL_LABEL` em `tipos.ts`: `isolada` → **"Principal"**, `reserva` → **"Rendimento"** (chave do banco **inalterada**). Badges com **tokens** do DS: Principal = trio `--action-soft`; Rendimento = neutro zinc. Cabeçalhos da agregada mantêm o **nome da conta** ("Saldo {Principal}" / "Consol.+{Rendimento}").

### M3 — Formato contábil
- **`valor-contabil.tsx` (novo):** `<ValorContabil>` — `flex justify-between` + `tabular-nums`; **"R$" à esquerda** (`--text-subtle`) e **número à direita** com centavos (`numBRL2`); `className` opcional pinta só o número. Aplicado na **projeção agregada** e na **base**. Documentado no Design System (§7) e no CLAUDE.md.

### M4 — Cores na célula
- `corIsolada`/`corDuasFaixas` passam a devolver classe de **fundo** (`bg-danger-bg`/`bg-warning-bg`/`bg-success-bg`, `@theme`-mapeadas), aplicada no **`<td>`** do saldo (corrige a v4.21, que só pintava o texto). Principal com limite>0 = 3 faixas (`< −limite` / `[−limite,0)` / `≥0`); Principal sem limite, Consolidado e Consol.+Rendimento = 2 faixas. Fluxos (A Receber/A Pagar/Resultado) = cor **só no número**, sem fundo. Na linha "hoje", o fundo da faixa do `<td>` prevalece sobre `bg-amber-50`.

### M5 — Base: layout, responsividade e filtros
- **`lancamento-row.tsx`:** Tipo vira pill compacto (sem quebra); Pessoa/Descrição com `truncate` + `title` (nome completo no hover); **Valor à direita** via `<ValorContabil>`; **origem** deixou de ser coluna e virou **ícone** (`FileSpreadsheet`/`PencilLine` + `title`) prefixando a célula Pessoa; 8 células por linha (alinhadas thead/linha/nova).
- **`base-dados-tab.tsx`:** `table-fixed` + `min-w-[760px]` (rolagem horizontal); **filtros por coluna** client-side (Pessoa, Valor ≥, Descrição, Conta, Vencimento por período) **aditivos** à busca geral e às pills de Tipo/Origem. Seleção/exclusão em massa (v4.21) **intacta** (`idsVisiveis` deriva dos filtros).

### M6 — Normalização de `conta_previsao`
- **`@/lib/gerencial/normalizar-conta` (novo, isomórfico):** `canonizarConta(raw, contasReais)` — `normalizarChaveConta` (`NFD`/sem-acento/`lower`/`trim`/colapso) + `ALIAS_NORM` (`banco itau`→`itau`); casa com a conta real ou devolve **"Outras"**. Testes de tabela (`normalizar-conta.test.ts`, 6 casos reais).
- **`api/gerencial/import/route.ts`:** carrega `get_gerencial_saldos` → `contasReais` e canoniza a planilha **antes** de montar `mapPlanilha`. Como `chaveDuplicata` **não** usa `conta_previsao`, a divergência cru→canônico cai em `aAtualizar` (re-import converge linhas antigas; **não** duplica).
- **UI Conta = seleção:** `lancamento-row.tsx` (EditableCell `type="select"`, opções = contas + "Outras", **fallback** inclui o valor legado se fora da lista) e a linha "Nova linha" (`<select>`). O filtro de Conta usa `canonizarConta` para agrupar legados. `gerencial-section.tsx` repassa `saldos` ao `BaseDadosTab`.
- **Migration 0149 (backfill):** ver §Banco.

### M7 — Fechamento
- 4.22.0 (`package.json`; `version.ts` deriva); CHANGELOG.md; CHANGELOG_DIRETORIA (negócio); ADR-0124; Design System §7 (formato contábil, com mini-demo ao vivo); CLAUDE.md (convenção `<ValorContabil>`); este out-briefing.

## Banco — migration 0149 (normalização de `conta_previsao`)

**Re-verificação do snapshot (auto-auditoria):** o briefing trazia 47 linhas (investigação 2026-06-16);
a produção em 2026-06-17 tinha **108 linhas**. Distribuição real re-checada **antes de aplicar**:
`Banco Itau`×42, `ASAAS`×33, `NULL`×18, `Blimboo`×13, `Caixa Economica`×1, `USD 4.680`×1.
Contas reais (`gerencial_saldos`): **Itaú, Asaas, Blimboo, Clara** (chaves `itau/asaas/blimboo/clara`
— batem com a lista canônica do catch-all). Os órfãos novos (`Caixa Economica`, `USD 4.680`) **não**
são contas reais → caem em "Outras" pelo catch-all. Header da migration e teste atualizados ao real.

- **Natureza:** 4 `UPDATE` de `conta_previsao` (aliases → canônico; catch-all NULL/vazio/órfão → "Outras"). Sem DDL, sem FK, `conta_previsao` continua `TEXT`. **ADITIVA/reversível**, mas por ser `UPDATE` em dado existente o **heurístico do db-gate marca como destrutiva** → exige **confirmação humana consciente** (jamais via EOF).
- **Resultado esperado:** Itaú×42, Asaas×33, Blimboo×13, **Outras×20** (18 NULL + Caixa + USD) = 108.
- **Invariante da agregada (checksum antes/depois):**
  - Inputs row-level (`tipo|valor_final|vencimento`): `1909bb1347900e97967f600f80687959` (108 linhas) — **antes**.
  - Agregado diário (`vencimento/tipo/sum`): `20a939508d0346f990c7b2ceae1a7f19` — **antes**.
  - Estes **não mudaram** com o backfill (a 0149 só toca `conta_previsao`). **Confirmado pós-push: byte-idênticos** (row-level `1909bb13…`, agregado `20a93950…`).
- **Status:** **APLICADA em produção em 2026-06-17** sob **confirmação consciente** do Yan (wrapper `npm run db:migrate -- --destrutiva`; **backup-gate VERDE** — 38/38 tabelas exportadas, restore-test spot 4/4 com checksum idêntico, 4,1s). **Verificação pós-push:** distribuição final `Itaú×42 · Asaas×33 · Blimboo×13 · Outras×20` (= 108) **conforme esperado**; checksums dos inputs da projeção **idênticos** antes/depois → **agregada comprovadamente intocada**.

## Gates
`tsc --noEmit` **0** · `lint` **13** (= baseline `main`; **zero novos** — o único toque em arquivo nosso é o aviso `exhaustive-deps` pré-existente do `useMemo` da agregada, que apenas mudou de linha 56→65) · `next build` **limpo** · `npm test` **131** (125 baseline + 6 novos `normalizar-conta`).

## Auto-auditoria adversarial (§8) — proporcional
- **Revisão em 4 dimensões (agregada, base, M6, cross-cutting) + verificação adversarial** dos achados → **0 achados confirmados** (medium+). Pegou-se **na própria auditoria** a divergência do snapshot (47 → 108 linhas, órfãos novos) e corrigiu-se header + teste ao real **antes** de aplicar.
- **Agregada intocada (código):** `git diff main` do `visualizacao-agregada-tab.tsx` mostra na região de cálculo apenas um comentário e a troca de apresentação (`fmtBRL` → `<ValorContabil>`); o `useMemo`/`reduce`/`prevSaldos` são **byte-idênticos**.
- **M6 (sensível) — paridade TS×SQL conferida** contra os 6 valores distintos reais; catch-all robusto à deriva de dado.

## Arquivos
**Novos:** `src/components/shared/valor-contabil.tsx`, `src/components/financeiro/gerencial/contas-cards.tsx`, `src/lib/gerencial/normalizar-conta.ts` (+ `.test.ts`), `supabase/migrations/0149_gerencial_normaliza_conta_previsao.sql`, `docs/adr/0124-…md`, este out-briefing.
**Modificados:** `visualizacao-agregada-tab.tsx`, `contas-manager.tsx`, `tipos.ts`, `base-dados-tab.tsx`, `lancamento-row.tsx`, `gerencial-section.tsx`, `api/gerencial/import/route.ts`, `app/admin/design-system/page.tsx`, `package.json`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `CLAUDE.md`.

## Patch pós-revisão (pré-merge, mesmo PR #128)
Ajustes pedidos pelo Yan na revisão do PR (a v4.22.0 ainda não mergeou → entram como commits do mesmo PR, sem nova versão):
1. **Drawer "Gerenciar contas":** subtítulo explicativo + tabela `table-fixed`/colgroup (coluna Conta flexível e truncada; removido o card-wrapper e o cabeçalho "Contas" redundantes) → sem rolagem horizontal.
2. **Nova linha — botão "Salvar"** não sobrepõe mais o seletor de data: coluna de ações alargada (`w-[32px]`→`w-[96px]`; o Salvar+✕ transbordavam os 32px).
3. **Base — cor por tipo:** valor de *A pagar* em vermelho (`--negative-deep`), *A receber* em verde (`--positive-deep`), via `accountingClassName` no `<ValorContabil>`.
4. **Base — filtro de Tipo** funcional: a célula da linha de filtros virou `<select>` (Todos/A receber/A pagar) ligado ao `tipoFiltro` (a lógica já estava correta; faltava o controle — o texto "por tipo ↑" era inerte). Pills do topo mantidas.
5. **Base — origem à direita + destaque:** ícone de origem movido para junto das ações (origem · destaque · lixeira). **Destaque PERSISTENTE** (decisão Yan): ícone de lata de tinta pinta a linha de amarelo, salvo no banco.
6. **Base — filtro de Vencimento** vira botão **"Personalizado"** + popover Início/Fim (portal, visual igual ao período de Weddings) no lugar dos dois date-inputs empilhados que quebravam em 2 linhas.

### Banco — migration 0150 (destaque persistente)
- `ALTER TABLE ... ADD COLUMN destacado BOOLEAN NOT NULL DEFAULT false` + CREATE OR REPLACE de `get_gerencial_lancamentos` (SELECT ganha `destacado`), `create_gerencial_lancamento` (RETURN ganha `destacado`) e `update_gerencial_lancamento` (whitelist ganha `destacado`). **ADITIVA/retrocompatível.**
- Wiring ponta-a-ponta (lição "fontanaria de N camadas"): migration → `update_gerencial_lancamento` whitelist → `CAMPOS_PERMITIDOS` na action → tipo `Lancamento` → leitura (`unwrapRpc`, sem Zod) → UI (toggle + fundo).
- **NÃO** toca `get_gerencial_projecao_diaria` — a agregada ignora `destacado`. Heurística do db-gate marca destrutiva (falso-positivo: o corpo da função `update` contém o literal `UPDATE`) → aplicada sob **confirmação humana consciente**.
- **APLICADA em prod (2026-06-17) + verificada:** backup-gate **VERDE** (38/38, restore-test 4/4); coluna `destacado` `boolean NOT NULL default false` presente; `get_gerencial_lancamentos` e `update_gerencial_lancamento` com `destacado`. **Dado existente intocado** — o checksum das 108 linhas pré-existentes segue `1909bb13…` (idêntico). O total subiu para 109 apenas por **um lançamento de teste manual** criado no preview durante a revisão (id 300, "Rextur") — não pela migration. Revisão adversarial do patch (2 dimensões + verificação): **0 achados**.

## Pendências / follow-ups
- ~~Aplicar a migration 0149~~ — **FEITO**: aplicada em prod (2026-06-17) + verificada (distribuição esperada, checksums da projeção idênticos). Ver §Banco.
- **FORA (registrado, não implementado):** agregada por conta (GROUP BY `conta_previsao`); cards no mobile (hoje rolagem); filtro de Valor por faixa (só `≥`); projeções flexíveis; `vw_fluxo_caixa_kpis_b` (view lenta — outro subsistema); destaque do 1º dia negativo; totais de rodapé.
