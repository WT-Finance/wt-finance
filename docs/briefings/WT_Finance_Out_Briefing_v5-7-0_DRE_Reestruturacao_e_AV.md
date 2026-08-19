# Out-Briefing v5.7.0 — DRE: reestruturação (camada firme), rótulos padronizados e Análise Vertical

**Branch:** `feat/v5-7-0-dre-reestruturacao-av` · **PR:** #239 · **Data:** 2026-08-19
**Migrations:** `0251` (DESTRUTIVA, aplicada em TTY pelo Yan) e `0252` (aditiva, aplicada)
**ADR:** 0168 · **Testes:** 986 (baseline v5.6.4: 932) · **Rota A**

---

## 1. O que entrou

### Frente 1 — Reestruturação (camada firme)
- As 3 categorias de `RFIN` passaram para `FIN`, que virou **"(+/-) Resultado Financeiro"**;
  o bloco `RFIN` foi removido. Chave `FIN` preservada (âncora de fórmula).
- `IMOB` saiu de `DESP_H`/`LOP` e passou a compor `INV_H`/`RAIR` como **subgrupo próprio**
  (categorias não dissolvidas em `INV`). `INV_H` renomeado para
  **"(+/-) INVESTIMENTOS, IMOBILIZADO E EMPRÉSTIMOS"**.
- Reposicionamento: `FIN` → ordem 190 (última dentro de DESPESAS), `IMOB` → 265 (sob o
  cabeçalho que passa a agregá-lo).

### Frente 2 — Rótulos
- Regra: cabeçalho/subgrupo/totalizador carregam operador; **categoria-folha nunca**.
- Aplicado: 5 totalizadores com `=` solto → `(=)`; `ONOP_H` de `(+ / -)` → `(+/-)`;
  14 subgrupos ganharam operador; **12** overrides de categoria perderam o prefixo.
- **Guarda mecânica** em `rpc-contrato.test.ts`, nas duas direções, lendo o estado VIVO.
  **Vista reprovando** contra o estado antigo (5 vermelhos, com os 12 overrides enumerados na
  saída) antes de valer.

### Frente 3 — Análise Vertical
- Módulo puro `src/lib/dre/av.ts` + 36 testes. AV = valor ÷ **ROL do mesmo período**, sinal
  algébrico preservado, percentual com 1 casa e negativo entre parênteses.
- Mensal: uma coluna ao lado do "Total do ano" **e uma por ano seguinte** (2027/2028).
  Consolidado: **uma por ano marcado**, na coluna de nível daquele ano.
- Guardas: base ≤ 0/ausente ⇒ coluna inteira em travessão; bandeja sempre travessão;
  `NaN`/`∞` impossíveis por construção (varredura de bordas em teste).
- **Aditividade exata travada em teste** antes do arredondamento, na cadeia até o REX; a
  divergência de até 0,1 p.p. na exibição está **cravada num teste**, não escondida.

### Extras da conferência (5 rodadas de ajuste do Yan)
- Botão **"Ver em tela cheia"** (Fullscreen API sobre o card inteiro).
- **Ordem dos cards:** Resumo Executivo → Demonstrativo → Maiores variações → Decomposição.
- **"Maiores variações"** migrado do Fluxo de Caixa para a DRE (+ `0252` para o RBAC).
- **Pills de ano no Resumo Executivo**, seleção aditiva, independentes da pill da tabela.
- AV com `%`, acompanhando o âmbar do total, em negrito e colorida por sinal nas linhas de
  resultado; folga da última coluna contra o thumb; largura ajustada.

---

## 2. O oracle — o invariante que autorizou a migration

Provado em **forma fechada** (`RAIR' = (LL − IMOB) + INV + IMOB = RAIR`) e **medido em
produção** comparando um retrato tirado imediatamente antes da aplicação com outro depois
(`scripts/dre-oracle.mjs --comparar`, saída `✅ ORACLE OK`).

### Quadro de-para por ano (para a comunicação à liderança)

| ano | IMOB | LOP antes → depois | AV do LOP | LL antes → depois | RAIR | REX |
|---|---|---|---|---|---|---|
| 2024 | (20.912,64) | 1.345.435,68 → **1.366.348,32** | 15,9% → 16,2% | 1.355.528,57 → 1.376.441,21 | 1.166.913,02 → **=** | 293.853,61 → **=** |
| 2025 | (99.342,56) | 692.722,91 → **792.065,47** | 6,9% → 7,9% | 1.205.386,08 → 1.304.728,64 | 993.514,58 → **=** | 248.434,54 → **=** |
| 2026\* | (236.572,23) | (1.538.932,99) → **(1.302.360,76)** | −21,0% → −17,8% | (1.454.120,71) → (1.217.548,48) | (1.703.591,25) → **=** | (2.496.722,68) → **=** |

\* ano corrente: o total inclui previsto e anda todo dia. **Comunicar o critério sobre 2024 e
2025**, que são estáveis. `ΔFIN` (a fusão): +47.258,53 / +58.470,81 / +117.864,86.

---

## 3. Parecer da revisão

### `revisor` — APROVADO COM RESSALVAS · 0 CRÍTICO · **1 ALTO (corrigido)**

**ALTO — gatilho do "?" era `<span>`, não `<button>`** (`tabela-dre.tsx` e
`resumo-executivo.tsx`, as duas afordâncias NOVAS da versão). `span` não entra no tab-order e
não é nomeável por leitor de tela; o `Tooltip` abre no hover **e no foco** desde a v5.4.2, e
sem gatilho focável essa metade não serve para nada. É a **reintrodução do achado ALTO da
v5.4.2**, catalogado na skill `ui-design-system` §2 — e a receita estava lá, escrita, com o
aviso.
**Corrigido** nos dois call-sites com a receita completa (`<button type="button">` +
`foco-neutro` + `aria-label` no formato `${rótulo}: ${texto}`). Gates re-rodados depois.

Verificado sem achado (destaques): a aritmética das colunas `sticky` recalculada intervalo a
intervalo para 0/1/2 anos visíveis nas duas visões (contíguos, sem sobreposição e sem gap);
`W_AV=86` contra o pior caso; numerador e denominador da AV sempre do mesmo recorte; ordem de
hooks e ruleset do React Compiler no Resumo reescrito; `totalColunas` × `colSpan` da bandeja;
ausência de `.catch()` direto em RPC; `hojeSP()` em vez de `new Date()`.

### `revisor-db` — 0251 APROVADA COM RESSALVAS · 0252 APROVADA · **1 ALTO · 1 MÉDIO · 1 BAIXO**

**ALTO — o "desfazer em lote" NÃO reverte a `0251`, e o header dela afirma que sim.**
`reverter_diario` (`0206`) pressupõe **no máximo um toque por linha por lote** — premissa
verdadeira no fluxo normal do editor e violada aqui: `LOP`, `INV_H`, `RAIR`, `FIN` e `IMOB`
são tocados **duas vezes** na mesma transação (fórmula/ordem e depois rótulo), sob o mesmo
`lote_id`. Como a reversão processa `ORDER BY id` ASC, a entrada mais antiga de cada uma dessas
chaves guarda um estado **intermediário** que não bate com o estado atual da linha, e a
checagem de conflito **aborta a transação inteira sem reverter nada**.
**Endereçamento:** a migration **não foi editada** — aplicada é registro, não se edita
(lição da v5.4.4). A correção do fato foi para onde é lida: **ADR-0168**, **WORKING-CONTEXT**
e este out-briefing. O dado segue recuperável entrada por entrada
(`dre_estrutura_desfazer_linha`, DESC de `id`) ou por migration corretiva.
**Débito técnico registrado:** corrigir `reverter_diario` para processar em DESC e comparar
contra o estado seguinte da própria cadeia — vale para QUALQUER migration de estrutura, não só
esta, e por isso é versão própria, não remendo aqui.

**MÉDIO — a reconciliação SQL não verifica o CONTEÚDO das fórmulas.** Ela confere contagens,
ausência do `RFIN`, padronização de rótulo e posições de `ordem`, mas não reafirma que
`DESP_H`/`LOP` perderam `RFIN`/`IMOB` nem que `INV_H`/`RAIR` ganharam `IMOB`. Um erro de
digitação numa das 4 chaves JSONB passaria calado pela reconciliação.
**Registrado, não corrigido**, com justificativa: (a) o conteúdo foi conferido linha a linha
pelo `revisor-db` e está correto; (b) o gap **é coberto** pela guarda permanente
`contrato DRE — camada firme da v5.7.0`, que compara as 4 fórmulas contra os arrays exatos via
REST; (c) essa guarda **rodou de verdade** neste fechamento — 109 casos de contrato, **0
skipped**. Escrever migration corretiva para reforçar uma reconciliação de migration já
aplicada e já verificada por duas camadas seria risco sem retorno.

**BAIXO — `antes.json` (retrato do oracle) solto na raiz, com dado financeiro real.**
**Endereçado:** entrou no `.gitignore` (junto com `depois.json` e `dre-oracle-*.json`) para não
poder ser commitado por acidente. O arquivo em si é do Yan e não foi removido — o que precisava
sobreviver dele já está no quadro de-para acima.

---

## 4. Pendências e registros

| Item | Estado |
|---|---|
| **Conferência visual** | ⏳ **do Yan.** Não foi possível na sessão: `/financeiro/dre` responde 307 → `/login` e a sessão não tem autenticação; o projeto não tem jsdom/testing-library, então não há render test para substituir. Pontos de atenção: folga da AV contra o thumb, largura da AV com `%`, tela cheia, Resumo com 3 anos marcados (7 colunas). |
| **Comunicar a mudança de critério à liderança** | ⏳ **do Yan.** Quadro de-para pronto (§2). A estrutura já mudou EM PRODUÇÃO desde 19/08 — material impresso antes disso mostra o critério antigo. |
| **Débito: `reverter_diario` robusto a múltiplos toques por linha** | 📝 registrado (ALTO do `revisor-db`) — versão própria. |
| **Reconciliação SQL sem checagem de conteúdo de fórmula** | 📝 registrado (MÉDIO), coberto pela guarda de contrato. |
| **CSV das duas visões** | 📝 adiado para **v5.7.1** por decisão do Yan (não existia export algum na DRE; toolkit a reusar: `src/lib/patrimonio/csv.ts` + `inventario/exportar.ts`). |
| **Par "Aplicações e Investimentos C/D"** | 📝 passou a conviver em `FIN` como consequência da fusão — não é a re-parentagem deliberada, que aguarda a gerente. |
| `<span>` como gatilho de "?" em `fluxo-caixa` (`KpiCelula`), `posicao-projetado`, `faturamento-corp` | 📝 pré-existente desde a v5.4.2, fora do escopo — mas agora com 2 call-sites a menos e a receita reforçada. |
| Toggle "AV" (válvula de densidade) | 📝 não construído — o gate da M4 não pediu (a Consolidado foi para a menor densidade). |

---

## 5. Arquivos

**Novos:** `docs/adr/0168-*.md` · `src/lib/dre/av.ts` · `src/lib/dre/av.test.ts` ·
`scripts/dre-oracle.mjs` · `supabase/migrations/0251_*.sql` · `supabase/migrations/0252_*.sql`
· este out-briefing.

**Modificados:** `src/components/financeiro/dre/tabela-dre.tsx` (o grosso) ·
`src/components/financeiro/dre/resumo-executivo.tsx` (reescrito, virou client component) ·
`src/lib/dre/rotulo-bloco.ts` + `.test.ts` · `src/lib/rpc-contrato.test.ts` ·
`src/app/financeiro/dre/page.tsx` · `src/app/financeiro/fluxo-caixa/page.tsx` ·
`CHANGELOG.md` · `src/data/changelog-diretoria.ts` · `package.json` · `docs/WORKING-CONTEXT.md`
· `.gitignore`.

---

## 6. Aprendizado (régua de 5 destinos)

| Achado | Destino | Ação |
|---|---|---|
| Oracle de mudança de estrutura se prova em **forma fechada** + medição **read-only** antes do SQL — dispensa ensaio em transação revertida contra produção | 4 — skill `banco-e-rpc` | adicionado |
| **Simular os regexes da migration contra o dado VIVO antes de entregar** (pegou "18 overrides" que eram 12) | 4 — skill `banco-e-rpc` + checklist do `revisor-db` (nota D-12) | adicionado |
| `reverter_diario` pressupõe **um toque por linha por lote** — migration que toca a mesma linha 2× quebra o undo em lote | 4 — skill `banco-e-rpc` | adicionado |
| Coluna fixa nova entra na **aritmética** do `right` cumulativo, não só no JSX | 4 — skill `tabela-densa` | adicionado |
| Gatilho de "?" tem de ser `<button>` | 2 — **já coberto** pela skill `ui-design-system` §2 | nada a adicionar; a skill estava certa e foi ignorada — o valor foi o `revisor` |
| "Passe único ASC" só vincula fórmula→fórmula | 1 — **enforcement**: guarda permanente `contrato DRE — grafo de fórmulas` | nada em prosa |
| Guarda de estado vivo nasce vermelha e isso é desejável | 2 — já praticado (precedente v5.6.3) | nada |
