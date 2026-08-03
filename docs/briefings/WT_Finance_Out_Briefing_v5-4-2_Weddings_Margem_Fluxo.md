# Out-briefing v5.4.2 — Weddings: Margem anualizada + Fluxo de Caixa unificado

**Tipo:** PATCH · **Migration:** 0228 (aditiva, aplicada e verificada) · **ADR:** 0162 ·
**Base:** `main` @ v5.4.1 (rebase feito) · **Branch:** `feat/v5-4-2-weddings-margem-fluxo` ·
**Rota A** · Sessão B de duas em paralelo (a v5.4.1 mergeou primeiro, #207+#208)

---

## 1. O que o briefing errou (achado antes de escrever código)

O briefing declarava **"Migration: uma aditiva (alargar a janela da RPC dos gráficos)"**.
Isso está errado: a janela **sempre foi parâmetro do chamador**, e
`get_acumulado_weddings` já a clampava em `LEAST(GREATEST(p_meses_passados,1),120)` e
`...,60)` desde a **migration 0141** (linhas 46–47). Os 48+36 sugeridos cabiam folgados.
Alargar foi **mudança de argumento no call-site**, não de schema.

Em compensação, o briefing **não previu** a migration de que a versão realmente
precisava. A M1 pede a coluna nova **ordenável**, e a Lista de Operações **pagina no
servidor** (`ROW_NUMBER()` + `p_pagina`/`p_por_pagina`) com a whitelist de `ORDER BY`
terminando em `ELSE 'd_data_evento'` — um **fallback silencioso**. Ordenar só no cliente
reordenaria as 10 linhas visíveis enquanto o cabeçalho anuncia ordenação global; pedir
`margem_aa` sem tocar o SQL ordenaria por data do evento **sem avisar**. Daí a **0228**.

Coincidência útil: "uma migration aditiva" seguiu verdadeiro — mas é outra migration,
por outro motivo.

**Outros dois pontos do briefing checados contra o repo:**

- **"Duração"** (item aberto do plano de paralelização): confirmada como
  `data_evento − data_venda_contrato` em **dias** no servidor (`d_duracao`), exibida em
  meses de **30,44 dias** (`fmtMeses`). Servidor e cliente concordam (transformação
  monotônica), então é seguro dividir por ela. Registrado no tooltip e no ADR.
- **Totais imunes ao slider**: o briefing pedia; a RPC **já** calculava
  `total_a_receber`/`total_a_pagar` sem recorte de data (só por operação). Confirmado por
  **medição**, não por leitura: idênticos ao centavo em 24+18 e em 48+36
  (R$ 10.230.558,92 e R$ 11.396.318,12).

---

## 2. Missões

| # | Estado | Notas |
|---|---|---|
| **M1** — Lista de Operações | ✅ | Coluna "Margem (a.a.)", renomes, Exportar, migration 0228 |
| **M0** — GATE (mockup) | ✅ | Aprovado pelo Yan, com 2 pedidos de ajuste (slider + limites) |
| **M2** — TopSection + totais + filtro | ✅ | TopSection própria; filtro no topo; totais em card próprio |
| **M3** — Card único + slider | ✅ | Slider entre os gráficos; acumulado reinicia; referência na janela |
| **M4** — Fechamento | ✅ | Este documento, ADR-0162, CHANGELOGs, bump, WORKING-CONTEXT, PR |

### Decisões do Yan no gate (e depois dele)

1. **Mockup aprovado.**
2. **Slider deve seguir o padrão do Fluxo de Caixa** → a geometria de
   `financeiro/posicao-projetado.tsx` foi **extraída** para o primitivo
   `components/shared/slider-horizonte.tsx` em vez de reimitada de olho.
3. **Limite de 36 meses para cada lado.**
4. **`*` de ciclo curto → ajuda "?" no cabeçalho.** ⚠️ **Consequência:** não há mais
   marca **por linha** nas operações curtas — o aviso vive só no cabeçalho. Se a marca
   por linha for desejada de volta, é uma linha de código.
5. **"Margem a.a." → "Margem (a.a.)"** (a coluna do Excel seguiu `Margem a.a. (%)`;
   `Margem (a.a.) (%)` duplicaria os parênteses — decisão pequena, reversível).
6. **Mesma regra de cor da "Margem"** (faixa alvo/atenção), no lugar da cor por sinal
   que eu havia implementado. **Medido antes de aplicar:** 79 das 237 operações (33%)
   caem em banda diferente nas duas colunas — 25 vermelhas no a.a. com Margem verde (o
   efeito pretendido) e 10 no inverso (ciclo curto). Exemplo real: *Amanda e Felipe*,
   margem 10,5% (vermelho) em 1,6 meses → 76,7% a.a. (verde).
7. **Referência de saídas mantida como especificada.** Registrado que ela **coincide por
   construção** com o acumulado de saídas do último mês visível (era assim antes também);
   antes da borda direita, funciona como benchmark prospectivo.

### Rodadas de ajuste com a tela na mão (03/08, depois do merge da v5.4.1)

O Yan rodou a aplicação e mandou prints — o mesmo laço "entregar, mandar print, ajustar"
que funcionou na v5.4.1. Onze ajustes, em quatro mensagens:

- **Títulos dos dois gráficos** de volta ao nível hierárquico de quando eram cards
  separados, e encurtados para **"Mensal"** e **"Acumulado"**. ⚠️ Com isso a tela perdeu a
  única menção ao reinício do acumulado na borda — a definição segue no ADR e no rótulo da
  referência ("…na janela").
- **Rótulo da janela** → "N meses passados + N meses futuros".
- **Slider:** sem o rótulo "Horizonte de tempo:", extremos dizendo só "N meses", **trilho
  dourado** e **28px de respiro** de cada lado (estava colado na legenda do gráfico de
  cima). O dourado virou a prop `corTrilho` do primitivo, com o neutro como **default** —
  hardcodar a cor da aba ali faria um call-site futuro do Financeiro herdá-la sem querer.
- **Slider instantâneo:** `isAnimationActive={false}` nas 5 séries. O atraso era a animação
  **default de 1500ms do Recharts** reanimando os dois gráficos a cada arrasto, não o
  cálculo (fatiar 74 meses é trivial). Diagnóstico que vale guardar: quando um controle de
  scrubbing parece lento num gráfico, suspeite da animação antes do dado.
- **"Inverter saídas" removido**, saídas sempre para cima. **Consequência tratada:** com as
  barras subindo, a metade negativa do eixo Y passou a abrigar só a linha de resultado,
  então o eixo deixou de poder mostrar valor absoluto — antes o sinal vinha da direção da
  barra, e um "R$ 1,5 Mi" abaixo do zero seria leitura errada.
- **Card de totais:** filtro trazido para DENTRO dele; a frase explicativa saiu da tela; os
  dois valores dividem em metades iguais o espaço não ocupado pelo filtro (régua no meio,
  medida a 1px do centro), alinhados à **esquerda** de suas metades.
- **Bug do salto ao topo** — ver a seção própria em §7.

---

## 3. Banco

**Migration 0228** — `CREATE OR REPLACE` de `get_operacoes_weddings__nucleo` acrescentando
a coluna derivada `d_margem_aa` à CTE `base` e a entrada `WHEN 'margem_aa'` à whitelist de
`ORDER BY`. Assinatura idêntica (9 parâmetros) ⇒ REPLACE puro, sem `DROP+CREATE` (o
precedente do ADR-0126 vale para **parâmetro novo**, que não é o caso). Shape do retorno
idêntico — `d_margem_aa` é chave interna e **não entra** no `jsonb_build_object`, logo
nenhum schema Zod muda.

- Classificador do gate (rodado antes de aplicar): **`aditiva`, zero motivos**.
- Conjunto pendente conferido **antes** do push: só a 0228 (0226/0227 destrutivas já
  estavam no remoto) — a lição da v5.2.0 (`db push` varre TODO o pendente) foi honrada.
- Backup-gate: **VERDE** (51/51 tabelas, restore-test 3/3 com checksum igual).
- **Verificação via REST/`service_role`** (o `db query` não executa o corpo):
  - ordenação por `margem_aa` **monotônica** nas duas direções, reproduzindo a fórmula do
    cliente em todas as 200 linhas da página 1 — prova de que o número que ordena e o que
    aparece são o mesmo;
  - `NULLS LAST` honrado: a única operação não anualizável (*Camila e Bruno*, ambas as
    datas nulas) cai por último em `desc`, na página 2, índice 37, sem nada depois;
  - payload sem `margem_aa` (shape inalterado);
  - **auditoria de regressão: 13 chaves de ordenação × 2 direções = 26 combinações, zero
    quebras** — o corpo transcrito da 0113 não sofreu dano;
  - paginação: `total=144` em `status='passado'` (o número do briefing), páginas 1 e 2 sem
    sobreposição e fronteira monotônica (76,71% → 70,13%).
- Casos de contrato: `rpc-contrato.test.ts` **75 testes verdes**.
- Nenhuma migration destrutiva pendente na pasta; nenhuma cópia 0950–0954 (foram
  renumeradas para 0210–0214 no merge da v5.4.0 — **o passo 4 do `/nova-versao` ficou
  obsoleto**, ver §7).

---

## 4. Gates

`npx tsc --noEmit` **0** · `npm run lint` **0** (zero warnings novos) · `npm test`
**644 testes / 42 arquivos** · `npm run build` **limpo**.

⚠️ **Armadilha reencontrada:** ao remover a rota de preview, o `tsc` acusou erro em
**arquivo gerado** (`.next/types/validator.ts` ainda importava a rota deletada). Não é o
código e não se toca no tsconfig: `rm -rf .next/types` e rodar de novo. Já documentado no
ritual a partir da v5.3.3 — confirmado que vale também para rota **removida**, não só para
`next dev` + `build` na mesma worktree.

---

## 5. Conferência visual

**Feita, parcialmente — e o que ficou de fora está declarado.**

O MCP Playwright não sobe em sessão de background (registro da v5.3.3), e a tela real
exige sessão autenticada (`/performance/weddings` responde 307 → `/login`); o agente não
digita credenciais. `BYPASS_AUTH=true` existe no `.env.local` mas **nenhum código o lê** —
é resíduo morto (achado também registrado pela v5.4.1).

**O que foi verificado:** um mockup interativo standalone com os **dados reais de
produção** e a **matemática portada fielmente** de `janela-fluxo.ts`, exercitado em
Chromium headless (o Chromium que o próprio MCP instalou) em quatro larguras de janela
(24+18, 6+6, extremo 36+36, degenerado 0+0): **zero erros de console**, limites 36/36,
régua com os 6 marcos semestrais, `accent-color` do trilho conferido em `rgb(189,150,92)`
(o dourado de Weddings, depois do ajuste do Yan) e o invariante "referência == acumulado de
saídas do último mês visível" válido em todas. Cada rodada de ajuste foi re-renderizada e
medida no mesmo harness (posição da régua a 1px do centro da região livre, respiro do
slider de 28px, ausência de sobreposição entre os KPIs).

**Achado real dessa conferência:** os **dois totais se sobrepunham** — item de flex encolhe
abaixo do próprio conteúdo por default (`flex-shrink: 1`) e o valor de 8 dígitos invadia o
vizinho. Corrigido com `shrink-0` **no componente React**, não só no mockup. `tsc`, lint,
build e 644 testes passavam **com o defeito presente** — só olhando se pega.

**NÃO VERIFICADO (declarado):** a tela real renderizada com o Tailwind/DS compilado —
em especial o balão do "?" do cabeçalho (posicionamento e clipping dentro do
`ScrollAutoHide`) e o card único dentro da TopSection. O raciocínio está feito
(`overflow-x-auto` clipa os dois eixos, mas o balão desce para o corpo da tabela e abre
para a **esquerda** por ser a última coluna, então permanece dentro), e o padrão é o mesmo
de dois call-sites vivos (`faturamento-corp`, `posicao-projetado`) — mas é raciocínio, não
observação. **Vale um olhar do Yan ao rodar `npm run dev`.**

---

## 6. Parecer da revisão

**`revisor` (código): APROVADO COM RESSALVAS** — 1 ALTO, 1 MÉDIO, 2 BAIXO.
**`revisor-db` (banco): APROVADA** — 0 CRÍTICO, 0 ALTO, 1 MÉDIO, 1 BAIXO.
`verificador-visual` **não despachado**: o MCP Playwright não sobe em sessão de background
(v5.3.3), então o agente voltaria com NÃO VERIFICADO por falta das ferramentas `browser_*`.
A conferência headless que fiz no lugar está no §5.

### ALTO — afordância "?" inacessível por teclado · **CORRIGIDO**

`lista-operacoes.tsx` — o gatilho do "?" era um `<span onClick>` sem `tabIndex`, e o
primitivo `Tooltip` só abria em `group-hover/tip:visible`. Resultado: quem navega por
teclado **não alcançava** o elemento nem veria o balão — e essa dica é a ÚNICA explicação
de por que a "Margem (a.a.)" pode discordar da "Margem" ao lado, divergência que a própria
medição desta versão põe em **33% das operações**. Viola o MUST de suporte a teclado do
`web-design-guidelines`.

Corrigido em duas metades, porque uma sem a outra não resolve:
1. `src/components/ui/tooltip.tsx` — o balão passa a abrir no hover **e no foco**
   (`group-focus-within/tip:visible`). Aditivo: beneficia **todos** os call-sites.
2. `lista-operacoes.tsx` — o gatilho virou `<button type="button">` com `aria-label` e
   `.foco-neutro` (anel só no `:focus-visible`, sem halo no clique de mouse).

**Verificado no CSS gerado pelo build**, não só no código-fonte — a regra
`.group-focus-within\/tip\:visible:is(:where(.group\/tip):focus-within *){visibility:visible}`
existe no bundle, então tabular até o botão abre a dica de verdade.

⚠️ **Pendência deliberada:** os outros dois call-sites da receita
(`financeiro/faturamento-corp` `CabecalhoAjuda` e `financeiro/posicao-projetado`
`KpiJanela`) ainda usam `<span>` e seguem inacessíveis por teclado. Não foram tocados
seguindo a recomendação do próprio revisor — "não expandir escopo silenciosamente". É
**uma linha em cada** (`span` → `button type="button"`); a metade do primitivo já está
pronta esperando por elas. Registrado também na skill `ui-design-system`.

### MÉDIO (revisor) — a skill do DS ensinava o eixo TROCADO · **CORRIGIDO**

`ui-design-system` §4 dizia "`pr-3.5` no eixo X, `pb-3.5` no eixo Y" — **invertido**.
Conferi contra a implementação e contra os call-sites antes de aceitar: o thumb do eixo Y é
vertical e mora à direita (`right-1 w-1.5`, logo gutter em `pr`); o do eixo X é horizontal e
mora embaixo (`bottom-1 h-1.5`, logo `pb`). Os dois call-sites vivos sempre seguiram a
implementação (`resumo-executivo.tsx` usa `eixo="x"` com `pb-3.5`;
`decomposicao-lancamentos.tsx` usa o eixo Y com `pr-3.5`). A receita foi corrigida **com a
explicação do porquê**, para não voltar a inverter.

### MÉDIO (revisor-db) — a prova da ordenação era MANUAL · **CORRIGIDO**

O contrato de `get_operacoes_weddings` só exercitava `p_ordenar_por: 'data_evento'`, então
um typo em `d_margem_aa` ou a perda do `WHEN` cairia no `ELSE 'd_data_evento'` **sem erro** e
nenhum gate acusaria (o `tsc` não lê SQL, o teste de shape não lê ORDEM). A verificação das
26 combinações que fiz na entrega era manual e não ficava de pé.

Virou caso de contrato permanente em `rpc-contrato.test.ts`: um caso de `parseRpc` com a
chave nova (estoura na hora se a coluna não existir) + um bloco próprio conferindo
monotonicidade nas duas direções **com a mesma função que a tela usa**, mais `NULLS LAST` e
paginação sem repetição. É o corolário que `banco-e-rpc` §7 e `contrato-rpc-front` §5 já
pediam.

**O guard foi visto REPROVANDO**, como o projeto exige: rodando o mesmo check com a RPC
ordenando por outra chave, ele acusa **97 quebras** com `data_evento` (exatamente o fallback
silencioso do `ELSE`) e 96 com `ml`. Só passa quando a ordenação é de fato por `margem_aa`.

### BAIXO — dispostos, não corrigidos

- **`ehDuracaoCurta` sem consumidor de UI** (revisor). Verdade, e é consequência de uma
  decisão do Yan: o sinal por linha do ciclo curto virou o "?" do cabeçalho. **Mantida** —
  encoda um limiar documentado no ADR-0162, tem 3 testes e volta de graça se a marca por
  linha for reintroduzida. Registrado aqui para não parecer esquecimento.
- **Título "Fluxo de Caixa" duplicado** (barra da `TopSection` + `<h2>` do card). É
  redundância de conteúdo, não erro de hierarquia — o revisor confirmou `h1 → h2 → h3` sem
  pulo. **Não alterado de propósito:** os títulos desta tela foram curados pelo Yan em
  quatro rodadas de ajuste, e mudar um deles por conta própria contrariaria isso. Fica como
  pergunta a ele.
- **`catch {}` vazio no `handleExportar`** (revisor, marcado como pré-existente e fora do
  escopo): engole falha de fetch ou de `XLSX.writeFile` sem log nem feedback. É código de
  v4.17.0, tocado aqui apenas porque a exportação passou a levar a coluna nova. Registrado
  para uma missão de robustez de exportação — a v5.3.4 mostrou o custo de `catch` mudo.

### O que os revisores confirmaram sem achado (vale registrar)

- **Transcrição da 0228 é byte-idêntica** à 0113 fora das duas inserções anunciadas —
  DECLARE, as três CTEs, `FROM`/`JOIN`/`WHERE`, o `jsonb_build_object` de 43 linhas, o
  `EXECUTE ... USING` e o `RETURN`. Era o risco nº 1 de um `CREATE OR REPLACE` de função
  grande, e foi conferido linha a linha por um contexto independente.
- Paridade cliente↔SQL nas bordas (duração 0, negativa, margem 0) verificada de forma
  independente; `30.44` é literal `numeric`, logo **sem divisão inteira**.
- `CREATE OR REPLACE` de assinatura idêntica **preserva owner/ACL** por semântica do
  Postgres — `__nucleo` segue `service_role`-only, wrapper público intocado.
- Whitelist do `ORDER BY` continua fechada (sem superfície de injeção no SQL dinâmico).
- Nenhum import, token ou legenda órfã após remover os dois componentes antigos.
- O critério do `scroll: false` foi validado nos 8 call-sites, e os dois `router.push`
  deixados de fora navegam de fato para outra rota.
- Contagens de teste conferidas contra o que o ADR/CHANGELOG afirmam (24 + 25).

## 7. Pendências e registros

**Do Yan (decisão de produto/dado, fora do escopo desta versão):**
- **Anomalia de dado exposta pela coluna nova:** *"Darlene e Adnan - DDMMAA"* tem
  `margem_liquida_pct = **782%**` (10 meses → 939,6% a.a.) e é a **única** operação acima
  de 100% de margem. O `DDMMAA` no nome sugere linha de template inacabada. A anualização
  não criou o problema — apenas o levou ao topo quando se ordena por "Margem (a.a.)". O
  briefing coloca definições de faturamento/resultado **fora** do escopo, então não mexi.
- **Separador decimal da coluna "Margem"** (`17.5%` → `17,5%`): mantido, por coerência com
  a coluna vizinha e com o locale do app. Reversão é de uma linha.
- **Marca por linha em ciclo curto:** removida por decisão 4 acima; se quiser de volta
  junto com o "?", é trivial.
- **Conferência visual da tela real** (ver §5).

**Achado SISTÊMICO fora do escopo — filtro que navega rola a página para o topo:**

O Yan reportou que marcar uma operação no filtro de Weddings fazia a página **saltar
para o topo**. Causa: o App Router rola para o topo em **toda** navegação por default, e
o `aplicar()` do `dropdown-operacao` fazia `router.push(url)` sem `{ scroll: false }`. Numa
interação de múltipla escolha — o usuário marca várias operações em sequência — isso
arranca a pessoa do controle a cada clique. **Corrigido** aqui (é o filtro que esta versão
moveu de lugar).

**O defeito era do padrão, e o Yan pediu para corrigir tudo ainda neste patch.** Sete
outros filtros que navegam no lugar tinham o mesmo `router.push` sem `scroll: false` —
**todos corrigidos aqui**:

| Arquivo | Linha |
|---|---|
| `src/components/shared/periodo-pills-url.tsx` | 57 |
| `src/components/shared/periodo-filter-url.tsx` | 48 |
| `src/components/shared/setor-filter.tsx` | 26 |
| `src/components/metas/metas-periodo-pills.tsx` | 37 |
| `src/components/metas/cadastro-grade.tsx` | 413 |
| `src/components/solicitacoes/solicitacoes-content.tsx` | 37 e 45 |

O padrão correto **já existia** em dois call-sites (`periodo-filter-pills-url.tsx` e
`dre/tabela-dre.tsx`, este último da v5.4.1) — ou seja, não foi invenção desta versão:
sete lugares simplesmente não o seguiam.

**Critério aplicado (não foi busca-e-substitui cega):** só recebe `scroll: false` a
navegação que permanece no **MESMO `pathname`** — filtro/recorte, em que a página é a
mesma e só o conteúdo muda. Ficaram DE FORA, com motivo:

- `executiva/mix-setor-chart.tsx:33` e `performance/mix-setor-table.tsx:79` — empurram
  para `/performance?setor=…`. O primeiro é navegação **entre rotas** (de `/executiva`),
  onde rolar ao topo é o certo. O segundo renderiza **dentro de** `/performance`, então é
  mesmo-pathname — mas é um **drill-down** que re-escopa a página inteira para um setor,
  e ali o topo é plausivelmente onde o usuário quer estar. Deixado como está de propósito;
  se incomodar, é a mesma linha.
- `shared/preview-session-guard.tsx:26` — `router.replace` no mesmo pathname, mas não é
  filtro: é o guard que derruba `?preview=1` fora da sessão e faz a página trocar de
  preview para o aviso "em construção". Conteúdo diferente ⇒ topo é defensável.

**Armadilha que o `tsc` pegou** (e que uma substituição em massa teria escondido): a
primeira tentativa de patch pôs o `{ scroll: false }` como **2º argumento do
`startTransition`**, não do `router.push` — `startTransition(() => router.push(url), {…})`
compila como erro de aridade (`Expected 1 arguments, but got 2`) porque o `))` que a
substituição casou era a fronteira entre as duas chamadas aninhadas, não o fim do `push`.
Cinco arquivos acusaram na hora. Lição: em `push` dentro de `startTransition`, o objeto de
opções vai **dentro** do parêntese do `push`.

Segue valendo como candidato a **enforcement mecânico**: uma regra `wt/*` que exija
`scroll: false` quando o destino do `router.push`/`replace` é o próprio `pathname`
pegaria a classe inteira e dispensaria esta vigilância. Teria de nascer pelo protocolo D5
(`eslint.config.*` é alvo do hook `protecao-config`).

**Registros técnicos (não bloqueiam):**
- **`/nova-versao` passo 4 está OBSOLETO:** as cópias 0950–0954 foram renumeradas para
  0210–0214 no merge da v5.4.0. O bloco tem um comentário `REMOVER na renumeração
  pós-v5.3` — a condição se cumpriu. Candidato a poda no ritual.
- **`financeiro/posicao-projetado.tsx` pode migrar** para o primitivo
  `slider-horizonte.tsx` quando aquela tela for tocada (migração incremental, como manda a
  skill `ui-design-system`). Hoje há duas cópias da mesma geometria.
- **`ehDuracaoCurta`** segue exportado e testado, mas **sem consumidor de UI** depois da
  decisão 4 — mantido porque encoda um limiar documentado no ADR e volta de graça se a
  marca por linha for reintroduzida.
- **Pré-existente, não tocado:** o `LIMIT/OFFSET` da RPC vive no MESMO subselect da window
  function, sem `ORDER BY` próprio — a página depende da ordem de emissão do `WindowAgg`,
  que funciona na prática mas não é garantida pelo padrão. Vale para as 13 chaves, não só
  para a nova; mexer nisso é refactor de RPC fora do escopo.
- **Pré-existente, não tocado:** a lista exibe "Resultado Prev." como
  `entradas_total − saidas_total` (cliente), mas ordena por `d_resultado_caixa` (servidor)
  e deriva a Margem dele. Se as duas definições divergirem, coluna e ordenação discordam.
  Não investigado — fora do escopo.

---

## 8. Arquivos

**Criados:** `docs/adr/0162-margem-anualizada-linear-e-janela-fatiada.md`;
`src/lib/weddings/{margem-anualizada.ts,margem-anualizada.test.ts,janela-fluxo.ts,janela-fluxo.test.ts}`;
`src/components/weddings/{fluxo-caixa-card.tsx,fluxo-caixa-totais-card.tsx}`;
`src/components/shared/slider-horizonte.tsx`;
`supabase/migrations/0228_operacoes_weddings_sort_margem_aa.sql`;
`docs/briefings/briefing-v5-4-2-weddings-margem-fluxo.md`.

**Modificados:** `src/components/weddings/lista-operacoes.tsx`;
`src/components/performance/weddings-content.tsx`;
`src/app/api/dashboard/weddings/operacoes/route.ts`; `src/types/api.ts`;
`CHANGELOG.md`; `src/data/changelog-diretoria.ts`; `package.json`;
`docs/WORKING-CONTEXT.md`.

**Removidos:** `src/components/weddings/fluxo-caixa-mensal.tsx`;
`src/components/weddings/acumulado-receb-pag-chart.tsx`;
`src/app/performance/weddings/preview-fluxo-caixa/page.tsx` (rota do gate).
