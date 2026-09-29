# Anexo v6.1.0 — M0: validação briefing × repo e plano aprovado (29/09/2026)

> Plano aprovado pelo Yan na abertura da v6.1.0 ("Entrega das RPAs: errata 4, chaves por RPA, cliente
> de entrega"), depois da validação do briefing contra o repositório e o banco vivo. As decisões que o
> Yan tomou nesta validação estão ao fim da seção "Divergências".

Worktree `.claude/worktrees/feat-v6-1-0-entrega-rpa`, branch `feat/v6-1-0-entrega-rpa` (briefing
commitado em f90749b). Rota A. Migration livre **0287**, ADR livre **0179** (conferidos em todas as refs).

## Context

As quatro RPAs (Power Automate Desktop) já extraem os crus. Falta a entrega sem humano. O briefing
pede três coisas: a errata 4 do contrato (o que a RPA de Operação precisa), uma chave de máquina por
RPA com escopo mínimo, e um cliente de entrega versionado (`scripts/rpa/entregar-ingestao.ps1`) que
o PAD chama com uma linha. Nenhuma tela nova, nenhum número muda.

## Divergências briefing × realidade (medidas em 29/09)

1. **As 201 linhas da Darlene e Adnan já saíram.** A carga de Operação de hoje (29/09 14:19 UTC,
   `lancamentos-operacao_2026-09-29.csv`, 41.959 linhas) **já é o CSV da RPA**: tem `Operacao_Id`,
   239 operações ↔ 239 ids (1:1), nenhum id vazio. Entrou pelo card (origem `manual`). O fato hoje só
   tem "W - Daniella e Augusto" (201 linhas, R$ 1.191.358,38). O checkpoint final ("a 1ª carga via RPA
   remove as 201 linhas") perdeu o objeto: a remoção já aconteceu. **Avisar quem acompanha Weddings
   que ela já está em produção.** A prova de `operacoes_removidas` fica sintética (M2).
2. **O parser descarta `Operacao_Id` em silêncio** (`parsers/lancamentos-operacao.ts` +
   `comum.ts:395`, só aparece em `diagnostico.colunasNaoMapeadas`). O fato atual não tem ids, então
   a 1ª comparação por conjunto depois da v6.1 é por nome.
3. **Conferência não grava linha em `ingestao.carga` nem alarma** (errata 2(a)). No GATE, o que
   fica em `ingestao.carga` com `rpa-pad` são só as aplicações; a conferência se prova pela resposta
   JSON. Na conferência, `puladas` e `operacoes_removidas` aparecem só na resposta. Alarme só na
   aplicação.
4. **`confirmar` tem default `true` no servidor** (`route.ts:124`). O cliente manda
   `confirmar:false` explícito sempre que falta `-Aplicar`. A errata 4 corrige a frase da errata 2(a)
   "a RPA nunca envia confirmar".
5. **Operação exige Aberto aplicado no mesmo dia também em conferência.** No GATE, a ordem é
   Movimentação e Aberto aplicados antes da conferência de Operação.
6. **Não existe "carga anterior" no diff; ele mede contra a base viva.** A comparação por conjunto
   lê as operações do **fato** (já sem placeholders) **antes** da promoção, que trunca raw e fato.
7. **As chaves se criam pela tela `/admin/api-externa`** (`criarChaveApi`, checkboxes de base, segredo
   `jns_…` mostrado uma vez). Quem cria é o Yan; a sessão nunca vê o segredo. Hoje existem zero chaves.
8. **A sessão não consegue executar PowerShell** (o harness bloqueia `powershell.exe` na worktree).
   Toda execução do cliente é do Yan, no Windows. A M4 se verifica por revisão e pela 1ª execução dele.

**Decisões do Yan nesta validação (29/09):** GATE em **duas etapas**. Fechar **as duas brechas**:
(i) a API de Solicitações (`/api/externo/*`) recusa chave com escopo de ingestão (403); (ii) o
servidor amarra a origem à credencial: chave ⇒ só `rpa-pad`/`rpa-cloud`; sessão ⇒ só
`manual`/`reprocesso`.

## Decisões técnicas (vão para o ADR-0179)

- **`puladas` mora no `diff` jsonb de `ingestao.carga`** (`diff.puladas`, ao lado de
  `diff.operacoes_removidas`/`operacoes_novas`), não numa coluna nova. Coluna nova exigiria parâmetro
  novo em `ingestao_carga_concluir`, ou seja, função nova e a antiga para a próxima destrutiva (D-9).
  O `diff` já é gravado; o código passa a entregá-lo também na rejeição quando a base é Operação.
- **Conjunto de operações "antes"**: RPC nova somente-leitura, `service_role`, que devolve
  `(operacao, operacao_id)` distintos do fato. Comparação por `operacao_id` quando os dois lados o
  têm; senão por nome normalizado com o `apertar` existente (trim + espaços colapsados). A regra
  entra escrita na errata.
- **Idempotência no cliente**: um UUID e um `carga_id` por execução. Retentativa repete o passo que
  falhou com o mesmo `carga_id`; `PUT` que volta "já existe" conta como sucesso (o passo 3 reconfere
  o sha256).

## Missões

**M0 — errata 4 antes do código (checkpoint do Yan: ler a errata).**
- `docs/contratos/ingestao-v1.md`: errata 4 no formato das anteriores (parágrafo em negrito antes de
  `## 0.`, itens (a)–(e) do briefing + as notas acima: sem linha/alarme em conferência, `confirmar`
  explícito, a regra de nome normalizado, a origem amarrada à credencial, e a chave de ingestão fora
  da API de Solicitações). Notas inline em §1, §2.3, §5 e §6. Sai a "RPC de lista de operações" (§5).
- Conserto miúdo herdado: `scripts/ingestao/fixtures.mjs` passa a achar também pelo **nome canônico**
  (hoje só pelo nome de origem; a instrução do WORKING-CONTEXT de restaurar do arquivo não
  funcionava) + WORKING-CONTEXT corrigido.
- Commit 1 (`docs(v6-1-0): errata 4 …`). **Paro aqui para você ler a errata.**

**M1 — migration 0287 (aditiva).**
- `operacao_id text NULL` em `raw.lancamentos_operacao`, `raw.lancamentos_operacao_staging` e
  `analytics.fato_lancamento_operacao`.
- `inserir_lote_staging_operacao(jsonb)` e `promover_carga_operacao(jsonb, uuid)` com
  `CREATE OR REPLACE` **a partir do corpo vivo** (diff linha a linha), mesma assinatura, só
  propagando a coluna. Payload sem a chave ⇒ NULL, então o código v6.0 em produção segue funcionando.
- RPC nova de leitura do conjunto de operações (`SECURITY DEFINER`, REVOKE/GRANT só `service_role`,
  COMMENT).
- `revisor-db` antes. Ensaio da promoção inteira em transação revertida: carga com `operacao_id`
  preserva linhas e Σ do fato. `db:migrate --aditiva`; REST depois; `database.ts` + `db:baseline`.

**M2 — servidor.**
- Parser: lê `Operacao_Id` quando o cabeçalho a declara. Declarada e vazia numa linha aplicável ⇒ 422
  `ESTRUTURA_INESPERADA`. Ausente ⇒ nulo (o CSV do R continua aceito). O adaptador leva `operacao_id`.
- Rota: Zod aceita `puladas: [{operacao, ids, motivo}]` **só** para `lancamentos-operacao` (outra
  base ⇒ 422). **Origem amarrada** (decisão ii): header que contradiz a credencial ⇒ 422; header
  ausente ⇒ derivada.
- `processarCarga`: lê o conjunto "antes" (RPC da M1) e o compara com o do arquivo ⇒
  `diff.operacoes_removidas/novas` + `diff.puladas`. Na aplicação: alarmes `operacoes_puladas` e
  `operacoes_removidas` (esta **mesmo** que a operação esteja em `puladas`). Tipos novos no TS:
  união em `email/template.ts`, os 3 switches, `comoAlarmeIngestao` e `ROTULO_ALARME`. A tabela não
  tem CHECK de tipo.
- **API de Solicitações** (decisão i): `/api/externo/*` recusa chave com `escopo_bases` não vazio ⇒ 403.
- Testes: parser (com, sem e vazia), `aplicar.test` (chaves do payload), `carga.test` (origem amarrada,
  `puladas` fora de Operação ⇒ 422, carga sintética com uma operação a menos ⇒ removida + alarme,
  chave de Operação entregando Vendas ⇒ 403), externo 403, `rpc-contrato` da RPC nova. Oráculo:
  caso novo com o CSV da RPA de 29/09 (vem do bucket, sha256 `6d6be5…` no manifesto, gitignorado).
  O oráculo do R continua verde. `revisor` ao fim. `build` + `test`.

**M3 — chaves + runbook (checkpoint do Yan: criar e guardar as chaves).**
- Você cria as quatro em `/admin/api-externa`: `rpa-vendas` → vendas-produto; `rpa-lancamentos` →
  movimentação + aberto; `rpa-operacao` → operação; `rpa-demonstrativo` → demonstrativo. Guarda cada
  segredo na variável de ambiente do usuário da máquina da RPA. A sessão confere, sem segredo, que
  as quatro existem com os escopos certos.
- `docs/runbooks/chaves-rpa-runbook.md`, no formato de `credenciais-maquina-runbook.md`: quais chaves
  existem, o que cada uma pode, revogar uma sem afetar as outras, e o que o robô Auth de cada chave é.

**M4 — cliente de entrega.**
- `scripts/rpa/entregar-ingestao.ps1` (PowerShell 5.1), com os parâmetros e códigos de saída do
  briefing (0/2/3/4/5/1). Os dois 409 se distinguem por `erro.codigo`. Assert de modo: sem `-Aplicar`
  e resposta `aplicada` ⇒ fatal. Regras de PS 5.1 que o explorador listou: TLS 1.2,
  `-UseBasicParsing`, corpo em bytes UTF-8, `ConvertTo-Json -Depth` alto, corpo de erro lido do
  `WebException`. A chave nunca é impressa; a resposta vai para `<primeiro-arquivo>.resposta.json`.
  `-Log` extrai as linhas `PULADA`.
- `scripts/rpa/README.md`: instalar, variável de ambiente, códigos de saída, a linha exata que o PAD roda.
- `revisor` sobre o script, contra o contrato. Execução real só na M5.

**M5 — GATE em duas etapas (você, pelo Windows).**
- **Etapa 1, antes do merge, contra produção** (servidor ainda na v6.0, que ignora `puladas` e
  `Operacao_Id`):
  - conferência de cada base (exit 0, `conferida`, nada gravado);
  - aplicação uma a uma, Movimentação e Aberto antes de Operação ⇒ linhas `rpa-pad` com o `chave_id`
    certo em `ingestao.carga`;
  - 403 cruzado (chave de Operação entregando Vendas ⇒ exit 3; aparece em `app.api_chamada_log`);
  - eu transcrevo as provas do banco e confiro em `/admin/ingestao`.
- **Etapa 2, depois do merge** (smoke em produção): uma carga de Operação via RPA com `-Log`
  ⇒ `diff.puladas` e o conjunto de operações gravados; origem amarrada e o 403 da API de
  Solicitações vistos negando.

**M6 — fechamento.** `/fechamento-versao`: 6.1.0, CHANGELOG, CHANGELOG_DIRETORIA (frase do briefing),
ADR-0179, skills `ingestao-planilhas` e `banco-e-rpc` (+ checklist do `revisor-db` se mudar
convenção), out-briefing, PR. A etapa 2 do GATE fica registrada como o 1º passo do pós-merge.

## Arquivos principais

- `docs/contratos/ingestao-v1.md`, `supabase/migrations/0287_*.sql`, `docs/adr/0179-*.md`
- `src/lib/ingestao/parsers/lancamentos-operacao.ts`, `src/lib/ingestao/aplicar.ts`,
  `src/lib/ingestao/carga.ts`, `src/app/api/ingestao/[base]/route.ts`, `src/lib/ingestao/alarme.ts`,
  `src/lib/email/template.ts`, `src/components/admin/ingestao/tipos.ts`, rotas `src/app/api/externo/*`
  (ou `src/lib/api-externa/http.ts`)
- `scripts/rpa/entregar-ingestao.ps1`, `scripts/rpa/README.md`, `docs/runbooks/chaves-rpa-runbook.md`,
  `scripts/ingestao/fixtures.mjs`, `scripts/ingestao/fixtures-manifest.json`
- Reuso: `mapearColunas`/`apertar` (`parsers/comum.ts`), `dispararAlarmeDeEvento` (`alarme.ts`),
  `somaPorAno` como padrão de leitura antes da promoção, `autenticarIngestao`/`autenticarChamada`,
  `criarChaveApi` (tela existente).

## Verificação

- Por missão: `tsc` + `lint`. Após M2 e no fechamento: `build` + `test`.
- M1: ensaio em tx revertida; REST (`service_role`) da RPC nova e das duas alteradas; diff do
  baseline só com o esperado.
- M2: os testes acima; oráculo RPA + oráculo R verdes.
- M5: etapas 1 e 2 transcritas no out-briefing (linhas `rpa-pad` com `chave_id`, 403 no log de chamadas).
- Invariantes do briefing: nenhum número de tela muda (o leitor não lê `operacao_id`); card aceita os
  dois CSVs; nenhum segredo versionado; checksum falho nunca aplica; remoção nunca silenciosa na aplicação.
