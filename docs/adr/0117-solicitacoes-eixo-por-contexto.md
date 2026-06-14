# ADR-0117 — Solicitações: eixo de coluna por contexto + refinos v4.18

**Status:** Aceito (v4.18.0)
**Data:** 2026-06-14
**Relacionado:** ADR-0103 (paleta canônica; estendida aqui), ADR-0112/0113 (Solicitações v4.16)

## Contexto

A reformulação do módulo de Solicitações (pós-produção) pediu duas telas com **naturezas
diferentes**: a **Caixa de entrada** é a fila de trabalho do *destinatário* (o que ele precisa
resolver), e **Minhas solicitações** é o acompanhamento do *originador* (em que pé estão os
pedidos que abriu). Tratá-las com o mesmo layout perdia a intenção de cada uma.

## Decisão

**Eixo da coluna por contexto:**
- **Caixa de entrada → colunas por TIPO de solicitação.** Na fila do destinatário, o que importa
  é *de que tipo* é o pedido. Filtro de **status: Abertas / Concluídas** (substitui os antigos
  filtros de visão "mim e minha permissão / só a mim" — o usuário **sempre** vê mim + minha
  permissão; "Ver todas" é modo de supervisão à parte, só admin).
- **Minhas solicitações → colunas por STATUS** (Abertas / Concluídas / Rejeitadas). No
  acompanhamento do originador, o que importa é *em que pé* está cada pedido. Filtro
  **Ativas / Canceladas**.

**Integridade do ciclo de vida (não regride o dado):** `status` distingue
`aberta | concluida | rejeitada | cancelada` como valores persistidos distintos. A Caixa agrupa
visualmente concluídas + canceladas-pelo-originador sob "Concluídas" com a marca "Cancelada pelo
solicitante" — mas o **dado permanece `cancelada`** (não é regravado como `concluida`). É o que
permite ao relatório futuro distinguir canceladas × concluídas, tempo médio e autoria
(`decidido_em`/`decidido_por`); nenhuma coluna nova foi necessária (estrutura já pronta).

**Gestão (só admin) em âmbar:** "Ver todas" (supervisão — escopo de todas as solicitações) e
"Gerenciar solicitações" (tipos) usam o token semântico **`--gestao`** (#BA7517 / #FAEEDA / #633806),
distinto do `--warning` (status) e do dourado Weddings. **Estende o ADR-0103** (ver nota lá +
`PILL_GESTAO` em `botoes.ts`).

**Datas no fuso de São Paulo:** timestamps do banco são UTC; exibir por split de string mostrava a
hora UTC e errava o dia perto da meia-noite. Padronizado em `fmtDataSP`/`fmtDataHoraSP`
(`Intl.DateTimeFormat` + `timeZone: 'America/Sao_Paulo'`); `fmtDataHora` corrigido (converte
timestamptz; preserva datetime local ingênuo do CHANGELOG). Ver convenção no CLAUDE.md.

**Edição de nome (capacidade nova):** `admin_atualizar_nome` (migration 0138) — wrapper
`SECURITY DEFINER` + `exigir_acesso('admin/acessos')`, nome vazio rejeitado, sem anti-lockout
(não toca acesso). Reflete em todos os pontos de leitura do nome (tabela + sidebar).

## Alternativas consideradas
- **Mesmo eixo nas duas telas** (ambas por status, ou ambas por tipo): descartado — perde a
  intenção de cada papel (fila de trabalho vs acompanhamento).
- **Reusar `--warning` para os botões de gestão:** descartado — confunde STATUS (Pendente) com
  AÇÃO administrativa; se o warning mudasse de tom, a gestão mudaria junto. Token próprio.
- **Tabela de eventos (`solicitacao_evento`) para o histórico:** fora de escopo — o domínio não
  tem reabertura/reatribuição; o par `decidido_em`/`decidido_por` cobre o relatório futuro.

## Consequências
- Migrations 0138/0139 (aditivas). "Tipos de solicitação" saiu da sidebar (→ "Gerenciar
  solicitações"). Caixa de entrada virou a aba default. Nada do Fluxo de Caixa foi tocado.
