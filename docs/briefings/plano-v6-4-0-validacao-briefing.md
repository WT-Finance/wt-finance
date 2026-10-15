# v6.4.0 · Financeiro · Geral — validação briefing × repo e plano de execução

## Contexto

O briefing `docs/briefings/briefing-v6-4-0-financeiro-geral.md` (Rota A, 1º commit `4de6b60`) cria a página
`/financeiro/geral` para a diretoria, com cinco seções:

- Recebíveis e inadimplência;
- Antecipações;
- Perdas e prejuízos;
- Custos financeiros;
- Prazos médios.

Também cria duas bases novas: **contas a receber** por upload e o **registro de antecipações**.

A M-1 extra (`docs/auditoria/v6-4-0-m-1-api-monde.md`, commits `7a97798` e `3a81cd2`) mediu a API v3. A decisão
do Yan foi manter o **upload manual** do Contas a pagar e a receber nesta versão, sem mudar o briefing.

Este plano registra o que a validação contra o repo achou e define a ordem de execução. A aprovação
autoriza **só a M0**: medição só leitura, que termina em PARA. Cada GATE seguinte para no checkpoint que o
próprio briefing define.

## Validação briefing × repo

Feita por dois exploradores, só leitura.

### Confirmado

- **Numeração.** Migrations até `0294`, ADRs até `0182`. Livres: **0295** e **0183**. As outras worktrees
  param na 0272, então não há colisão.
- **`get_dre_mensal`.** Definição única em `0207:36`. Predicado do Realizado em `0207:69-73,103-126`:
  - `fato_fluxo.tipo='realizado'`, mês por `data_competencia`;
  - join `dre_categoria_map` por `categoria_id`, `NOT excluida`, agrupado por `bloco_chave`.

  O molde de recorte com paridade é o da v6.3.0 (`0292:270-277`).
- **Diário.**
  - `financeiro.fn_diario_alteracoes` está em `0199:42-82`. Exige PK `id` numérica.
  - `reverter_diario` está em `0268:84`. Só reverte tabela que tem o trigger anexado.
  - Para anexar: `CREATE TRIGGER trg_diario_<t> AFTER INSERT OR UPDATE OR DELETE … EXECUTE FUNCTION financeiro.fn_diario_alteracoes()`
    (exemplo recente em `0271:165-171`).
- **RBAC.**
  - Molde de área nova: `0292:89-98,305-340`. Faz INSERT em `app.rbac_areas`, concede às roles por nome
    (inclusive **Máquina · verificação**, que existe desde `0273`) e fecha com guard de contagem.
  - `exigir_acesso` vigente está em `0269:175-232`. Não muda.
- **Allowlists de máquina.**
  - `scripts/credencial/derivar-allowlist.mjs` deriva as do `verificador` (de `rpc-contrato.test.ts`) e do
    `ingestor` (de `src/lib/ingestao/rpcs-ingestor.ts`).
  - Grants por assinatura, como em `0292:298-300` e `0279:304-309`.
- **`promover_carga_*`** (`0278`):
  - assinatura `(p_checksums jsonb, p_carga_id uuid)`;
  - advisory lock por base (a próxima chave livre é `4017060`);
  - replay idempotente por `ingestao.promocao`;
  - TRUNCATE + INSERT seguidos da conferência do checksum gravado.

  Quem escreve em `ingestao.carga` é a rota, via `ingestao_carga_abrir`/`concluir`.
- **Front.**
  - Navegação: `nav-model.ts` (`FINANCEIRO_SUBS` :57-64).
  - Página inicial: `rotaInicial`/`PRIORIDADE_INICIAL` em `src/lib/auth/areas.ts:184-204`, com testes.
  - `deltaYtd` está em `src/lib/dre/colunas-tabela.ts:246`.
  - `TopSection` está em `src/components/shared/top-section.tsx`.
  - O carimbo "Última atualização" é `src/components/metas/ultima-atualizacao.tsx` com `fmtDataHoraLongoSP`.
  - Convenção de ano parcial com `*`: `src/lib/marketing/periodo.ts:92`.
- **Ingestão.**
  - Contrato `docs/contratos/ingestao-v1.md` §3/§4.
  - Rota `src/app/api/ingestao/[base]/route.ts`.
  - Peças de checksum em `parsers/comum.ts` (`Checksum`, `AcumuladorBruto`, `mapearColunas`, `camposFaltando`).
  - Instruções do card em `instrucoes-upload.ts`.
  - Molde de oráculo: `oraculo-vendas.test.ts` + `fixtures-oraculo.ts`.

### Divergências e como o plano as trata

| # | Briefing presume | Repo real | Tratamento |
|---|---|---|---|
| D1 | "Prejuízos" pode ser bloco próprio | É **categoria-folha no bloco CUSTO** (`0205:82`; na competência, `COM` em `0256:156`) | A M0 confirma no mapa **vivo**. Se continuar folha, o inv. 2 manda a **tabela curada com bandeja**, que é decisão de produto na M0 |
| D2 | FIN = custos financeiros | **FIN é líquido desde a 0251**: inclui Taxa de Antecipação, juros, IOF e tarifas, e também Acréscimos Cobrados, Aplicações e Desconto Obtido | É exatamente a Q1 da M0 ("só custos ou líquido"). A M0 mostra as categorias e o volume, e o Yan decide |
| D3 | A base nova é "migration aditiva" | As 5 bases estão em **CHECK/IN fixos**: `ingestao.carga` (`0276:105`), `ingestao.promocao` (`0277:253`), `api_chave_escopo_bases_validas` (`0274:108`), `ingestao.expectativa` (`0280:340`) e nas RPCs `0276:193,393`. Ampliar um CHECK = `DROP/ADD CONSTRAINT`. O `bases-paridade.test.ts:18-20` lê essas migrations por nome de arquivo | Na M3: ampliar CHECK sem apagar dado é tecnicamente não destrutivo, mas contém `DROP CONSTRAINT`. **Checkpoint com o Yan antes de aplicar**: o `revisor-db` classifica, e se o wrapper tratar como destrutiva, o Yan aplica em TTY. O teste de paridade é reapontado para a migration nova |
| D4 | "Fotos por carga" | **Não há precedente** de tabela de foto | Desenho novo na M3, com molde de atomicidade em `0288:8-12` (capturar sob o lock dentro da `promover`). Passa pelo `revisor-db` |
| D5 | A carga aceita N arquivos "como Vendas" | N arquivos está **fixo** para `vendas-produto` (`carga.ts:133`, união em `:741-778`, `multiplos` no card) | Generalizar por base (lista de bases multiarquivo) na M3 |
| D6 | "Sonda que reprova qualquer outra coluna" | Nenhum parser rejeita coluna desconhecida: as extras vão para `diagnostico.colunasNaoMapeadas` | Ler o inv. 5 como **lista fechada do que é gravado**: o parser e o raw só têm as colunas da lista. A sonda estática compara colunas do raw e do mapeamento do parser com a lista. Coluna extra no arquivo continua sendo ignorada e reportada, não rejeitada |
| D7 | Pills de ano "padrão da v6.3.0" | **Não há componente compartilhado**: `FiltroGlobal` e `src/lib/marketing/anos.ts` são locais do Marketing | Importar de `src/lib/marketing/anos.ts` sem mover nada, porque o inv. 9 proíbe mexer fora da página. Componente de pills próprio da página |
| D8 | Nome "Geral" | A DRE já tem TopSection "Visão Geral" (`dre/page.tsx:406`) | Registrar para o GATE 2 (naming é do Yan) |
| D9 | Área nova | Além de `nav-model`: `AREAS`/`AREA_INFO`, regra `/financeiro/geral` em `areasDaRota` **antes** da genérica `/financeiro` (`areas.ts:137`), redirect de `src/app/financeiro/page.tsx`, e o `rpc-contrato.test.ts` (paridade de áreas, Máquina · verificação em toda área fora de Administração) | Entra na M5/M6 |
| D10 | Carga inicial das 38 antecipações | A planilha "Histórico de Antecipações" **não está na máquina** | **O Yan entrega o arquivo antes da M4** (a M4 para sem ele) |
| D11 | Paridade com a DRE "por ano e mês" | Em `get_dre_mensal` o realizado e o previsto trocam no mês corrente (`0207:177-184`) | O teste de paridade compara só o Realizado de meses fechados e o mês corrente pelo mesmo predicado, como na v6.3.0 |

### Herdado da M-1 para o GATE 1 (informativo, sem decidir)

- O export não traz a natureza a pagar/receber; a linha de total com sinal é a prova da classificação.
- Há 67 títulos `vendor_invoice` de crédito (comissão a receber de fornecedor) que a classificação por
  descrição exclui (166 × 117 vencidos).
- A janela do export começa em 01/01/2026 e perde o inadimplente de 2025.
- Origem da coluna `Operação Própria`.
- ⚠️ Achado fora do escopo: o relatório de Movimentação omite a despesa paga com cartão. Pode afetar a DRE de
  caixa e, por paridade, Custos e Prejuízos. Registrar no out-briefing; não investigar aqui.

## Sequência de execução

Missões e gates do briefing §8/§9. Commit por missão com `git add` de arquivo específico; push após cada commit.

1. **M0 · GATE 0 (autorizada por este plano).** O explorador mede no dado vivo, só leitura (sessão
   `READ ONLY`/REST com `verificador`), as Q1–Q5 do briefing §4, mais:
   - D1: Prejuízos no `dre_categoria_map` **vivo** (bloco atual, volume por ano);
   - D2: categorias do FIN vivo, com sinal e volume por ano, agrupadas em juros/tarifas/IOF/antecipação/receitas.

   Relatório em `docs/auditoria/v6-4-0-m0-financeiro-geral.md`, com query e resultado por pergunta, sem
   nome de pessoa. Commit `docs(auditoria): medicao da m0 — financeiro geral` → **PARA**.
2. **M1 · GATE 1.** O Yan traz o export definitivo no recorte decidido (a)–(d). Conferência contra o §3 e
   contra os achados da M-1 → **PARA**.
3. **M2 · GATE 2.** Mockup na rota real com fixture, inclusive o painel de antecipações (D7, D8) → **PARA**.
4. **M3** (migration de contas a receber; D3–D6) · **M4** (antecipações; exige D10) · **M5** (leitura, área,
   grants; D9, D11) · **M6** (front) · **M7** (contratos REST) · **M8** (`/fechamento-versao`).
   - `revisor-db` antes de aplicar M3, M4 e M5.
   - Checkpoint do Yan em M3 por causa do D3.

## Arquivos críticos (referência)

- **Banco:** `supabase/migrations/0207_get_dre_mensal.sql`, `0205`, `0251`, `0199`, `0268`, `0276`, `0277`,
  `0278`, `0288`, `0292`.
- **Ingestão:** `src/lib/ingestao/{bases.ts,carga.ts,parsers/comum.ts,instrucoes-upload.ts,rpcs-ingestor.ts,bases-paridade.test.ts}`,
  `src/app/admin/ingestao/upload/page.tsx`, `docs/contratos/ingestao-v1.md`.
- **Front:** `src/components/layout/nav-model.ts`, `src/lib/auth/areas.ts`, `src/app/financeiro/page.tsx`,
  `src/lib/dre/colunas-tabela.ts`, `src/lib/marketing/{anos,periodo}.ts`.
- **Contratos:** `src/lib/rpc-contrato.test.ts`, `scripts/credencial/derivar-allowlist.mjs`.

## Verificação

- **M0:** cada resposta com a query e o resultado. Conferência cruzada do FIN e dos Prejuízos contra
  `get_dre_mensal` via REST do `verificador` em pelo menos um ano fechado (Δ = 0,00).
- **Gates do briefing §9:**
  - `tsc` + `lint` por missão;
  - `build` + `test` após M3, M4, M7 e no fechamento;
  - `revisor-db` em M3, M4 e M5; `revisor` ao fim; `verificador-visual` ou conferência do Yan no preview.

## Decisões do Yan (15/10/2026)

**GATE 0** (detalhe em `docs/auditoria/v6-4-0-m0-financeiro-geral.md`, "Decisões do Yan"):

- custos financeiros = custos por grupo + câmbio/receitas, fechando no FIN;
- prejuízos bruto, com a reversão ao lado e série por mês (sem "por natureza");
- prazos = clientes × fornecedores, com saldo do Aberto desde 25/09;
- acesso em dois níveis: `financeiro/geral` (Diretoria, Financeiro, Administrador) e
  `financeiro/geral/gestao` "Financeiro · Geral (gestão)" (Financeiro, Administrador);
- a planilha de antecipações é entregue pelo Yan em `~/projects/arquivo-worktrees-janus/fixtures-ingestao/`.

**GATE 1, antes do export** (briefing §3):

- **(a) Recorte:** só **a receber**, vencimentos de **todos os anos**, em aberto **e a vencer** (N arquivos aceitos).
- **(b) Inadimplência = só a marcação** `Conferido = Inadimplente`. O "vencido em aberto" pela data **não**
  aparece como número. As faixas de atraso (1–30, 31–60, 61–90, 90+) são sobre os títulos **marcados**; o
  "a vencer" continua como carteira.
- **(c) Valor = `Valor Final`** (o que a linha de total soma).
- **(d) Nome do devedor:** `Pessoa` entra na lista fechada. A faixa do topo mostra "10 maiores = X%" sem
  nome; a seção lista o top 10 de inadimplentes **com nome**, só para quem tem `financeiro/geral`.
- **"A receber" = todo título de crédito**, inclusive comissão a receber de fornecedor (faturas de fornecedor
  de crédito; na M-1, 67 dos vencidos). Se o filtro "a receber" do Monde não trouxer esses títulos, a M1
  aponta a diferença.
