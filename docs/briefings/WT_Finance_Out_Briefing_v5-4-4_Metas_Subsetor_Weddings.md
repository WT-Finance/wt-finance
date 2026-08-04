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
"Meta:" · "% esperado" · barra · Receita · Margem vs alvo) e, abaixo deles, a faixa aninhada
**"Não Classificados"** com a lista de produtos fora do mapa. COMERCIAL é variante: o ritmo de
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
   na linha de baixo); a faixa "Não Classificados" fechada e aberta; o quadro novo do Cadastro com
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
