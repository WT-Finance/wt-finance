# WT Finance — Out-Briefing v4.23.1

**Data:** 2026-06-18 · **Branch:** `feat/v4-23-1-gerencial-ajustes` (base `main` @ v4.23.0) · **Versão:** 4.23.0 → **4.23.1** (PATCH)
**Tema:** Ajustes do Fluxo de Caixa Gerencial — correção crítica do saldo + refino da base, da projeção e do drawer de importação. Migration 0155 (aditiva). **Merge e deploy ficam com o usuário.**

---

## Itens implementados (11)

### Item 11 — CORREÇÃO CRÍTICA do saldo (`contas-manager.tsx`)
O `NumCell` (saldo dos cards + limite no painel) exibia `fmtBRL` (0 casas → "105.993" sem centavos); ao clicar, semeava o input com `String(105993.35)`="105993.35" e o **`parseNum` LOCAL** fazia `replace(/\./g,'')` tratando o ponto como milhar → salvava **10599335**. **Causa-raiz:** reimplementação local de coerção numérica — exatamente o que o CLAUDE.md proíbe ("NUNCA reescrever um `toNum` local"). **Fix:** exibe `fmtBRL2` (centavos); parse pelo **`toNum` canônico** (`@/lib/carga/coercao`); semeia o input em vírgula-decimal 2 casas (`v.toFixed(2).replace('.', ',')`) — round-trip à prova de ruído de float. **Hardening (auto-auditoria):** entrada não-vazia inválida (ex.: "abc") **reverte** em vez de zerar o saldo.

### Itens 1–3 — Base de Dados (`base-dados-tab.tsx`)
- **(1)** Removidas as pills de tipo (Todos/A receber/A pagar) — redundantes com o filtro Tipo da coluna.
- **(2)** Removida a busca por pessoa do topo (+ estado `busca`/`buscaInput` + debounce) — redundante com o filtro Pessoa da coluna.
- **(3)** O botão de exclusão é **largura fixa** (`w-[164px]`), à direita de Importar, alternando o rótulo: **"Apagar todos"** (0 selecionados → apaga a BASE inteira, ignorando filtros — **decisão do Yan**) ou **"Apagar selecionados"**. `mudarOrigem` faz a seleção **acompanhar o filtro de origem** (intersecta a seleção com a origem visível). Confirmação obrigatória; a do "todos" avisa que ignora filtros e é irreversível.

### Itens 9–10 — Projeção Diária (`visualizacao-agregada-tab.tsx`)
- **(9)** Linha-âncora fixa **"Saldo inicial"** no topo: A Receber/A Pagar/Resultado em traço (—); colunas de saldo mostram a **abertura** da janela (`linhaVisivel[0].saldo − resultado` = saldo da véspera; no default = saldo configurado das contas).
- **(10)** "Resultado" → **"Resultado do Dia"**; as **3** colunas de saldo ganham **"(Final)"** (Saldo Itaú (Final), Consolidado (Final), Consol.+reserva (Final)) — decisão do Yan: nas 3, para consistência com o "Saldo inicial".

### Itens 4–7 — Drawer de importação (`import-drawer.tsx`)
- **(4)** Tabelas dos buckets `table-fixed` + Valor compacto (R$ junto do número, à direita) → **sem rolagem horizontal**; a última coluna não é mais cortada.
- **(5)** "Manter duplicadas" só aparece quando há duplicatas na planilha, **informando a contagem** (`diff.duplicatasPlanilha`, computado no diff independente do toggle — `import-types.ts`).
- **(6)** Título "Importar lançamentos" / subtítulo "Importa a planilha de lançamentos curada manualmente".
- **(7)** Instruções desde o início (etapa de upload), reescritas: substituição da importação anterior + sincroniza só as suas linhas + **manuais não são excluídos** (ênfase na última frase).

### Item 8 — Destaque do manual (migration 0155)
`create_gerencial_lancamento` carimba `destacado = (p_origem = 'manual')` → lançamento manual nasce com a lata-de-tinta ligada. Importação (planilha) segue sem destaque.

## Banco — migration 0155
- **ADITIVA / retrocompatível:** `CREATE OR REPLACE` SEM mudança de assinatura (preserva GRANTs); o corpo só ACRESCENTA `destacado` ao INSERT. Sem DROP, sem UPDATE/DELETE, não toca dado pré-existente. O heurístico do db-gate **não** marca destrutiva.
- **APLICADA** via `npm run db:migrate -- --aditiva` (regime autônomo): backup-gate **VERDE** (38/38, restore-test 4/4 idênticos), push automático, registrada remote. **Verificada via REST:** `create_gerencial_lancamento` com `p_origem='manual'` retorna `destacado=true` (linha de teste criada e deletada).

## Auto-auditoria adversarial (1 revisor) — resultado
- **Round-trip de dinheiro (item 11): PROVADO LIMPO** — a corrupção 105993,35→10599335 não pode recorrer; todos os formatos (BR com/sem milhar, US, negativo, vazio) voltam ao valor certo.
- **Math do "Saldo inicial" (item 9): LIMPO** — `p0.isolada − p0.resultado = base + acumulado antes da janela`; default = saldo da conta; janela futura correta; float desprezível.
- **Exclusão (item 3): 2 "footguns" deliberados, gated pelo ConfirmModal** (não são perda silenciosa): (A) trocar origem pode esvaziar a seleção → botão vira "Apagar todos" (base inteira) — composição literal das 2 decisões do Yan, com aviso forte no modal; (B) filtros de coluna escondem linhas selecionadas que "Apagar selecionados" ainda apaga — a contagem é exibida no modal e no rodapé. Mantidos por serem decisão de produto; documentados aqui.
- Achado de hardening endereçado: input inválido no saldo agora reverte (não zera).

## Gates
`tsc --noEmit` **0** · `lint` **12** (= baseline; zero novos nos arquivos tocados) · `next build` **limpo** · `npm test` **148** (+1 teste de `duplicatasPlanilha`).

## CLAUDE.md
Avaliado — **sem alteração**. O bug do item 11 é uma instância concreta de uma regra **já documentada** ("Coerção vem de UM módulo só: `coercao.ts`; NUNCA reescrever um `toNum` local"). Reforça a regra existente; nada novo a acrescentar (mantém o arquivo denso).

## Arquivos
**Novos:** `supabase/migrations/0155_gerencial_lancamento_manual_destacado.sql`, este out-briefing.
**Modificados:** `src/components/financeiro/gerencial/contas-manager.tsx` (NumCell: fmtBRL2 + toNum + editStr + guard), `.../visualizacao-agregada-tab.tsx` (Saldo inicial + headers), `.../base-dados-tab.tsx` (pills/busca removidas, botão Apagar todos/selecionados, mudarOrigem), `.../import-drawer.tsx` (Valor compacto/table-fixed, toggle condicional, título/instruções), `src/lib/gerencial/import-types.ts` (+`duplicatasPlanilha`), `src/lib/gerencial/import-types.test.ts` (+teste), `package.json`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`.
**Sem ADR** (ajustes/correção; nenhuma decisão arquitetural nova).

## Pendências / fora de escopo (achados → registro)
- "Footguns" A/B da exclusão: deliberados (decisão de produto) + gated pelo modal. Se o Yan quiser, dá para (A) não flipar para "todos" quando a troca de origem esvazia a seleção e (B) limpar a seleção também nos filtros de coluna — vira ajuste próprio.
- Input inválido em `NumCell` agora reverte; sem mensagem de erro explícita (silencioso, mas não destrutivo).
