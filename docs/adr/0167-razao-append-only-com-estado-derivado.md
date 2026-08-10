# ADR-0167 — Inventário de Ativos: razão append-only com estado derivado

- **Status:** aceito
- **Data:** 2026-08-10
- **Versão:** v5.6.0 (Gestão de Pessoas · Inventário de Ativos)
- **Contexto:** schema `patrimonio` (migrations `0247`/`0248`), seção nova **Gestão de Pessoas**
  na navegação raiz, rota `/gestao-pessoas/inventario`. Registra o **modelo de dados** de um
  cadastro com histórico e as fronteiras conceituais que ele impõe.

## O problema

A empresa não sabia quem estava com o quê. A pergunta que o negócio faz não é "onde está este
notebook", é **"onde ele esteve, com quem, desde quando e por quê"** — e a segunda não se
responde com um cadastro que guarda só o estado presente.

O caminho óbvio (uma tabela de ativos com colunas `area_id`, `detentor_id`, `status`, mais uma
tabela de histórico ao lado) parece resolver e não resolve: cria **duas verdades** sobre o mesmo
fato. Basta uma movimentação retroativa — que é requisito, não exceção — para as colunas e a
cadeia discordarem, e a partir daí ninguém sabe qual das duas está certa.

## Decisão 1 — O razão é a fonte da verdade; o estado é DERIVADO

`patrimonio.ativo` guarda **só identidade e ficha** (código, categoria, descrição, série,
fornecedor, aquisição, valor, nota, conservação, observações). **Não tem** `area_id`, não tem
`detentor_id`, não tem `status`.

Área, detentor e status saem da ÚLTIMA movimentação:

```sql
DISTINCT ON (ativo_id) ... ORDER BY ativo_id, data_movimentacao DESC, criado_em DESC, id DESC
```

Nenhuma coluna espelho, nenhum cache "por performance". O terceiro critério de desempate (`id`)
não é decoração: duas linhas com a mesma data **e** o mesmo `criado_em` (inseridas na mesma
transação) escolheriam uma arbitrária a cada plano de execução.

**Consequência aceita:** todo estado custa uma leitura sobre o razão. No volume de um parque de
equipamentos (centenas de ativos) isso é milissegundos, e a correção vale mais.

## Decisão 2 — A ORIGEM de uma movimentação não é armazenada

A frase "Financeiro / João → Comercial / Maria" é montada **na leitura**: a origem de uma
movimentação é o **destino da anterior na cadeia**. Só o destino é gravado.

Isto é consequência direta de liberar movimentação retroativa. Se a origem fosse um snapshot
gravado, inserir uma movimentação com data anterior à última **garantiria** divergência entre a
coluna e a cadeia — o registro novo mudaria a origem real de quem veio depois, e o snapshot
antigo continuaria lá, mentindo. Derivada, a timeline inteira se reescreve sozinha.

A derivação tem **uma** implementação (`rotuloOrigem`, no cliente). A RPC `detalhe_ativo`
devolve o histórico em ordem cronológica e **não** calcula origem: calcular nos dois lugares
criaria duas versões da mesma frase.

## Decisão 3 — Localização muda SÓ por movimentação, e a trava é na RPC

`patrimonio_atualizar_ativo` recebe `p_area_destino_id` e `p_detentor_destino_id` **só para
recusá-los**, com erro nomeado (`LOCALIZACAO_IMUTAVEL`). Sem esses parâmetros, quem tentasse
mandar localização receberia "função não existe" — um erro que não ensina nada.

É aqui que **"movimentação ≠ correção de cadastro"** deixa de ser conceito e vira código. A UI
obedece na forma mais honesta: no formulário de edição os campos de área e detentor **não são
renderizados**. Não desabilitados, não escondidos — ausentes.

## Decisão 4 — Append-only, e a baixa se reverte por movimentação

Movimentação não se edita nem se deleta; **só `obs`** é editável (pelo diário genérico da
`0199`). Erro de destino se conserta com uma movimentação **nova**.

Isso criaria um deadlock: ativo baixado bloqueia novas movimentações, e uma baixa registrada por
engano não teria volta. Por isso existe o tipo **`reativacao`** — o caminho de retorno é um
registro explícito e auditável, nunca um `DELETE`. A RPC recusa qualquer outro tipo sobre ativo
baixado, e recusa `reativacao` sobre ativo que não está baixado.

## Decisão 5 — Todo ativo nasce com movimentação de abertura, na MESMA transação

`patrimonio_criar_ativo` insere o ativo e a movimentação `cadastro` no mesmo corpo: ou os dois
entram, ou nenhum. **Nunca existe ativo sem razão**, então o estado derivado é consistente desde
a primeira linha e "ativo sem movimentação" é um estado inalcançável (o `coalesce` que existe nas
RPCs é rede para não derrubar a tela, não um caminho previsto).

**Emenda do checkpoint (Yan, 10/08):** um ativo **pode nascer direto no estoque**. Isso quebrou
"status = função só do tipo" — o `cadastro` passou a ter dois desfechos. Resolvido derivando do
**mesmo registro**: cadastro **com** detentor → em uso; **sem** detentor → em estoque. A
alternativa (um tipo novo `cadastro_estoque`) duplicaria a abertura no enum e no CHECK sem ganhar
nada. O `cadastro` é o **único** tipo que ramifica.

## Decisão 6 — Detentor é tabela; local e terceiro são texto livre

Assimetria deliberada. **Pessoa vira tabela** (`patrimonio.detentor`, duas colunas: nome
normalizado único + `ativo`) porque exige agregação: "o que a Maria tem?" é pergunta real.
**Local e terceiro** (assistência técnica, sala) ficam em `destino_texto`, com datalist alimentado
pelos valores já usados — ninguém vai perguntar "quantos itens estão na assistência X". Se um dia
perguntar, promove-se.

**Detentor NÃO tem vínculo com usuário da plataforma.** A pessoa que detém um equipamento não é
necessariamente quem tem conta no Janus (e vice-versa). O caminho de volta é
`ADD COLUMN usuario_id uuid NULL` — puramente aditivo — se e quando Gestão de Pessoas crescer
para cadastro de colaboradores.

## Decisão 7 — Área é DEPARTAMENTO, não setor de negócio

`patrimonio.area` (Diretoria, Financeiro, Comercial, Operações, Marketing, Tecnologia, Gestão de
Pessoas) é departamento administrativo. **Não** é a taxonomia Trips/Weddings/Corporativo que
governa o resto da plataforma. O rótulo na UI é distinto de propósito ("Departamento
administrativo") para a colisão não acontecer na cabeça de quem lê — e a tabela leva `COMMENT`
dizendo isso, para quem chegar pelo banco.

## Decisão 8 — "Custo histórico de aquisição", nunca "valor imobilizado"

O KPI soma o valor de aquisição dos **não-baixados**. Não tem depreciação, não conversa com a
contabilidade e **nenhum número desta tela entra em DRE ou Fluxo de Caixa**. O rótulo diz
exatamente o que a conta é, e o tooltip repete.

**Ativo sem valor informado não vira zero:** fica fora do somatório e é contado à parte
(`sem_valor`), inclusive no CSV, onde a célula sai **vazia**. "Não sei quanto custou" e "custou
zero" são coisas diferentes, e a diferença tem de sobreviver à planilha.

## Decisão 9 — Seção nova na navegação raiz vem com varredura mecânica

A seção **Gestão de Pessoas** é o primeiro item novo de 1º nível desde a v4.x, e mexer na
navegação raiz afeta TODAS as páginas (lição da v3.2). O briefing pedia "checklist de regressão
em cada rota existente" — e checklist em prosa é verificado uma vez e envelhece.

Em vez disso, o modelo de navegação saiu de dentro do componente (`nav-model.ts`, dados e
predicados puros; `sidebar.tsx`/`nav-group.tsx` só renderizam) e a varredura virou teste
(`nav-model.test.ts`). Ele lê o inventário de rotas **do disco** e cobra quatro coisas: rota
protegida órfã da sidebar (ou declarada fora dela **com motivo**), href apontando para rota
inexistente, rota acendendo dois itens de 1º nível ou nenhum, e a paridade **"quem VÊ o item
ALCANÇA a rota"** (a visibilidade do item tem de ser subconjunto de `areasDaRota`).

Essa última é a "quarta ponta" que esta versão já pagou uma vez: declarar a área no código sem a
linha em `app.rbac_areas` reprova o teste de paridade banco↔app; e item visível com `requireArea`
exigindo outra área joga o usuário em `/sem-acesso` sem erro em nenhum gate.

## Decisão 10 — O contrato "tipo → destino/status" existe duas vezes, e a paridade é testada

O contrato vive no banco (CHECK `mov_destino_por_tipo` + `patrimonio.status_derivado`) **e** no
cliente (`DESTINO_POR_TIPO`/`STATUS_POR_TIPO`, que decidem quais campos o modal mostra). A
duplicação é intencional: o banco é a barreira, o cliente é a interface.

O que **não** é aceitável é a divergência silenciosa. `paridade-sql.test.ts` lê o SQL aplicado e
compara com o espelho em TS: os três enums, a exigência de cada campo de destino nos oito tipos,
e o mapa de status. Enquanto era comentário ("as duas pontas mudam JUNTAS"), nada reprovava.

O CHECK fecha em **`ELSE false`**, e isso é a parte que engana: `CASE` sem `ELSE` devolve NULL
para um valor não previsto, e **CHECK que avalia NULL é considerado satisfeito** — acrescentar um
valor ao enum sem escrever o ramo seria fail-**open**.

## Fora de escopo (registrado para não voltar como dúvida)

Depreciação, centro de custo e qualquer contabilização — a ficha **registra** valor e aquisição,
não calcula. Termo de responsabilidade, PDF e assinatura. Import de planilha (não existe base a
importar: o cadastro é 100% manual). QR code, etiquetas e leitor. Garantia, contratos e custos de
manutenção. Anexos e fotos. Permissão por área (gestor vendo só a própria) — a permissão é
**única de página**: quem edita a página cadastra e movimenta.
