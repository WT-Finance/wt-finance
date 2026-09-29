# JANUS · Briefing v6.1.0 — Entrega das RPAs: errata 4 do contrato, chaves por RPA e cliente de entrega versionado

**MINOR** · **Migration:** 1 aditiva (numerar na hora — a última aplicada é a `0286`; conferir no remoto) · **ADR:** 1 novo — "Cliente de entrega das RPAs e operações puladas" (numerar no remoto; conferir `docs/adr/` — os 0176–0178 foram fechados em paralelo na v6.0.0) · **Base:** `main` com v6.0.0 + v6.0.1 mergeadas e deployadas · **Branch:** `feat/v6-1-0-entrega-rpa` · **Rota A**

*As quatro RPAs (Power Automate Desktop) já extraem os crus, e os crus já passaram, um a um, pelo card de upload em 28/09 — checksums fechando, diff esperado. Falta a entrega sem humano. Esta versão faz três coisas: (1) a errata 4 do contrato, com o que a RPA de Operação precisa e a plataforma ainda não aceita; (2) uma chave de máquina por RPA, com escopo mínimo; (3) um cliente de entrega versionado no repositório — um script que a RPA chama com uma linha e que faz os três passos do contrato, para o PAD não ter de falar HTTP. Nenhuma tela nova, nenhuma mudança de número.*

> ## ⛔ GATE — a entrega se prova de ponta a ponta antes de fechar
> O Yan roda o cliente de entrega **no Windows, contra produção**, para cada uma das cinco bases, primeiro em **conferência** (nada aplica) e depois com `-Aplicar`, uma base por vez. Cada execução tem de produzir a linha correspondente em `ingestao.carga` com origem `rpa-pad` e a chave da RPA certa. Prova negativa: a chave da RPA de Operação tentando entregar Vendas ⇒ **403**. Barreira não vista negando não vale.

## 1. Estado medido (28/09/2026 — conferido no Chat, não presumir)

- **Contrato vigente:** `docs/contratos/ingestao-v1.md` com as erratas 1–3. Entrega em **três passos** (URL assinada → `PUT` no Storage → carga), não multipart (D2 da v6.0.0). O campo `confirmar` decide conferência × aplicação (errata 2).
- **CSV da RPA de Operação** difere do CSV do R em três pontos e foi **aceito pelo card** em 28/09: `Liquidação` vazia em vez de `"NA"`; nenhuma linha "Nada para mostrar"; coluna nova **`Operacao_Id`** no fim (UUID, texto). **Conferir no parser** se a coluna hoje é ignorada em silêncio ou lida — o card ter aceitado não diz qual.
- **`Operacao_Id` é o `value` estável do `<select id="id">`** de `agency_operations` (UUID, estabilidade conferida pelo Yan). A RPA navega por ele (`?id=`); o nome vira só rótulo.
- **A RPA pula operação com defeito de cadastro** (nome ambíguo ou ausente no dropdown), registra no `.log` e segue; com mais de 3 puladas, aborta. Formato do log, uma linha por operação: `operacao;id;status;entradas;saidas;leituras` — `status` = `OK` ou `PULADA - <motivo>`; última linha `RESUMO;;puladas=N;;;`.
- **Defeito do R descoberto pela RPA:** para nome ambíguo, o `Extração_Casamentos.R` escolhia a 1ª opção **sem clicar** e extraía de novo a operação anterior. Em produção, "W - Darlene e Adnan - DDMMAA" tem 201 linhas (R$ 1.191.358,38), cópia exata de "W - Daniella e Augusto - 08APR2024". O cadastro está duplicado no Monde. A 1ª carga de Operação vinda da RPA **remove** essas 201 linhas — correção de dado, não regressão.
- **A lista de operações** é derivada pela própria RPA dos exports de Vendas (`Produto = "Contrato de casamento"`, `Operação Propria`, espaços colapsados). A "RPC de lista para a RPA" do contrato §5 (não construída; candidata a errata 4 no out-briefing da v6.0.0) **deixa de ser necessária**.
- **Chaves:** `app.api_chave.escopo_bases` existe desde a 0274; `ingestao.carga` já registra quem fez a carga (0281).

## 2. Decisões do Yan (firmes)

1. **A RPA aplica direto.** Checksum é o gate e toda rejeição alarma. O cliente, porém, **nasce em conferência por padrão** e só aplica com `-Aplicar` explícito (lição da v6.0.1: default que aponta para produção tem de ser o inofensivo).
2. **Uma chave por RPA**, escopo mínimo: `rpa-vendas` → `vendas-produto`; `rpa-lancamentos` → `lancamentos-movimentacao` + `lancamentos-aberto`; `rpa-operacao` → `lancamentos-operacao`; `rpa-demonstrativo` → `demonstrativo-competencia`.
3. **`Operacao_Id` entra como coluna opcional**, gravada em `raw.lancamentos_operacao` e propagada ao fato, **sem** mudar leitor nesta versão. O CSV do R (sem a coluna) continua aceito — é o fallback manual.
4. **Operação pulada não some em silêncio.** A carga recebe a lista de puladas, grava em `ingestao.carga` e alarma. E, independente do que a RPA declarar, o servidor compara o conjunto de operações com o da carga anterior: **operação que existia e sumiu** entra no diff e alarma.
5. **O cliente de entrega vive no repositório** e é a única implementação dos três passos fora do card. O PAD só chama o script e lê o código de saída.

## 3. Errata 4 ao contrato

Registrar em `docs/contratos/ingestao-v1.md`, como as anteriores:

- **(a)** `lancamentos-operacao`: coluna opcional `Operacao_Id` (texto). Ausente ⇒ nulo. Declarada no cabeçalho e vazia numa linha ⇒ **422**.
- **(b)** Disparo da carga aceita, só para `lancamentos-operacao`, o campo opcional `puladas`: lista de `{ operacao, ids, motivo }`. Gravado em `ingestao.carga`; não vazio ⇒ alarme `operacoes_puladas` (um incidente por carga, com os nomes).
- **(c)** Diff de Operação ganha `operacoes_removidas` e `operacoes_novas` (por `Operacao_Id` quando as duas cargas o têm; por nome normalizado quando não). `operacoes_removidas` não vazio ⇒ alarme `operacoes_removidas`, **mesmo** que constem em `puladas` (a pulada é a causa; a remoção é o efeito que a diretoria vê).
- **(d)** Sai do contrato a "RPC de lista de operações para a RPA" (§5).
- **(e)** Origem `rpa-pad` usada de fato; `x-ingestao-idempotencia` gerado pelo cliente **uma vez por execução** e reutilizado nas retentativas.

## 4. Frentes

### A — Banco (migration aditiva)
- `operacao_id text NULL` em `raw.lancamentos_operacao`, na staging e em `analytics.fato_lancamento_operacao`.
- `promover_carga_operacao` propaga a coluna. **Corpo extraído do catálogo vivo**, diff linha a linha, `revisor-db` antes. Se a assinatura precisar mudar, é função nova e a antiga vai para a próxima destrutiva (D-9: `CREATE OR REPLACE` não adiciona parâmetro).
- `puladas` em `ingestao.carga`: coluna jsonb nova ou dentro do jsonb existente — decidir lendo o schema vivo; registrar.
- Rótulos de alarme `operacoes_puladas` e `operacoes_removidas` **com a grafia que o código grava** (lição M6).

### B — Servidor
- Parser de Operação lê `Operacao_Id` quando presente (descoberta por nome normalizado); guarda de (a).
- Rota aceita `puladas` (Zod), grava, alarma (b); diff por conjunto de operações (c).
- Oráculo de Operação ganha um caso com o CSV da RPA de 28/09 (fixture gitignorada, sha256 no manifesto); o oráculo com o CSV do R continua verde.

### C — Chaves
- Quatro registros em `app.api_chave` pelo mecanismo existente, com os escopos da decisão 2. Chave em claro aparece **uma vez**, para o Yan; nunca em arquivo versionado, log ou out-briefing.
- Runbook em `docs/runbooks/`: quais chaves existem, o que cada uma pode, como revogar uma sem afetar as outras.

### D — Cliente de entrega (`scripts/rpa/entregar-ingestao.ps1`)
PowerShell **5.1** (o que vem no Windows — nada a instalar na máquina da RPA). Parâmetros:

    -Url          base da produção
    -Base         uma das 5 bases do contrato
    -Arquivos     1..N caminhos (Vendas: um por ano)
    -ChaveEnv     NOME da variável de ambiente que contém a chave (nunca a chave)
    -Log          (só Operação) o .log da RPA; o script extrai as linhas PULADA
    -ExtraidoEm   ISO-8601
    -Aplicar      switch; sem ele, conferência

Comportamento:
- Três passos do contrato; idempotência = um UUID por execução, reutilizado nas retentativas.
- **Retenta** só o transitório (rede, 5xx, 409 de carga em andamento): 3×, espera crescente. **Não retenta** 401/403/413/422 nem 409 do grafo.
- Grava a resposta inteira em `<primeiro-arquivo>.resposta.json`; nunca imprime a chave.
- **Assert de modo** (lição v6.0.1): sem `-Aplicar`, resposta `aplicada` ⇒ saída fatal.
- **Código de saída** (é o que o PAD lê): `0` aplicada/conferida · `2` rejeitada (422) · `3` chave inválida/sem escopo (401/403) · `4` grafo (409 — base anterior do dia não carregou) · `5` arquivo grande demais (413) · `1` qualquer outra falha após as retentativas. Mensagem de uma linha no stderr em todo código ≠ 0.
- `scripts/rpa/README.md`: instalar na máquina da RPA, gravar a chave na variável de ambiente do usuário, os códigos de saída, e a linha exata que o PAD executa.

## 5. Invariantes

1. Zero mudança de número em tela e de leitor — `operacao_id` é gravado, não lido.
2. Caminho manual intacto: card aceita CSV do R e CSV da RPA; seed segue verde.
3. Nenhum segredo versionado; chave só em variável de ambiente da máquina da RPA.
4. Checksum falho nunca aplica — o cliente só transporta, não tem flag que contorne.
5. Operação removida nunca é silenciosa, com ou sem `puladas`.
6. `app.exigir_acesso` não muda.

## 6. Missões

| # | Conteúdo | Auto-auditoria |
|---|---|---|
| **M0** | Abertura; errata 4 escrita no contrato **antes** do código; conferir se o parser atual ignora ou lê `Operacao_Id` | errata commitada antes de qualquer código |
| **M1** | Migration (Frente A); `revisor-db` antes; REST depois | ensaio em transação revertida: carga com `operacao_id` preserva todos os números do fato |
| **M2** | Servidor (Frente B); fixture RPA no oráculo | carga sintética com uma operação a menos ⇒ `operacoes_removidas` + alarme; oráculo do R verde |
| **M3** | Chaves (Frente C) + runbook | chave de Operação entregando Vendas ⇒ 403 |
| **M4** | Cliente de entrega (Frente D) + README | conferência de uma base contra a preview; mutante: sem `-Aplicar` e resposta `aplicada` ⇒ sai fatal |
| **M5** | **GATE** com o Yan: 5 bases em conferência, depois aplicação uma a uma, pelo Windows | 5 linhas `rpa-pad` em `ingestao.carga` com a chave certa; 403 cruzado transcrito |
| **M6** | Fechamento: v6.1.0; CHANGELOG; CHANGELOG_DIRETORIA ("a carga dos relatórios do Monde passa a poder ser feita por robô, com a mesma conferência da carga manual"); ADR; skills `ingestao-planilhas` e `banco-e-rpc`; out-briefing | — |

## 7. Gates, checkpoint, fronteira

**Gates:** `tsc`+`lint` por missão; `build`+`test` após M2 e no fechamento. `revisor-db` em M1; `revisor` em M2 e M4. RPC verificada via REST com a credencial de verificação. Sem conferência visual, exceto ler em `/admin/ingestao` as cargas da M5.

**Checkpoint do Yan:** (M0) ler a errata 4 · (M3) guardar as quatro chaves nas variáveis de ambiente da máquina da RPA · (M5) rodar o GATE · (final) a 1ª carga de Operação via RPA remove as 201 linhas da Darlene e Adnan e dispara `operacoes_removidas` — esperado; avisar antes quem acompanha Weddings.

**Fronteira (fora):** orquestração das quatro RPAs e agendamento diário (depende de onde vão rodar — decisão aberta: máquina, conta, licença); ligar `ingestao-vigia` e expectativas por base (depois da 1ª execução automática registrada); comunicação à liderança sobre a cadência diária; usar `operacao_id` em leitor ou em `dim_operacao_weddings` (backlog — medir antes se é o mesmo `operation_id` do payload da API do Monde); corrigir o cadastro duplicado no Monde (ato do Yan); recalcular os "571 lançamentos em duas operações" depois da 1ª carga via RPA.

## 8. Skills a ler

`.claude/skills/ingestao-planilhas/SKILL.md` · `banco-e-rpc` · `contrato-rpc-front` · `email` · `orquestracao` (Carta, antes de despachar)

## 9. Commits sugeridos

1. `docs(v6-1-0): briefing + errata 4 do contrato de ingestao` — GATE 0
2. `feat(db): operacao_id em lancamentos_operacao + puladas na carga`
3. `feat(ingestao): operacao_id no parser, puladas e diff por conjunto de operacoes`
4. `chore(ingestao): chaves por rpa com escopo minimo + runbook`
5. `feat(rpa): cliente de entrega em powershell`
6. `chore(release): v6.1.0`