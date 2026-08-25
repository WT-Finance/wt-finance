# Out-Briefing v5.7.2 — AV sobre a Receita Bruta, defaults da DRE, busca em Solicitações, ordenação no Gerencial

**Branch:** `fix/v5-7-2-ajustes` · **Data:** 2026-08-25 · **Rota C (patch)** — escopo veio do
prompt do Yan; este out-briefing é o rastro em disco.
**Sem migration · sem ADR.** Gates: build verde, tsc/lint limpos, **suíte 998/998 (100%)**.

---

## 1. As quatro frentes

### 1.1 AV sobre a RECEITA BRUTA DE VENDAS, e só abaixo dela
A base saiu de `ROL` para `RB_H` — uma constante, `CHAVE_BASE_AV`, exatamente como o módulo
previa ("se um dia a base mudar, muda num lugar"). Motivo de produto: a ROL já é líquida de
impostos e deduções, então (a) toda linha acima dela passava de 100% e (b) "% da receita" era
medido contra um denominador que já tinha subtrações dentro.

**As linhas acima da base ficam travadas em travessão.** Não é fail-safe, é semântica: Entrada
de Clientes, Pagamento ao Fornecedor, Saldo Repasse e Receita de Vendas (com suas categorias)
são as PARCELAS que formam a Receita Bruta. "Entrada de Clientes = 285% da Receita Bruta"
convidaria a ler composição onde não há — nada ali é parte de um todo, é o caminho até o todo.
A base mostra 100,0%; a AV existe dela para baixo.

A separação é **posicional** de propósito (`indiceBaseAv`): "acima da Receita Bruta" é uma
afirmação sobre a ORDEM do demonstrativo, e `linhas` já vem em `ordem` ASC. A regra do projeto
de casar por chave e nunca por posição vale para IDENTIFICAR uma linha entre payloads — aqui o
que se quer é a relação de ordem dentro de UM payload.

**Conferido no dado vivo:** o corte cai no índice **13** de 160 linhas — as 13 acima são
exatamente ENT_H(+2 cats), PAG_H(+1), REPASSE, RV(+6 cats), e a AV começa na Receita Bruta.

### 1.2 Novos defaults na página do Demonstrativo
- Tabela: **Consolidado + Realizado** (era Mensal + Realizado+Previsto — a combinação mais
  densa que existe, 13 colunas de mês com projeção misturada).
- Resumo Executivo: **dois anos mais recentes** (era todos os carregados → 7 colunas).
- Os dois cards passam a nascer falando do MESMO par de anos.
- O fail-safe já existente cobre o novo default: `visaoEfetiva` cai para 'mensal' sozinho se
  nenhum ano carregar, então 'consolidado' não é risco de tela vazia.

### 1.3 Solicitações — busca e ordenação
- Campo de busca na faixa de pills das **duas** visões (Caixa de entrada e Minhas
  solicitações): por **número** (`#1068`/`1068`, parcial) **ou e-mail do solicitante**.
- Ordenação por **`criado_em` DESC** em TODAS as listas, inclusive as que antes não eram
  ordenadas (Concluídas, Canceladas).
- Mensagem de vazio distingue "nenhum resultado para esta busca" de "não há solicitações".

⚖️ **O que se perde:** as abertas eram ordenadas por `data_limite` ASC — a mais urgente no
topo, que era triagem. A urgência deixa de ordenar e passa a viver só na cor (o card já pinta
o vencimento em `text-danger` quando vencida). Pedido explícito do Yan ("sempre ordenadas por
data de criação"). Reverter é trocar um comparador.

### 1.4 Gerencial — colunas ordenáveis
As 7 colunas de dados da base do Fluxo de Caixa Gerencial (Tipo, Pessoa, Valor, Descrição,
Conta, Vencimento, Originador). Gatilho `<button>` dentro da `<th>` com `aria-sort` e
`foco-neutro`; ícone de estado no idioma já vivo em `ranking-caixa.tsx`; nulos sempre no fim
em qualquer direção. **A tabela abre ordenada por Vencimento, do mais recente ao mais
antigo** (ajuste do Yan na conferência — a primeira entrega nascia sem ordenação, preservando
a ordem do servidor). O estado "sem ordenação" continua representável (`colAtiva: null`) e
significa "ordem que veio do servidor"; hoje nada o produz, e é de propósito.

Dois cuidados que valem registro: a coluna **Conta** ordena pela MESMA `canonizarConta` que o
filtro dela usa (senão ordenação e filtro discordariam), e a ordenação vive num `useMemo`
SEPARADO do `filtrados` — que continua sendo a fonte de `idsVisiveis`, para a seleção em massa
não mudar de conjunto ao reordenar.

---

## 2. Paralelização

A pedido do Yan, as frentes 1.3 e 1.4 foram para **dois `implementador` em paralelo** (arquivos
disjuntos), enquanto a sessão principal fez 1.1 e 1.2 no `tabela-dre.tsx` — o arquivo-ímã da
versão, que ficou com dono único conforme a Carta. Funcionou: nenhum conflito, e o `tsc`
fechou limpo na primeira tentativa depois da integração.

**O que a revisão da sessão principal mudou no que voltou:**
1. **Corrigi um defeito que era da MINHA especificação, não do agente.** Eu havia escrito
   "compare como texto (`String(s.id).includes(termoSóDígitos)`)", e o agente implementou
   exatamente isso — inclusive o efeito colateral, que ele relatou com honestidade: extrair os
   dígitos de QUALQUER termo faz `ana2024@x.com` casar também com a solicitação `#2024`. A
   regra certa é só tentar o número quando o termo INTEIRO é uma referência numérica
   (`^#?\d+$`). Corrigido e **coberto por teste de regressão**.
2. **Matei a duplicação:** o agente teve de duplicar `maisRecentePrimeiro`/`casaBusca` nos dois
   componentes porque a delegação só liberou dois arquivos. Promovi ambos para
   `src/lib/solicitacoes/format.ts` — que os dois já importavam.
3. **`flex-wrap` na faixa de pills**, risco de transbordo em viewport estreito que o próprio
   agente sinalizou.

---

## 3. Pendências e registros

| Item | Estado |
|---|---|
| **Conferência visual** | ⏳ **do Yan** — mesma limitação das versões anteriores (rota 307 → `/login` sem sessão; projeto sem jsdom/testing-library). Pontos: a coluna AV com as linhas de cima em travessão, a página abrindo em Consolidado+Realizado, a busca em Solicitações nos dois extremos de largura, e a ordenação do Gerencial. |
| Busca em Solicitações **não** vasculha o conteúdo das respostas | 📝 registrado. O agente levantou e não decidiu (correto). Hoje casa número e e-mail, como especificado. Se for ganho, é iteração futura. |
| Contador da pill "Canceladas (N)" | 📝 mantido como TOTAL, não como resultado da busca — é um selo de quantidade, não de lista visível. Decisão do agente, revisada e mantida. |
| Comparadores do Gerencial sem teste unitário | 📝 registrado pelo próprio agente. São puros e testáveis; ficou fora porque a delegação era só de `.tsx`. Candidato a follow-up. |
| **A estrutura da DRE mudou entre a v5.7.0 e hoje** | 📝 Receita de Vendas de 2025 caiu 104.481,59 e o LOP subiu 24.607,48, com o **REX intacto** — assinatura de categoria re-parenteada no editor, não de erro: qualquer categoria que troque de bloco dentro do que compõe o REX o deixa invariante. Consequência adotada: **teste de módulo puro não crava número vivo**; quem confronta o vivo é o caso de contrato. |

---

## 4. Arquivos

**Novos:** este out-briefing.

**Modificados:** `src/lib/dre/av.ts` (base + `indiceBaseAv`) · `src/lib/dre/av.test.ts`
(reescrito para a base nova, sem número vivo) ·
`src/components/financeiro/dre/tabela-dre.tsx` (defaults + `avPermitida` nas duas visões) ·
`src/components/financeiro/dre/resumo-executivo.tsx` (default de 2 anos) ·
`src/components/solicitacoes/board-solicitacoes.tsx` ·
`src/components/solicitacoes/minhas-solicitacoes.tsx` ·
`src/lib/solicitacoes/format.ts` (ordem + busca compartilhadas) ·
`src/lib/solicitacoes/format.test.ts` (14 casos, com a regressão) ·
`src/components/financeiro/gerencial/base-dados-tab.tsx` · `CHANGELOG.md` ·
`src/data/changelog-diretoria.ts` · `package.json` · `docs/WORKING-CONTEXT.md`.

## 5. Aprendizado (régua de 5 destinos)

| Achado | Destino | Ação |
|---|---|---|
| Delegação que dita a IMPLEMENTAÇÃO (`String(id).includes(dígitos)`) propaga o defeito da especificação — o agente cumpre literalmente e relata o efeito colateral | 4 — skill `orquestracao` | **adicionado**: delegar o CONTRATO (o que tem de valer) e não a linha de código |
| Teste de módulo puro não crava número vivo quando a fonte é DADO editável | 1 — enforcement: os testes já foram reescritos assim, com o caso de contrato cobrindo o vivo | nada em prosa |
| Extrair dígitos de um termo qualquer transforma busca textual em busca numérica | 1 — teste de regressão em `format.test.ts` | nada em prosa |
