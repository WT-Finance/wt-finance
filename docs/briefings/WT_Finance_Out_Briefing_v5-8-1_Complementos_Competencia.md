# Out-Briefing v5.8.1 — Complementos da DRE por Competência

**PATCH** · branch `feat/v5-8-1-complementos-competencia` · **ADR-0171** · **ZERO migration** ·
**1133 testes** (de 1056) · base: `origin/main` em `5f615a1` (pós-merge da v5.8.0, #247)

---

## 1. O que foi entregue

Três leituras novas na TopSection "Regime de Competência", todas **derivadas no cliente** dos
dois payloads que a página já buscava (`get_dre_competencia_mensal` + `get_dre_mensal`).
Nenhuma RPC nova, nenhuma tabela, nenhuma migration, nenhuma chamada acrescentada ao
`Promise.allSettled` da página.

| Componente | O que responde |
|---|---|
| **Linhas-chave** (acima do demonstrativo) | "Como estamos, em oito linhas" — anos fechados, par de YTD, Δ% e duas colunas de AV |
| **Decomposição da variação** | "O que moveu o resultado contra o ano passado" — cascata por grupo, ordenada por magnitude |
| **Ponte Competência ↔ Caixa** | **"Por que os dois números desta página são diferentes"** — 16 degraus, do resultado por emissão ao resultado por movimentação |

A ponte é o centro da versão: a v5.8.0 pôs dois regimes na mesma tela sem explicar a distância
entre eles, e a pergunta que isso convida — *"qual dos dois está certo?"* — é a pergunta errada.

**Números vivos (YTD jan–ago/2026, medidos):** competência **−79.434,67** → caixa
**+136.811,39**, Δ capital de giro **+216.246,06**. Residual da ponte: **0,00** — toda folha
das duas árvores pareia.

---

## 2. Divergências do briefing, e por quê

O briefing foi validado contra o repo real antes de qualquer edição. Sete divergências:

1. **`mReal` não existe.** O briefing citava "o `mReal` que o as-built já deriva da cobertura".
   O as-built usa `mesJanela` = mês corrente de `hojeSP()`. O conceito existe com outro nome
   (`cobertura_ate`/`mes_corrente` do payload), e a derivação foi escrita nesta versão.
2. **Contradição interna §1 × §6** (a mais séria): §1 mandava cortar o YTD pela cobertura da
   base; §6 exigia que as linhas-chave fossem "idênticas às células da tabela densa" — e a
   tabela corta pelo calendário. **Decisão do Yan na abertura: vale a cobertura**, sem alterar
   a tabela densa. Ver §4.
3. **Distribuição de Lucros:** o anexo a jogava no residual. **Decisão do Yan: degrau próprio**
   (16 degraus, não 15). Ela pareia limpa nos dois lados (`DL` ↔ `DIST_LUCROS`) e é grande.
4. **"Um degrau por SUB da árvore"** — `IMP_H` é `blocoH`, não `sub`, e o `tipo` de um bloco é
   **dado editável** (a `RB_H` já migrou de `blocoH` para `tot` na v5.7.1). Agrupa-se por
   **folha** (bloco que recebe categorias), nunca por tipo.
5. **"Grupos lidos da árvore VIVA"** — o payload não carrega `formula`, então não há como saber
   por ele quem é agregador. Mas cada linha `t==='cat'` traz `g` = bloco pai, e o conjunto dos
   `g` distintos **é** o conjunto das folhas vivas. A árvore viva saiu de graça, sem chamada nova.
6. **Bandeja e excluídas ficam FORA** — o briefing dizia "toda folha dos DOIS payloads". A
   bandeja não compõe o REX; incluí-la quebraria a identidade que o próprio briefing manda
   travar em teste.
7. **`FIN ↔ FIN` confirmado, não presumido** — o `RFIN` do caixa foi dissolvido em `FIN` na
   v5.7.0 (`0251`). O anexo supunha certo; a verificação era obrigatória.

---

## 3. A identidade fecha por construção — e por que isso muda o teste

Nos dois regimes, `REX` é a **soma de todas as folhas** da árvore (álgebra sobre `0205`+`0251`+
`0254` e `0256`, **medida** contra produção antes de escrever a primeira linha de módulo:
competência e caixa, 2025 e 2026, quatro payloads, fecha ao centavo em todos).

Logo, se o vocabulário for uma **partição** das folhas, `REX_comp + Σ degraus = REX_caixa` é
consequência, não coincidência.

Isso muda o que vale testar. Um residual que absorve a diferença faria **qualquer** pareamento
"fechar" — e um card que sempre fecha não prova nada. O teste que importa é o de **totalidade**:
nenhuma folha em dois baldes, nenhuma folha fora de todos. Está travado em três lugares:
no teste de módulo (injetando uma folha órfã), no `PAREAMENTO_PONTE` (varredura de duplicata) e
no `rpc-contrato.test.ts`, **contra a base viva**, porque a árvore é editável pela interface.

---

## 4. A janela do YTD — o custo que se aceita

Os três componentes cortam em jan → último mês coberto pela base de competência, e **declaram a
janela no subtítulo**. A tabela densa segue cortando pelo calendário.

**Por que não o calendário:** a base de competência é um upload periódico e fica defasada entre
cargas. Cortar por `hojeSP()` somaria meses ainda não carregados como se fossem zero,
subestimando o YTD **em silêncio** — um número que fecha e está errado para menos, que é a
espécie de erro que nenhum gate pega.

**O custo:** quando a base atrasar, o "YTD 26" dos cards mostrará menos meses que a coluna "YTD"
da tabela logo acima. Dois números vizinhos diferentes na mesma tela é um custo real, pago
conscientemente; o subtítulo é o que os reconcilia. **Hoje as duas janelas coincidem** (base
cobre até 2026-08, estamos em ago/26), então a divergência é futura e condicional.

**Alternativa descartada:** alinhar a tabela densa à cobertura resolveria na raiz, mas altera o
que a v5.8.0 entregou — escopo maior que um patch. Fica na fronteira (§7).

---

## 5. Achados da auto-auditoria (dois defeitos invisíveis aos gates)

Ambos encontrados **antes** de qualquer conferência visual, lendo o fonte do `recharts@3.8.1`
instalado em vez de confiar na memória:

1. **O domínio do eixo cortava os negativos.** `ChartXAxisBRL()` não declarava `domain`, e o
   default do Recharts para eixo numérico é `[0, 'auto']` (`axisSelectors.js:50`) — ancora em
   zero. Todos os call-sites anteriores plotam só positivos, então ninguém tinha esbarrado
   nisso. As âncoras da ponte **cruzam o zero na vida real** e metade dos degraus é negativa:
   essas barras sumiriam. `domain` virou parâmetro opcional; o default ficou intocado.
2. **A linha do zero no eixo errado.** `ChartZeroLine()` fixa `y={0}`; em `layout="vertical"` o
   Y é o eixo de **categorias**, e o Recharts aceita sem reclamar, desenhando uma régua sobre a
   primeira categoria. Entrou `ChartZeroLineX()`.

A mesma leitura confirmou que a **barra de faixa** (`dataKey` → `[início, fim]`) é suportada
nativamente (`Bar.js:604`) — e é ela que faz a cascata funcionar com negativos, ao contrário do
hack clássico da barra transparente empilhada, que quebra.

---

## 6. Parecer da revisão

⚠️ **O subagente `revisor` NÃO foi despachado.** A sessão que executou esta versão operava sob
uma restrição de harness que proíbe invocar subagentes sem pedido explícito do usuário. Em vez
de contornar, seguiu-se o **Protocolo D5**: fazer tudo o que não depende do passo barrado,
deixar o ambiente pronto e declarar o que ficou não verificado.

**Feito no lugar (não substitui, complementa):** auto-auditoria adversarial completa — que
produziu os dois achados do §5 e as sete divergências do §2 — mais os 5 casos de contrato novos
contra a base viva.

**Não verificado por terceiro:** aderência às convenções por um contexto limpo, sem o viés de
ancoragem de quem planejou.

**Como rodar, se quiser:** despachar o `revisor` sobre os arquivos de `src/lib/dre/` (5 módulos
novos), `src/components/charts/` (cascata + primitivos) e `src/components/financeiro/dre/`
(2 cards), com as skills `graficos`, `tabela-densa`, `ui-design-system` e `react-padroes`.

`revisor-db` **não se aplica**: zero migration, zero RPC.

---

## 7. Pendências e fronteira

### Pendente antes/no merge

- 🔴 **Conferência visual — NÃO FEITA.** A tela exige sessão autenticada, e a sessão do agente
  não insere credenciais (barreira dura, mesmo com senha salva no navegador). O dev server
  subiu e a página respondeu (redirecionou ao login corretamente). É o primeiro passo do merge,
  no modelo da v5.4.1: **entregar → Yan confere no ar → ajustar**.
  ```bash
  cd /home/yan-wt/projects/wt-finance/.claude/worktrees/feat+v5-8-1-complementos-competencia
  npm run dev -- -H 0.0.0.0        # WSL2 precisa do -H
  # http://localhost:3000/financeiro/dre
  ```
  **O que olhar, em ordem de risco:** (1) a cascata da ponte desenha as barras **negativas**
  (a âncora de competência está negativa hoje) e a linha do zero cai no lugar certo; (2) os
  rótulos do eixo Y não truncam demais no grid de 2 colunas; (3) o rótulo de valor à direita
  de cada barra não encosta na borda; (4) as linhas-chave batem célula a célula com a tabela
  densa logo abaixo; (5) a seção de **caixa não mudou nada**.
- ⚠️ **A hora do `changelog-diretoria.ts` é de AUTORIA** (`2026-08-26T14:30`), não do merge.
  O `/pos-merge` reconcilia ao horário real, como fez na v5.8.0.
- ⚠️ **O `git pull --ff-only` na raiz não foi executado.** A sessão estava isolada em worktree e
  o harness barrou o redirecionamento para o checkout compartilhado. Nada aqui depende disso —
  a worktree nasceu de `origin/main` já atualizado (`5f615a1`) —, mas o checkout raiz do Yan
  segue um merge atrás:
  ```bash
  cd /home/yan-wt/projects/wt-finance && git pull --ff-only
  ```

### Decisão de produto ainda aberta

- **O nome "Decomposição da variação".** O modelo da gerente chama de "Decomposição do desvio ·
  previsto (= 2025 YTD)". Renomeou-se porque "desvio"/"previsto" prometem um orçado que a
  plataforma não tem. Se preferir o nome dela, é **troca de string** em
  `src/app/financeiro/dre/page.tsx` (prop `titulo` do `CascataCard`).

### Observação de negócio (não é defeito)

- O degrau **"Impostos e Deduções"** da ponte é grande: −419.366,50 por competência contra
  −2.863.256,92 no caixa no YTD. A ponte está apenas expondo o que as duas curadorias fazem —
  vale um olhar seu sobre o de-para de impostos dos dois regimes, que é dado, não código.

### Fronteira (segue fora, como no briefing)

Mix de receita · orçado e a coluna "Orç YTD" · os 4 cards de KPI no topo da seção · CSV da DRE ·
alinhar a janela da **tabela densa** à cobertura (ver §4).

---

## 8. Aprendizado — régua de 5 destinos

| Aprendizado | Destino | Estado |
|---|---|---|
| Domínio default `[0,'auto']` do Recharts corta negativos | **Skill `graficos`** | proposto abaixo |
| `ChartZeroLine` é do eixo Y; barra horizontal precisa do X | **Enforcement** (o primitivo `ChartZeroLineX` já existe) | resolvido em código |
| Barra de FAIXA em vez do hack da barra transparente | **Skill `graficos`** | proposto abaixo |
| Identidade que fecha por construção → testar TOTALIDADE, não a soma | **ADR-0171 §2** | registrado |
| Janela de base por UPLOAD ≠ janela de base CONTÍNUA | **ADR-0171 §4** | registrado |

**Proposta para a skill `graficos`** (não aplicada — é edição de skill, passa pelo seu aval):
acrescentar à seção "Eixos e formatação de valores":

> - **Série que cruza o ZERO** → o domínio default de um eixo numérico no Recharts é
>   `[0, 'auto']`: ele ancora em zero e **corta os negativos**, sem erro e sem aviso. Gráfico
>   com valores dos dois lados precisa de `domain` explícito (`['dataMin','dataMax']` ou funções
>   com folga). E em barra HORIZONTAL (`layout="vertical"`) a linha do zero é `ChartZeroLineX()`
>   — `ChartZeroLine()` ancora no Y, que ali é o eixo de categorias, e desenha a régua sobre a
>   primeira categoria. Caso vivo: `charts/cascata.tsx` (v5.8.1).
> - **Waterfall / cascata** → barra de FAIXA (`dataKey` apontando para `[início, fim]`), nunca o
>   truque da barra transparente empilhada: o empilhamento manda negativo para o outro lado e a
>   figura quebra assim que uma âncora cruza o zero.
