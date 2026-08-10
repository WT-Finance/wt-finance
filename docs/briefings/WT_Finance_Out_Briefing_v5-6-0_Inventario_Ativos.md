# Out-Briefing v5.6.0 — Gestão de Pessoas: Inventário de Ativos

**Tipo:** MINOR · **Branch:** `feat/v5-6-0-inventario-patrimonio` · **Base:** `main` (v5.5.1)
**Migrations:** `0247` (estrutura) e `0248` (RPCs) — **aditivas, APLICADAS em 10/08**
**ADR:** **0167** — Razão append-only com estado derivado
**Briefing:** `docs/briefings/briefing-v5-6-0-inventario-patrimonio.md`
**Gates finais:** `build` OK · `tsc --noEmit` limpo · `lint` sem warnings · **879 testes**

---

## O que foi entregue

A empresa não sabia quem estava com o quê. Entrou o **Inventário de Ativos**, primeiro módulo da
seção nova **Gestão de Pessoas**: cadastro de máquinas e equipamentos com ficha patrimonial
documental, e um **razão append-only de movimentações** que responde "onde esteve, com quem, desde
quando e por quê". Cadastro 100% manual — não existe planilha a importar.

| Missão | Estado | Onde |
|---|---|---|
| **M0** mockups no DS (gate) | ✅ aprovada pelo Yan | `10bce7e` + ajustes em `645b859` |
| **M1** banco (schema + 10 RPCs) | ✅ 0247/0248 aplicadas; 60/60 na verificação REST | `939f4a2`, `23fd18f`, `62abb38` |
| **M2** seção + rota + permissão | ✅ | `7d2fd42` (+ a permissão já em `62abb38`) |
| **M3** ativos: lista/ficha/cadastro | ✅ | `ea10c85` |
| **M4** movimentação + razão | ✅ | `ea10c85` |
| **M5** visão geral + export | ✅ | `a675659` |
| **M6** fechamento | ✅ | este documento |

### Por que M3 e M4 viraram juntas

Não foi economia de esforço: a transição fixture→RPC é **atômica**. Com a lista lendo o banco, o
modal de movimentação não teria mais estado local em que escrever — entregar a M3 sozinha deixaria
o botão "Registrar movimentação" quebrado num commit. O briefing já colocava as duas na **mesma
fronteira de fase** ("build + test após M4"), então a junção respeita a estrutura de gates dele.

---

## Modelo de dados (o que o ADR-0167 fixa)

- **`patrimonio.ativo` guarda só identidade e ficha.** Não tem `area_id`, não tem `detentor_id`,
  não tem `status`. Área, detentor e status saem da **última movimentação**
  (`DISTINCT ON (ativo_id) ORDER BY data_movimentacao DESC, criado_em DESC, id DESC`).
- **A origem não é armazenada** — é o destino da anterior na cadeia, montada na leitura. Gravada
  como snapshot, uma movimentação retroativa a faria mentir.
- **`atualizar_ativo` recusa localização** (`LOCALIZACAO_IMUTAVEL`), e no formulário de edição os
  campos de área e detentor **não são renderizados**.
- **Ativo pode nascer em estoque** (decisão do Yan, 10/08): cadastro **com** detentor → em uso;
  **sem** detentor → em estoque. Único tipo que ramifica.
- **`reativacao` existe para não criar deadlock**: baixa registrada por engano se desfaz por
  registro novo, nunca por `DELETE`.
- **Detentor é tabela** (agregação "o que a Maria tem?"); **local e terceiro** são texto livre com
  datalist. Detentor **sem vínculo** com usuário da plataforma (volta aditiva:
  `ADD COLUMN usuario_id uuid NULL`).
- **Área = departamento administrativo**, não os setores Trips/Weddings/Corporativo.
- **"Custo histórico de aquisição"**, nunca "valor imobilizado". Ativo sem valor **não vira zero**:
  fica fora do somatório, é contado à parte, e sai com célula **vazia** no CSV.

---

## As três redes novas (o que passa a reprovar sozinho)

### 1. Varredura de navegação — `src/components/layout/nav-model.test.ts` (56 casos)

A invariante 12 do briefing pedia "checklist de regressão em cada rota existente antes do PR da
M2", porque mexer na navegação raiz afeta TODAS as páginas (lição da v3.2). **Checklist em prosa é
verificado uma vez e envelhece** — e enquanto o modelo de navegação morava dentro de
`sidebar.tsx` (`'use client'`, importa `next/image`), nenhum teste do ambiente `node` conseguia
lê-lo.

O modelo saiu para `nav-model.ts` (dados + predicados puros, movimento sem alteração de
comportamento) e a varredura virou teste. Ela lê o inventário de rotas **do disco**
(`src/app/**/page.tsx`) e cobra:

- rota protegida **órfã da sidebar** — ou declarada em `FORA_DA_SIDEBAR` **com motivo** (o campo
  obrigatório é o que força a próxima versão a decidir em vez de esquecer);
- href de sidebar apontando para **rota inexistente**;
- rota acendendo **dois** itens de 1º nível, ou **nenhum** (colisão de prefixo entre seções);
- a paridade **"quem VÊ o item ALCANÇA a rota"**: a visibilidade do item tem de ser subconjunto de
  `areasDaRota`. É a "quarta ponta" que esta versão já pagou uma vez na M1.

Mais duas sondas de fonte, para o que não tem DOM neste ambiente: desktop e drawer mobile montam o
**mesmo** `SidebarContent`, e as três abas do Inventário seguem o molde pedido (sempre montadas,
alternando por `hidden`, com `role=tablist/tab/tabpanel`).

**Verificada adversarialmente:** removida uma entrada da whitelist, reprovou apontando a rota
órfã; restaurada, voltou a passar.

### 2. Paridade SQL↔TS — `paridade-sql.test.ts` (18 casos)

O contrato "tipo → destino/status" existe **duas vezes de propósito**: no banco (CHECK
`mov_destino_por_tipo` + `patrimonio.status_derivado`) e no cliente (`DESTINO_POR_TIPO`/
`STATUS_POR_TIPO`, que decidem quais campos o modal mostra). Os dois arquivos diziam "as duas
pontas mudam JUNTAS" — **em comentário**.

Agora o teste lê o SQL aplicado e compara: os três enums, a exigência de cada campo de destino nos
oito tipos, o mapa de status derivado, e o **`ELSE false`** do CHECK. Este último é a parte que
engana: `CASE` sem `ELSE` devolve NULL para um valor não previsto, e **CHECK que avalia NULL é
considerado satisfeito** — acrescentar um valor ao enum sem escrever o ramo seria fail-**open**.

### 3. Contrato resumo × lista — `rpc-contrato.test.ts` (4 casos, rodam online)

A faixa de contagens (`patrimonio_resumo`) e a tabela (`patrimonio_listar_ativos`) aparecem na
**mesma tela** e derivam o estado por caminhos SQL diferentes. A igualdade virou caso de contrato,
inclusive "as cinco situações **fecham** o total" — que foi o motivo de "Emprestados" ter entrado
na faixa (o briefing não a listava e a soma não batia). Verificado que os casos **não auto-skipam**
(4 passed, 92 skipped ao filtrar por nome).

---

## Verificação ponta a ponta (fora do `npm test`)

Bateria de **71 checagens via REST + `service_role`** — o único caminho que **executa o corpo** da
RPC (`db query` roda num papel sem JWT, então `exigir_acesso` nega antes do corpo e mascara erro de
runtime; foi assim que a v5.2.1 mandou `max(uuid)` para produção).

O que ela cobriu, e que nenhum gate pega:

- os **nomes de parâmetro** de toda server action existem nas RPCs (um nome errado daria PGRST202
  só em runtime);
- os **schemas Zod validam o retorno POPULADO** — o risco de drift real (precedente
  `passageiros_raw`, v4.12.1);
- os **8 tipos em sequência**, com o status derivado conferido a cada passo, nas duas pontas
  (retorno da RPC e a lista);
- **retroativa** entrando no meio da cadeia sem mexer no estado atual;
- travas de **baixa/reativação** e a recusa de segunda abertura;
- **CHECK por tipo** recusando destino incoerente, e ano digitado errado respondendo
  `DATA_INVALIDA` (não a mensagem do CHECK — a armadilha do `GET STACKED DIAGNOSTICS` da M1);
- **`resumo` × agregação da lista** batendo ao centavo;
- os filtros e a busca (inclusive achar ativo pelo nome de quem está com ele).

**71/71, 0 falhas.** Dados de teste **removidos** e a limpeza verificada: base de volta a
**0 ativos / 0 movimentações / 0 detentores**, seed intacto (6 categorias, 7 áreas) e sequência
reiniciada — **o primeiro ativo real será o WG-0001**.

O script vive fora do repo (`$CLAUDE_JOB_DIR/tmp/smoke-m3-m4.ts`) e é reexecutável; a limpeza é
parte da bateria, não opcional:

```sql
DELETE FROM patrimonio.movimentacao WHERE ativo_id IN (SELECT id FROM patrimonio.ativo WHERE codigo LIKE 'ZZM3%');
DELETE FROM patrimonio.ativo    WHERE codigo LIKE 'ZZM3%';
DELETE FROM patrimonio.detentor WHERE nome   LIKE 'ZZM3%';
ALTER SEQUENCE patrimonio.ativo_codigo_seq RESTART WITH 1;
```

⚠️ `npx supabase db query` cai no banco **LOCAL** por padrão: é preciso `--linked`.

---

## Parecer da revisão

Ambos os revisores: **0 CRÍTICO, 0 ALTO**.

### `revisor` — APROVADO COM RESSALVAS

**MÉDIO — `resolverDetentor` fora da transação (registrado, não corrigido).** Cadastrar um ativo
com pessoa inédita faz `upsert_detentor` commitar antes de `criar_ativo`. Se a criação falhar
depois (rede, código duplicado por corrida entre duas abas, timeout), o nome fica em
`patrimonio.detentor` sem ativo nenhum e passa a aparecer no datalist. **Consequência real baixa**
— é um rótulo, o próximo upsert do mesmo nome o reaproveita, e o razão continua íntegro. O fix
definitivo exigiria uma RPC nova que aceitasse o nome bruto e fizesse o upsert na mesma transação;
não vale uma migration por isso agora. **Fica como dívida conhecida.**

**BAIXO — corrigidos** (`e877fb8`): comparação de nome de detentor era **crua**, e o
`upsert_detentor` é idempotente por nome **normalizado** — digitar "ana  beatriz" com a Ana Beatriz
já cadastrada mostrava "será cadastrada como pessoa nova", aviso falso. Novo `mesmoNome()` espelha
`app.norm_nome`. Também corrigido o comentário do `carregar.ts` que citava `unwrapRpc` sem
importá-lo.

**Fora de escopo, confirmado pelo revisor** (não é regressão desta versão): ausência de
`<form onSubmit>` nos modais com rodapé fixo e ausência de navegação por seta no `tablist` seguem
a convenção vigente — **os moldes que o briefing mandou copiar têm a mesma ausência**
(`acessos-content.tsx`, `modal-nova-solicitacao.tsx`, `editor-dre.tsx`). Candidatos a virar receita
documentada na skill `ui-design-system` quando alguém tocar o `ModalCentral`.

### `revisor-db` — APROVADO COM RESSALVAS

**MÉDIO — corrigido** (`e877fb8`): a extração do CHECK no `paridade-sql.test.ts` não delimitava o
**último** ramo do CASE (o lookahead só fechava em `WHEN '`), então o predicado de `baixa` engolia
o `ELSE false`. Inofensivo hoje, mas passaria a comparar predicado contaminado no dia em que o CASE
fosse reordenado — o oposto do que a suíte promete. Lookahead fecha em `ELSE` também, e um caso novo
cobra que nenhum ramo capture texto de fora.

**MÉDIO — corrigido** (`e877fb8`): o teste de paridade aponta para `0247`/`0248` por **nome de
arquivo**. Como migration aplicada não se edita, uma mudança futura no CHECK ou no
`status_derivado` viria numa migration nova e o teste seguiria aprovando um espelho obsoleto. Aviso
de manutenção explícito no topo do arquivo — é a única parte desta rede que não se atualiza sozinha.

**BAIXO — corrigidos** (`e877fb8`): `CODIGO_ESGOTADO`, `USUARIO_INATIVO` e os CHECKs de coluna
alcançáveis pela UI (valor negativo pela máscara de moeda, ano errado na data de aquisição) não
tinham tradução; e o caminho genérico de `traduzirErro` **não logava nada** — erro não previsto
virava "tente novamente" na tela e nada no log, sem ponto de partida para diagnóstico. Agora emite
`console.error` com a mensagem crua.

**BAIXO — registrado, não corrigido:** `patrimonio_listar_ativos` e `patrimonio_resumo` recomputam
cada uma a sua varredura de `v_estado_atual` por carregamento da página. No volume declarado
(centenas de ativos, milhares de movimentações) é da ordem de milissegundos, longe do teto de 8s do
`authenticated`. Observação para quando o parque crescer.

**Reavaliação da ressalva da M1 (FKs sem índice dedicado):** o revisor-db confirmou que **não está
doendo** — `area_destino_id`/`detentor_destino_id` só são filtradas depois de já reduzidas a uma
linha por ativo (via `v_estado_atual`, que usa `mov_ativo_ordem_idx`), ou como lado de probe contra
tabelas de dimensão minúsculas. Candidato a índice só se uma RPC futura filtrar o razão bruto por
área ou detentor.

---

## Conferência visual — **NÃO VERIFICADA** (declarado)

**Não foi possível verificar a UI autenticada nesta sessão.** O motivo é ambiental, não uma escolha:

- o **MCP Playwright não está conectado** nesta sessão, então o `verificador-visual` não tem como
  navegar (memória da v5.3.3: ele volta "NÃO VERIFICADO");
- pelo MCP do Chrome, o browser roda no Windows e **não alcança o `localhost` do WSL2**; e **não há
  sessão do Janus** nesse browser — o agente não digita credenciais.

**O que foi verificado automaticamente** (dev server em pé, `curl`):

- `/gestao-pessoas/inventario` sem sessão → **307 para `/login?next=%2Fgestao-pessoas%2Finventario`**
  — o guard da rota nova funciona igual às existentes;
- `/executiva`, `/financeiro/dre`, `/metas`, `/admin/acessos` → todas 307 para `/login` com o `next`
  correto (**nenhuma regressão de navegação** no nível do proxy);
- `/login` → 200; **log do dev sem nenhum erro** de compilação.

**O que fica dependendo do Yan** (o modelo que funciona: entregar → print → ajustar, v5.4.1):
render das quatro telas autenticadas, a sidebar com a seção nova ao lado das existentes, e o estado
de **base vazia** (a tela nasce com 0 ativos — os empty states das três abas nunca foram vistos com
dado real vazio, só no fixture).

---

## Pendências para o Yan

1. **Mergear o PR** (é a única fronteira de entrada em produção — nunca mergeio nem deployo).
2. **Cadastrar 3–5 ativos reais e movimentar cada um** — o primeiro será o **WG-0001**.
3. **Inserir uma movimentação com data anterior à última** e confirmar que o detentor atual e as
   origens da timeline se recalculam sozinhos.
4. **Confirmar que o formulário de edição não permite mudar área/detentor** (os campos não devem
   nem existir lá).
5. **Conferir o rótulo "Custo histórico de aquisição"** e o tooltip.
6. **Abrir cada rota existente da plataforma** e confirmar que a navegação não regrediu (o teste
   cobre o modelo; o olho cobre o render).
7. **Conferir os dois CSVs no Excel** — acento, separador e o valor como número.
8. **Liberar a área `gestao-pessoas/inventario`** para quem precisa: o seed da 0247 concedeu apenas
   a quem já tinha `admin/acessos`. O restante sai pelo editor de roles.
9. **Print das quatro telas** para fechar a conferência visual (ver seção acima).

---

## Aprendizado — régua de 5 destinos

| O que a versão revelou | Destino | Onde ficou |
|---|---|---|
| Contrato duplicado entre SQL e TS não se protege com comentário | **1 · enforcement** | `paridade-sql.test.ts` |
| Checklist de regressão de navegação em prosa envelhece | **1 · enforcement** | `nav-model.test.ts` |
| Dois números vizinhos na tela precisam concordar | **1 · enforcement** | caso de contrato (padrão já existente na skill) |
| `CASE` sem `ELSE` num CHECK é **fail-OPEN** (CHECK que avalia NULL é satisfeito) | **4 · skill** | `banco-e-rpc` |
| Modelo de UI dentro de componente `'use client'` é intestável em ambiente `node` | **4 · skill** | `react-padroes` |
| Modal de formulário reaproveitado entre itens precisa de `key` que mude | **4 · skill** | `react-padroes` |
| Guard de resposta atrasada tem de comparar com o último **pedido**, não com o estado atual | **4 · skill** | `react-padroes` |
| Export para Excel pt-BR: BOM + `;` + vírgula decimal + guarda de fórmula | **4 · skill** | `ui-design-system` (ou skill nova de export, se houver um segundo caso) |

**Nada foi para o core** (`CLAUDE.md`): nenhum dos itens é ao mesmo tempo permanente, transversal e
necessário a TODA sessão — os quatro primeiros já viraram máquina, e os demais são situacionais.
O core segue no teto.

**Convenção de banco não mudou** ⇒ a nota cruzada D-12 (atualizar `banco-e-rpc` **e** o checklist
inline do `revisor-db` juntos) não se aplica a esta versão, com uma exceção: o item do
`CASE`/`ELSE` acima é **convenção de banco nova** e deve entrar nos dois lugares.

---

## Arquivos

**Novos:** `src/components/layout/nav-model.ts`, `nav-model.test.ts` ·
`src/lib/patrimonio/{rpc-patrimonio,carregar,csv}.ts` ·
`src/app/gestao-pessoas/inventario/actions.ts` ·
`src/components/gestao-pessoas/inventario/{ativo-form-modal.tsx,exportar.ts,exportar.test.ts,paridade-sql.test.ts}` ·
`docs/adr/0167-razao-append-only-com-estado-derivado.md`

**Alterados:** `src/components/layout/{sidebar,nav-group}.tsx` · `src/lib/schemas-rpc.ts` ·
`src/lib/rpc-contrato.test.ts` · `src/app/gestao-pessoas/inventario/page.tsx` ·
`src/components/gestao-pessoas/inventario/{inventario-content,ativos-tab,movimentacoes-tab,visao-geral-tab,ficha-drawer,movimentacao-modal}.tsx` ·
`{derivar,tipos}.ts` · `derivar.test.ts` · `CHANGELOG.md` · `src/data/changelog-diretoria.ts` ·
`package.json` · `docs/WORKING-CONTEXT.md`

**Removido:** `src/components/gestao-pessoas/inventario/fixture.ts` (a tela deixou o mockup).
