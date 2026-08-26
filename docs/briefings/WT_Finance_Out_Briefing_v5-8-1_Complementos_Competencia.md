# Out-Briefing v5.8.1 — Complementos da DRE por Competência

**PATCH** · branch `feat/v5-8-1-complementos-competencia` · **ADR-0171** · **ZERO migration** ·
**1118 testes** (de 1056) · base: `origin/main` em `5f615a1` (pós-merge da v5.8.0, #247)

---

## 1. O que foi entregue

Três leituras novas na TopSection "Regime de Competência", todas **derivadas no cliente** dos
dois payloads que a página já buscava (`get_dre_competencia_mensal` + `get_dre_mensal`).
Nenhuma RPC nova, nenhuma tabela, nenhuma migration, nenhuma chamada acrescentada ao
`Promise.allSettled` da página.

| Componente | O que responde |
|---|---|
| **Resumo Executivo** (acima do demonstrativo) | "Como estamos, em oito linhas" — pills de ano, anos fechados, YTD e Δ em reais. É o MESMO componente do regime de caixa |
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
   base; §6 exigia que o sumário fosse "idêntico às células da tabela densa" — e a
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

- ✅ **1ª rodada de conferência visual FEITA pelo Yan** (26/08, com o dev server local). Os
  ajustes pedidos estão no §9 e já foram aplicados. **Falta a 2ª rodada**, confirmando os
  ajustes — a sessão do agente segue sem poder conferir sozinha (ver abaixo).
- 🔴 **Conferência visual pelo agente — NÃO FEITA.** A tela exige sessão autenticada, e a sessão do agente
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
  de cada barra não encosta na borda; (4) o Resumo Executivo bate célula a célula com a tabela
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

---

## 9. Ajustes da 1ª conferência visual (26/08, pedidos do Yan)

A conferência no ar produziu quatro ajustes, todos aplicados. Nenhum deles muda um número:
são de leitura, e três só apareceram na tela.

### 9.1 As "Linhas-chave" viraram o **Resumo Executivo**

Pedido: mesmo card do regime de caixa — perde a AV, o `Δ% 26×25` vira `Δ YTD 25·26` (em
REAIS) e ganha as pills de ano.

Isso não é renomear um componente, é **descartar o meu e reusar o que já existia**. O
`ResumoExecutivo` foi parametrizado por props **aditivas** (`linhas`, `titulo`, `ajuda`,
`subtitulo`) na receita da `TabelaDre` da v5.8.0: o call-site do caixa não muda uma linha,
então o render dele segue idêntico **por construção**.

Removidos por perderem consumidor (verificado com grep no app e no `supabase/seed/` antes):
`src/lib/dre/linhas-chave.ts`, o teste dele e
`src/components/financeiro/dre/linhas-chave-competencia.tsx`. As listas de linhas dos dois
regimes passaram para `src/lib/dre/linhas-resumo.ts` (módulo puro), para o caso de contrato
poder importá-las sem arrastar React.

**O caso de contrato mudou de alvo, e melhorou.** "As linhas-chave leem o mesmo número que o
demonstrativo" perdeu sentido: o Resumo agora lê o MESMO `consolidadoAnos` que a tabela densa,
montado pela MESMA função e pelo MESMO `indexar` — a garantia virou estrutural, que é melhor
que um teste. No lugar entrou **"toda linha do Resumo Executivo existe na árvore VIVA do seu
regime"**, cobrindo os DOIS regimes: uma chave renomeada no editor da estrutura deixaria a
linha VAZIA, em silêncio, num card que a diretoria lê.

⚠️ **A janela do YTD do Resumo continua sendo a da cobertura.** A página monta o consolidado
de competência duas vezes — `consolidadoComp(mesJanela)` para a tabela densa e
`consolidadoComp(mCob)` para o Resumo —, pela mesma função. A decisão do §4 fica de pé, e os
dois nunca discordam por CAMINHO: se discordarem, é a janela, e o subtítulo diz qual é.

### 9.2 As duas cascatas ficam EMPILHADAS, em largura cheia

Eram um grid de 2 colunas. Com metade da largura, os rótulos longos das folhas ("Despesas
Operacionais de RH Benefícios") quebravam em duas linhas e colidiam com o rótulo de valor da
barra vizinha — visível no print. Largura cheia devolve o espaço horizontal, que é exatamente
a dimensão que uma cascata deitada consome. O teto da largura do eixo de rótulos subiu de
210px para 280px para aproveitar isso.

### 9.3 Linha do zero no CENTRO (domínio simétrico)

O domínio passou a ser `[-M, +M]`, com `M` = maior magnitude presente + 8% de folga: a linha do
zero cai no centro do gráfico, melhora à direita e piora à esquerda.

**Detalhe que custou uma tentativa:** isso não dá para fazer com as funções de `domain` do
Recharts. Cada uma recebe só o SEU extremo (`dataMin` ou `dataMax`), então nenhuma enxerga o
outro lado para espelhá-lo — o cálculo tem de acontecer no componente, com os dados em mãos.

### 9.4 Barras sem arredondamento

`radius={0}`. Numa cascata a barra é um **segmento entre dois pontos do eixo**, e a ponta
redonda sugere um fim de valor que não existe: o degrau seguinte começa exatamente onde este
termina.

### Observação não pedida (não alterada)

No print, o degrau `IMP_H` aparece como "IMPOSTOS E DEDUÇÕES DA RECEITA BRUTA", em caixa alta,
enquanto os vizinhos estão em capitalização normal. É fiel ao dado: na árvore de competência a
`IMP_H` é `blocoH` (cabeçalho, gravado em caixa alta) e as demais folhas são `sub`. Não foi
mexido porque **normalizar caixa no cliente é o caminho para mangular siglas** ("RH" viraria
"Rh"), e o rótulo é dado editável — a correção limpa é no editor da estrutura, renomeando a
linha. Fica registrado como escolha, não como esquecimento.
