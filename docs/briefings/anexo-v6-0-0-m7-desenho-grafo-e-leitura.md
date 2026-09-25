# Anexo v6.0.0 / M7 — grafo de carga, Welcome em todos os leitores, leitura

Briefing §5.F (grafo) e §5.G (leitura); contrato `docs/contratos/ingestao-v1.md` §2.3 passo 3,
§2.4 e §5. A missão foi partida em duas entregas com commit próprio:

- **M7a** — grafo (F) + Welcome em todos os leitores de `raw.vendas_excel` (migration 0283).
- **M7b** — leitura (G): mês parcial marcado e carimbo de carga.

## 1. Grafo (M7a)

`src/lib/ingestao/grafo.ts` declara as arestas do §5 como DADO:

```
vendas-produto ─┬─► lancamentos-movimentacao ─┬─► lancamentos-operacao
                └─► lancamentos-aberto ───────┘
demonstrativo-competencia  (independente)
```

**Só UMA aresta é bloqueante pelo contrato:** `lancamentos-operacao` exige carga de
`lancamentos-aberto` com `status = 'aplicada'` **no dia** — data de `concluido_em` no fuso de São
Paulo igual a `hojeSP()`. Sem ela ⇒ `409 DEPENDENCIA_AUSENTE`. As outras arestas são ordem
declarada (a RPA a segue), não enforcement: inventar bloqueio nelas seria mudar o contrato.

**Onde o check roda:** dentro de `processarCarga`, logo depois do lock da base e **antes** de
`abrirCarga`. O contrato põe o passo 3 antes dos passos 4–9, e só 4–9 geram linha `rejeitada`:
um 409 de pré-condição não consome a chave de idempotência nem grava linha de carga (mesmo
tratamento do `409 CARGA_EM_ANDAMENTO`), e não dispara alarme (só 422 é rejeição de conteúdo).
Vale para a conferência (`confirmar:false`) também — o operador vê o 409 no modal antes de subir.

**Fail-closed:** se a leitura da última carga de Aberto FALHAR, a carga não segue (500
`ERRO_INTERNO`) — "não consegui saber" não pode valer como "está lá".

Arestas vivas registradas (são o contrato, não defeito):
- RPA de Aberto às 23:50 e de Operação às 00:10 ⇒ 409 (o dia virou).
- Retry com a MESMA chave de idempotência de uma Operação já aplicada, em outro dia sem Aberto
  do dia ⇒ 409 em vez do replay (o check vem antes da idempotência, que mora em `abrirCarga`).
- O aviso de cruzamento de Vencimento (`carga.ts`) **continua**: o grafo cobre Aberto do dia;
  Movimentação vazia (o fallback do Vencimento) só é pega por ele.

`regenerar_dim_operacao_weddings` já roda dentro de `promover_carga_operacao` e de
`promover_carga_vendas` (0278) — a chamada solta de antes saiu na M5. Nada a fazer.

## 2. Welcome em todos os leitores (M7a, migration 0283)

A M5 pôs o filtro Welcome numa view (`analytics.vendas_excel_para_fato`) e trocou só o
`transform_raw_to_analytics`. O plano da Fase 3 (divergência D10) já pedia o mesmo `WHERE` em
`regenerar_dim_operacao_weddings`. Enumerado no catálogo vivo em 25/09, **seis** leitores de
`raw.vendas_excel` ficaram fora da view:

| leitor | uso |
|---|---|
| `analytics.regenerar_dim_operacao_weddings()` | faturamento/receita/hotel/data do evento por operação |
| `public.contar_convidados_operacao(text)` | passageiros das Diárias de Hospedagem da operação |
| `public.get_carteira_weddings__nucleo(text)` | contrato + faturamento por operação |
| `public.get_operacao_weddings__nucleo(text)` | detalhe da operação |
| `public.get_operacoes_weddings__nucleo(...)` | Lista de Operações |
| `analytics.vw_vendas_agregadas` | venda agregada → Vendas em Aberto, prejuízo, receita negativa, `cruzar_vendas_setor` |

**Medido nos anexos crus de 21/09** (a tabela viva tem ZERO Welcome hoje, então "diff = 0" contra
ela não prova nada): das 210 linhas Welcome, **5 têm `operacao_propria` preenchida, em 4 operações
que também existem fora de Welcome** — duas são casamentos (`W - Flávia e Joelson - 11JUN25`,
`W - Jeanny e Leandro - 28NOV25`) e duas de grupos (`G - EuroTour 2025 - ARMAC`,
`G - FINNMetko - Komatsu AUG26`); 47 são "Diárias de Hospedagem"; 141 vendas distintas, 4
"Aberta", 7 linhas com receita negativa; nenhuma venda mistura item Welcome e não-Welcome.
**Sem a 0283, a primeira carga de Vendas da M9 mudaria número em Weddings e em Vendas em Aberto**
— violação do invariante 1.

A 0283 é escrita a partir do **corpo vivo** (`pg_get_functiondef`), e a única mudança é
`raw.vendas_excel` → `analytics.vendas_excel_para_fato` nas leituras. Assinaturas idênticas
(`CREATE OR REPLACE` preserva dono e ACL); a view mantém as mesmas colunas.

**Enforcement mecânico:** sonda de catálogo read-only — toda função/view cujo corpo cita
`raw.vendas_excel` tem de estar numa lista FECHADA de escritores da ingestão. Um leitor novo que
esqueça a view reprova a suíte.

## 3. Leitura (M7b)

### 3.1 Mês parcial (decisão 14)

"Parcial" **não** deriva do calendário. O caso que discrimina: export extraído em 21/09, olhado
em 01/10 — pelo calendário setembro "fechou", e tem 21 dias. Regra: **o último mês com dado na
base é parcial quando a data da carga cai dentro dele.** Só o RÓTULO muda (sufixo "· parcial");
nenhum valor e nenhum corte de YTD se mexe (invariante 1). Rótulo e valor nascem da mesma fonte
de cobertura.

### 3.2 Carimbo

Reusa `UltimaAtualizacao` (`vigiarAtraso={false}`). Os dois selos que já existem em
`/financeiro/dre` ficam como estão (texto e fonte já em produção).

## 4. Para o Yan (defaults adotados — nenhum bloqueia)

1. **Caixa da DRE** já marca o mês corrente com `·REAL`/`·PREV`. Default: não mexer. Pergunta: isso
   satisfaz a decisão 14 ou entra "· parcial" junto?
2. **Texto do carimbo:** o briefing pede "base carregada em DD/MM/AAAA"; a plataforma já usa
   "Última atualização em DD/MM/AAAA HH:MM". Default: manter o existente.
3. **Lista de operações "exposta por RPC de leitura para a RPA"** (contrato §5): não existe, e a
   RPA de Operação está fora da v6 ("só depois do id"). A derivação em TS existe
   (`parsers/lancamentos-operacao.ts`). Default: não construir; candidata a errata 4, v6.1.
4. **Premissa do briefing desatualizada:** "hoje só a competência tem carimbo" — o caixa da DRE
   também tem.

## 5. O que foi provado (25/09)

**0283 aplicada** sob o backup-gate (`npm run db:migrate -- --aditiva`, veredito VERDE: 61/61
tabelas, restore-test spot com checksum idêntico em `fato_venda`, `dim_operacao_weddings`,
`rbac_usuarios`). Antes do push: `revisor-db` APROVADA COM RESSALVAS (sem CRÍTICO/ALTO);
`classificarSql` → `aditiva`; diff mecânico contra o dump vivo — cada corpo idêntico ao vivo com a
troca aplicada, **13 ocorrências** (3+1+2+3+3 nas funções, 1 na view). `database.ts` regenerado:
diff vazio (nenhuma assinatura mudou).

**Sonda vista reprovando e depois passando:** antes do push, `sonda-leitores-vendas-excel` reprovou
nomeando exatamente os 6 leitores; depois do push, 2/2 verdes. O padrão foi alargado antes do push
(achado MÉDIO do `revisor-db`): casa `vendas_excel` com qualquer qualificação de schema — citação
entre aspas e leitura não qualificada via `search_path` também reprovam. Continuou nomeando os
mesmos 6, sem falso positivo.

**Ensaio em transação revertida contra produção** (script fora do repositório, como o da M5 —
tornar permanente é decisão do Yan, ver WORKING-CONTEXT, lista `ESCREVEM_E_REVERTEM_HOJE`). Na
operação real `W - Jeanny e Leandro - 28NOV25` (uma das duas que o cru contamina):

| leitor | antes | + 1 linha **Welcome** (R$ 1.000, Diárias, Aberta, 1 passageiro) | mesma linha como **Trips** (controle) |
|---|---|---|---|
| `get_operacao_weddings__nucleo` (faturamento) | 245.069,77 | 245.069,77 | 246.069,77 |
| `contar_convidados_operacao` | 0 | 0 | 1 |
| `vw_vendas_agregadas` (linhas da venda) | 0 | 0 | 1 |
| `regenerar_dim_operacao_weddings` → dim (faturamento) | 245.069,77 | 245.069,77 | 246.069,77 |
| `get_carteira_weddings__nucleo` | — | idêntico | mudou |
| `get_operacoes_weddings__nucleo` (busca "Jeanny") | — | idêntico | mudou |

Welcome não mexe em NADA; o controle mexe nos seis — o ensaio enxerga. `ROLLBACK` no fim: zero
linha do ensaio na tabela. (Primeira rodada: a Lista de Operações voltou vazia porque o ensaio
passava `NULL` onde o default é `'todos'` — o leitor NÃO tinha sido exercitado; corrigido e
re-rodado antes de dar a prova por fechada.)

**Grafo:** 6 casos em `carga.test.ts` (sem Aberto ⇒ 409 e nenhuma linha aberta; Aberto de ontem ⇒
409 com `detalhe.faltando`; vale na conferência; Aberto de hoje passa; leitura falhando ⇒ 500
fail-closed; base sem pré-requisito não lê o grafo) + `grafo.test.ts` (arestas, sem ciclo, virada
de dia no fuso nos dois sentidos). A prova AO VIVO do 409 fica para a M9: hoje nenhuma base tem
carga `aplicada` em `ingestao.carga`, e subir Operação pela tela só para ver o 409 é possível a
qualquer momento, sem risco (o 409 vem antes de qualquer escrita).

**Revisões:** `revisor` APROVADO (zero CRÍTICO/ALTO/MÉDIO; 2 BAIXO de registro). `revisor-db`: a
lacuna de GRANT que ele apontou para o `ingestor` em `promover_carga_vendas(jsonb, uuid)` **não
existe** — conferido no catálogo vivo (`has_function_privilege` = true nas cinco `promover_carga_*`
novas; a 0279 concedeu, ele leu só 0274/0278).

## 6. Registrado para o out-briefing (não bloqueia)

- Os selos novos (Fluxo de Caixa, Performance, Weddings) ficam **vazios até a M9**: leem
  `ingestao_carga_ultima`, e nenhuma base tem carga aplicada pelo caminho novo. É honesto, não
  defeito; não caem para outra fonte de data.
- Em `/performance` e `/performance/weddings` o título mora no `layout.tsx` compartilhado; os selos
  entraram numa linha própria acima da primeira TopSection (não ao lado do título). Em `/performance`
  (Geral) só aparecem com `?preview=1` — a página inteira está atrás do `EmConstrucao` (pré-existente).
- `/financeiro/fluxo-caixa` não tem `<h1>`; os selos entraram sozinhos no topo.
- O guard `cargaAberta` em `processarCarga` também corrige um caso pré-existente: se `abrirCarga`
  falhava, o `catch` tentava concluir uma linha que nunca existiu.
- Mês parcial: a tabela densa segue cortando o YTD pelo calendário e o Resumo pela cobertura
  (fronteira pré-existente, `janela-competencia.ts`); o rótulo "· parcial" nasce da cobertura nos
  dois pontos e nenhum valor mudou.
