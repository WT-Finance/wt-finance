# Out-briefing v5.4.4 — Metas por subsetor de Weddings

- **Branch:** `feat/v5-4-4-metas-subsetor-weddings` · **base:** `977c97a` (v5.4.3 mergeada)
- **Briefing de entrada:** `docs/briefings/briefing-v5-4-4-metas-subsetor-weddings.md`
- **ADR:** `docs/adr/0163-meta-de-subsetor-e-mix-de-produto.md`
- **Migrations:** `0233_metas_subsetor.sql`, `0234_sumario_subsetor_nao_classificados.sql` —
  ADITIVAS, **APLICADAS e verificadas por REST**
- **Gates:** `tsc`, `lint`, `build` limpos · **723 testes, 46 arquivos, zero SKIPPED**
- **27 arquivos**, +3.453 / −169

## 1. O que entrou

**`/metas`.** Trips e Corporativo em duas colunas; Weddings desceu para faixa full-width com
chevron. A expansão traz os 5 cards de subsetor no padrão Metas (faturamento · "% da meta" ·
"Meta:" · "% esperado" · barra · Receita · Margem vs alvo) e, abaixo deles, o **6º card "Não Classificados"** — recolhível, com a lista de produtos fora do mapa. COMERCIAL é variante: o ritmo de
**contratos** governa métrica grande, percentuais e barra; o faturamento dele desce para as
linhas de baixo.

**`/metas/cadastro`.** Segundo quadro — Comercial com 3 colunas (Contratos, Faturamento, % Rec),
os outros 4 com 2, mais Total — com coluna Mês fixa e scroll horizontal. A coluna Weddings do
quadro de cima virou travada e mostra a soma **ao vivo** do que se digita embaixo.

**Banco.** `app.meta_subsetor` + histórico + `metas_subsetor_listar`/`metas_subsetor_upsert`;
wrapper `metas_sumario_subsetor`; `produtos_nao_classificados` acrescentado ao payload do núcleo
já existente; trava de `metas_upsert` contra Weddings.

## 2. Decisões de produto (todas do Yan, na sessão de chat)

Meta de subsetor é **mix de produto**, não de equipe · Weddings **derivada** da soma · Comercial
com **duas metas** (contratos manda na barra, R$ compõe a soma) · subsetores com Faturamento **e**
% Rec · 6º card "Não Classificados" **recolhível, como lista de produtos**. Detalhe e alternativas
descartadas no ADR-0163.

**Rampa (default recomendado, não contestado):** mês com ≥1 linha de subsetor usa a soma; mês sem
nenhuma mantém a linha antiga de `app.meta_setor`. Existe porque havia R$ 23,8 Mi de metas de
Weddings para 2026 e o Group é a soma dos três setores — travar sem rampa derrubaria o card de
cabeçalho da tela.

## 3. Medições que mudaram o desenho

| Período | Weddings (Monde) | Soma dos 5 (upload) | Δ |
|---|---|---|---|
| Ago/2026 (mês corrente) | 48.144,44 | 48.144,44 | **0,00** |
| Jul/2026 | 2.154.633,82 | 1.743.694,79 | **19,1%** |
| Ano 2026 | 10.915.158,83 | 10.363.739,15 | **5,1%** |

O balde `NÃO_CLASSIFICADO` é **estrutural**: não-nulo em 26 dos últimos 48 meses, R$ 382.763,15
acumulados desde fev/2023; maior mês abr/2024 (R$ 105.550,25). Em 2026 são 4 produtos, R$ 72.717,41,
com receita **−37.339,05** vinda de um único produto (`G - WelConnect - Colômbia AGO2026`).

## 4. Erros meus que a auditoria pegou (registrados porque a lição é o valor)

1. **A derivação no lugar errado.** O briefing dizia que a rampa moraria em `metasDoSetor`. Ali
   estaria **errado**: o ramo `'todos'` (Group) soma todas as linhas sem olhar setor, então o card
   de Weddings mostraria a soma e o Group a linha crua — dois números discordando na mesma tela.
   Corrigido antes de codar: a rampa age uma vez sobre as linhas, antes dos painéis.
2. **Premissa falsa sobre o `.passthrough()`.** Justifiquei a chave nova no payload dizendo que os
   schemas toleram campo extra. Verdade para o arquivo, **irrelevante para esta RPC**: ela não tinha
   schema nenhum, e os 3 consumidores faziam cast bruto. A conclusão se sustentava por outro motivo.
3. **Case-sensitivity do mapa.** Afirmei que produto escapava por grafia. O join é sobre
   `produto_normalizado` (`UPPER(TRIM(...))`) — a causa é **nome novo**, e isso é pior, porque o
   namespace de produto é aberto.
4. **Mutação de teste que não pegou.** A primeira tentativa de ver o guard da lista canônica
   reprovando não alterou o arquivo (quebra de linha no meio da string procurada) e o teste passou.
   Refeito até reprovar de verdade. **Guard que nunca falhou não é guard.**
5. **Troquei o que o Yan pediu por um reuso.** Ele pediu, com essas palavras, um **"6º card** como
   Não Classificados abaixo dos outros 5 e recolhível com chevron". Na delegação da missão de UI eu
   instruí "adote o tratamento visual que já existe para este balde em `sumario-subsetor.tsx`:
   **linha própria em tom de warning**" — e saiu uma faixa `bg-warning-bg`, não um card. O
   subagente cumpriu a minha instrução; o desvio foi meu. **"Adotar > construir" vale para
   MECANISMO, não para a forma que o usuário especificou:** reuso de visual não é licença para
   trocar o substantivo do pedido. Ele cobrou depois do PR aberto e foi corrigido — agora é um
   `<Card>` irmão dos outros cinco, abaixo deles, com a lista dentro da cortina e **sem** "% da
   meta"/barra, porque não se cadastra meta para "não classificado".

## 4b. Conferência visual do Yan (1ª rodada) — a divergência de fonte não podia ficar só no "?"

O Yan abriu a expansão e perguntou onde estava o card de "Não Classificados". **Ele estava
correto em não aparecer:** em agosto/2026 não há nenhum produto fora do mapa
(`produtos_nao_classificados` volta `[]` e o balde não existe no período).

Mas o print expôs o que o tooltip não estava segurando:

```
Weddings (Monde)        R$ 80.696,38
5 subsetores (upload)   R$ 48.144,44
não classificados       R$      0,00
diferença               R$ 32.551,94   ← 40% do número, sem nada na tela explicando
```

**A mesma medição, no mesmo dia, deu 0,00 pela manhã.** Entraram vendas no Monde que o upload
ainda não tinha. Ou seja: a divergência de fonte do §3.1 **não é estável nem pequena**, e eu a
havia deixado apenas na ajuda "?" do cabeçalho — insuficiente. Quem olha vê cinco cards somando
48,1 k embaixo de um card de 80,7 k e conclui, com razão, que a tela está errada.

**Acrescentado:** o bloco **"Como isto soma"** ao pé da expansão, nomeando as parcelas —
`soma dos subsetores + não classificados + defasagem entre as fontes = Weddings`. Ele **só
aparece quando há diferença material** (≥ R$ 1): quando as fontes concordam, a ausência do bloco
já significa "os cards somam o setor". A conta vive em `decomporFaturamentoWeddings`
(`metas-derivadas.ts`), com caso de contrato sobre os números REAIS dos dois momentos do dia 04/08
— uma reconciliação que não reconcilia seria pior que nenhuma. Quando o Scope B concluir, a
parcela de defasagem vai a zero e o bloco para de aparecer sozinho, sem código a remover.

**Também exposto:** o selo "Última atualização" do topo é do **Monde**, não do upload — então os
números de subsetor podem estar arbitrariamente velhos sem nenhuma indicação própria. Está dito no
"?" do bloco novo; um selo de frescor do upload é candidato para outra versão.

## 4c. Erro de FATO corrigido: o espelho do Monde JÁ tem granularidade de item

O Yan perguntou por que os cards de subsetor são alimentados pelo upload e não pela API. Ao
verificar em vez de responder de memória, descobri que **eu havia afirmado uma coisa falsa** no
briefing e no ADR: que "o espelho do Monde ainda não tem granularidade de item". Vinha das notas
antigas do Scope B e nunca foi conferida.

**A realidade:** `monde.venda_item` existe desde a `0178` e está populada —
**47.150 itens / 28.498 vendas, de 02/01/2023 a 04/08/2026** (`monde_ingest_status()`), com
`produto`, `valor_total`, `receitas` e `status` (`active`/`canceled`, que a versão do upload nem
tem); `monde.venda` tem `setor_macro` e `data_venda`. **Todo** insumo da RPC de subsetor existe no
espelho.

**O que realmente falta é o DE-PARA, e isso é curadoria, não código.** O espelho guarda
`produto = item.description` — texto livre por item (`transform.ts:116`; o fixture mostra
`description: 'Hotel Single'`) — e `product_kind` (`'hotels'`) numa coluna separada. O mapa
`dim_produto_subsetor` tem **21 linhas com as CATEGORIAS do upload** ("Diárias de Hospedagem",
"Contrato de Casamento"). Vocabulários diferentes, e **nenhum de-para `product_kind` → subsetor
existe no repo** (grep: `product_kind` só aparece no DDL e no transform). Repontar sem construí-lo
faria o LEFT JOIN falhar e **todo o faturamento de Weddings cair em "Não Classificados"** — o pior
resultado possível, e silencioso do ponto de vista de build/teste.

**Medição que decide o tamanho do trabalho, ainda não feita:** quantos `product_kind`/`description`
distintos existem em `monde.venda_item` para `setor_macro = 'Weddings'`. É uma consulta só; o schema
`monde` não é exposto no REST, então precisa de acesso direto ao banco ou de uma RPC de diagnóstico.
**É o próximo passo do Scope B.**

**A decisão da versão não muda** — e passa a ter um motivo mais forte que a frase errada: o núcleo
é **compartilhado com a tela de Performance**. Repontá-lo muda os números de subsetor lá também, e
mudança de DADO em tela existente é escopo do Scope B, com validação de quem conhece o negócio, não
de um patch de Metas.

Corrigido em três lugares (errata explícita, sem reescrever a história): ADR-0163 §Decisão 4,
briefing de entrada §5 e a fila do Scope B no WORKING-CONTEXT.

## 4d. A medição do de-para, feita (insumo do Scope B, não desta versão)

O §4c dizia que faltava contar os `product_kind`. Contado, via `SELECT` read-only pelo
`SUPABASE_DB_URL` (o cliente `pg` já está no `node_modules`; nenhuma dependência nova, nenhuma
migration). Weddings, **itens ativos**, todo o histórico do espelho:

| `product_kind` | itens | descrições | faturamento |
|---|---|---|---|
| `hotels` | 4.454 | 154 | 29.639.574,09 |
| `others` | 2.137 | 17 | 23.925.263,37 |
| `airline_tickets` | 490 | 1 | 2.672.213,19 |
| `operations` | 74 | 6 | 156.468,35 |
| `travel_packages` | 24 | 10 | 113.775,34 |
| `insurances` | 496 | 1 | 96.390,66 |
| `car_rentals` | 12 | 1 | 21.825,87 |

**São 7 `product_kind` e 190 descrições** — 7.687 itens, R$ 56.625.510,87.

**Repontar hoje, com o mapa atual, casaria só 46% do faturamento** (3.072 de 7.687 itens;
R$ 26,06 Mi de R$ 56,63 Mi). Ou seja: 54% cairia em "Não Classificados". Isso confirma com número
o risco descrito no §4c.

**O de-para não é sobre as 190 descrições — é sobre 7 kinds + ~22 descrições.** As 154 descrições
de `hotels` são nomes de hotel; elas se resolvem por **KIND**, não por descrição:

- `hotels` → CONVIDADOS – Hospedagens · `airline_tickets`, `insurances`, `car_rentals` →
  CONVIDADOS – Extras. **Quatro regras cobrem R$ 32,4 Mi (57%).**
- A curadoria de verdade está em `others`/`operations`/`travel_packages`: **33 descrições**, das
  quais **11 já casam** com o mapa atual (Extras Casamento → PRODUÇÃO, Pacote de Casamento →
  PLANEJAMENTO, Contrato de casamento → COMERCIAL, Receptivo, Transporte Rodoviario, Taxa de
  Serviço, Cerimonial, Ingressos, Passes de Trem, Bagagens ou assentos) e **~22 precisam de
  decisão** — as maiores: `Bloqueio Hospedagem` (469.040,30), `Evento` (100.295,25),
  `Catamarã Privativo` (61.940,19), `Atualização de Contrato de Casamento` (54.864,00) e os quatro
  `G - WelConnect - *` (~155 k).

**Dois quase-acertos que vazariam em silêncio** e que valem regra de normalização, não linha nova:

- `Atualização de Contrato de Casamento` (Monde) × **`Atualização de Contrato`** (mapa);
- `Contrato de casamento - venda online` (Monde) × **`Contrato de casamento`** (mapa).

**Higiene de dado observada:** existe descrição com **espaço à esquerda** (` Dominican Snack`) — o
join já usa `TRIM`, então não quebra, mas indica entrada livre no Monde. E `operations` contém
produto por evento (`W - Joana e Daniel - 22FEV25`), o que confirma que o namespace é **aberto por
construção**: qualquer de-para por descrição precisa de uma regra de fallback por `product_kind`,
nunca só de uma lista.

**Nada disso entra na v5.4.4** — é insumo para o Scope B/v5.4.5, e a decisão de classificação de
cada uma das ~22 é de negócio.

## 5. Parecer da revisão

### `revisor-db` — APROVADAS (0 CRÍTICO / 0 ALTO), aplicar 0233 → 0234

Conferiu **por conta própria** a premissa mais perigosa da versão: comparou o corpo da `0099`
instrução por instrução com o corpo novo e confirmou que a `0121` só renomeou e a `0122` só mexeu
em grants — o `CREATE OR REPLACE` **não reverte** mudança de produção. Também provou a invariante
da lista pelo lado estrutural: `subsetor_detalhado` é `NOT NULL` na tabela-mapa (`0071`), logo só é
nulo quando o LEFT JOIN não casa; as duas consultas selecionam as mesmas linhas.

Três MÉDIO, todos **endereçados**:

- **`v_mes`/`v_ano` sem guard `IS NULL`** — mesma família do furo que minha auto-auditoria pegou em
  `v_subsetor`. Corrigido nas duas RPCs. A lacuna vinha do molde da `0175` e seria **preservada**
  pelo `CREATE OR REPLACE`; como a função já estava sendo reescrita, as irmãs ficaram com a mesma
  régua. Caso de contrato prova (`METAS_MES_INVALIDO: <NULL>`).
- **Dois caminhos de escrita em `app.meta_setor`** — `inserir_metas` (`service_role`, usada pelo
  seed) não passa pela trava. Registrado no ADR-0163 como assimetria conhecida; nenhum usuário da
  UI alcança aquele caminho.
- **Schemas novos sem caso de contrato** — criados (§6).

BAIXO registrados: `UNIQUE` sem `fonte` (herdado do irmão, hoje dormente) · 4ª varredura de
`fato_venda_item` por chamada · `VOLATILE` vs `STABLE` (cada um copia o molde correto).

### `revisor` — CORREÇÕES NECESSÁRIAS → todas feitas

**CRÍTICO, real e no caminho de uso central.** Os dois quadros do Cadastro têm Salvar próprio e as
duas Server Actions chamam `revalidatePath` + `router.refresh()`. O refresh reexecuta o Server
Component, que refaz as duas RPCs e entrega arrays **novos** aos dois quadros — inclusive ao que
não mudou de conteúdo. Como a re-hidratação era disparada pela **referência** do array, salvar o
quadro A resetava o estado de B: a digitação não salva de B desaparecia sem diálogo, sem toast e
sem undo, junto com o contador de pendências. E digitar nos dois antes de salvar **é** o uso
normal, porque a coluna Weddings mostra a soma ao vivo do quadro de baixo. O padrão era seguro no
quadro único; dois quadros o tornaram errado.

Corrigido nos três pontos: o gatilho passou a ser o **`ano`** (primitivo, só muda em navegação
real, já guardada por `confirm`), e quem zera as pendências passou a ser o **Salvar**, promovendo ao
baseline só as linhas que enviou — célula suja mas não persistável continua marcada, porque não foi
gravada. **Contrapartida aceita:** refresh de outra pessoa não traz mais dado novo para a grade
aberta; sobrescrever edição não salva é pior, e esta tela não tem trava otimista.

**ALTO:** `BotaoCortina` tinha alvo de toque de ~17–20px (só padding). Ganhou `min-h-6 min-w-6`
mantendo o tamanho visual do ícone.

**BAIXO:** `mesesDerivados` era código morto com comentário errado (dizia alimentar o Cadastro, que
na verdade deriva do próprio estado local). Removido do contrato.

Verificou sem achado, entre outros: nenhum caminho do app lê a meta de Weddings sem passar pela
rampa (`/metas`, `/metas/tv`, `/metas/comparacao`, `cadastro`); as classes produzidas por
`pecas-meta.tsx` na escala `normal` são **idênticas** às anteriores (comparado contra o checkout
raiz); toda `MetaProgressBar` dentro de cortina usa `mostrarTooltip={false}`; nenhum hex em classe
nem em `style`.

### `verificador-visual` — **NÃO EXECUTADO**

A sessão é de background: o MCP Playwright não sobe (lição da v5.3.3) e `/metas` responde
`307 → /login`; `BYPASS_AUTH` é resíduo morto. A via headless provada na v5.3.3 não alcança tela
autenticada. **A conferência é do Yan** — ver §8.

## 6. Guards mecânicos novos (todos vistos reprovando)

| Guard | Onde | Visto reprovando |
|---|---|---|
| `CHECK` da migration × `SUBSETOR_ORDER` | `metas-derivadas.test.ts` | `PRODUÇÃO`→`PRODUCAO` derruba, apontando o literal |
| Rampa nos dois ramos + virada por mês + mês zerado | `metas-derivadas.test.ts` | 8 casos |
| `Group == Trips + Weddings(derivada) + Corp` | `metas-derivadas.test.ts` | asserção explícita de que **não** é a soma da linha crua |
| `calcularRitmoAgregado` × `calcularRitmo` campo a campo | `ritmo.test.ts` | 4 cenários + agnosticismo de unidade |
| Σ `produtos_nao_classificados` == balde, ao centavo | `rpc-contrato.test.ts` | 3 períodos, banco real |
| Os dois wrappers devolvem payload idêntico | `rpc-contrato.test.ts` | reprova se alguém duplicar o corpo do núcleo |
| 5 travas de escrita + nada gravado | `rpc-contrato.test.ts` | ano 2099 |
| Gatilho de re-hidratação pelo `ano` | `cadastro-rehidratacao.test.ts` | reintroduzir o gatilho por referência derruba 2 casos |

**Sobre o último:** é teste de **fonte**, não de comportamento. A regressão vive no encadeamento de
estado do React e o projeto não tem `@testing-library/react` (vitest em ambiente `node`);
acrescentar a dependência é decisão de tooling, não de patch. Está documentado no próprio arquivo e
pode sair quando houver teste de componente.

## 7. Colisão entre sessões — migrations renumeradas

Ao conferir o pendente antes de aplicar, `migration list` mostrou `{"local":"","remote":"0232"}`:
migration **aplicada em produção que não existe no repo**. É a
`0232_monde_reconciliacao_e_tripwire.sql` da branch `fix/v5-4-5-reconciliacao-espelho` — uma
**v5.4.5 em curso em paralelo** que aplicou banco antes de mergear.

Conferi que ela **não colide**: cria/altera só `monde_vendas_ausentes`, `monde_ingest_claim`,
`monde_ingest_release` e `monde_ingest_status`. O único contato é `monde_ingest_status` (a tela de
Metas o lê para "Última atualização") e ela apenas **acrescenta** chaves — as duas consumidas
seguem lá, e a leitura é por cast solto.

Como nada meu estava aplicado, renumerei 0230/0231 → **0233/0234**, mantendo ordem aplicada ==
ordem numérica (mesmo remédio do percalço `0218`→`0220` da v5.4.0).

⚠️ **A sugestão que o CLI imprime nesse erro — `migration repair --status reverted 0232` — é
PERIGOSA:** marcaria como revertida uma migration aplicada, corrompendo o estado da v5.4.5.
O que destravou foi outra coisa, sem furar rede alguma: o backup-gate rodou **verde** (backup +
restore-test em 3 tabelas) e a pasta local passou a refletir o que o banco tem, com o arquivo real
da 0232 posto ali **temporariamente** e removido em seguida — ele **não** entrou em commit nenhum.

## 8. Pendências do Yan

1. **Conferência visual** — a mais importante desta versão, porque o layout de `/metas` mudou e o
   Cadastro ganhou um quadro. Olhar: a faixa de Weddings fechada e aberta; os 5 cards em telas
   estreitas (grid `sm:2 / lg:3 / xl:5`); o card de **Comercial** (métrica em contratos, faturamento
   na linha de baixo); o 6º card "Não Classificados" fechado e aberto; o quadro novo do Cadastro com
   scroll horizontal e Mês fixo; e a célula travada de Weddings mudando **ao vivo** ao digitar
   embaixo. Modelo que funcionou na v5.4.1: **entregar → print → ajustar**.
2. **Distribuir 2026** — enquanto um mês não tiver subsetor cadastrado, ele roda na rampa (meta
   antiga). A célula travada indica o regime de cada mês.
3. **Ordem de merge com a v5.4.5** — ao mergear esta, `main` fica com 0233/0234 e um **buraco no
   0232** até a branch da v5.4.5 entrar.
4. **As duas viagens WelConnect** (Colômbia e Mendoza) estão classificadas como Weddings **no nível
   de setor**, uma delas com receita de −R$ 37,3 mil. É um nível acima do subsetor; decisão sua.
5. **Modo TV** não recebeu os subsetores (fora do escopo — layout fixo 16:9 de parede).

## 9. Aprendizado — régua de 5 destinos

- **Enforcement mecânico (1):** os 8 guards do §6, incluindo dois de leitura de fonte/SQL. O da
  re-hidratação é candidato a virar regra de lint se o padrão "ajustar durante a renderização"
  aparecer em mais telas com dois formulários.
- **Skill de domínio (4):** `ui-design-system` §2.1 (Cortina) ganhou um caso vivo que vale
  registrar — **barra/tooltip `absolute` dentro de cortina é decapitado**, e a saída é
  `mostrarTooltip={false}` + a informação como texto. Vale também a nota do primitivo
  `shared/cortina.tsx` e o aviso de que `financeiro/collapsible-section.tsx` usa o padrão **errado**
  (desmonta no fechado) e não deve ser copiado.
- **Já coberto (2):** o contrato de payload do upsert (linha completa, não delta) está documentado
  no header da própria migration, onde quem for mexer vai ler.
- **Registro, não código (nada a mudar):** a manutenção do mapa produto→subsetor — produto novo
  entra em Weddings, sai dos subsetores e ninguém é avisado. Com meta por subsetor isso passa a
  parecer não-cumprimento. Caminho provável: tela de admin ou alerta de balde crescendo. **Outra
  versão.**

## 10. Fora do escopo (deliberado)

Modo TV · `/metas/comparacao` · ritmo diário por subsetor (não há fonte; colidiria com o Scope B) ·
manutenção do mapa produto→subsetor · reclassificação de setor das viagens WelConnect ·
`weddings-kpis-section.tsx` da Performance, que segue descartando o 6º balde (pré-existente,
declarado no ADR).
