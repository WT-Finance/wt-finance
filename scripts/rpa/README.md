# Cliente de entrega das RPAs — `entregar-ingestao.ps1`

O Power Automate Desktop (PAD) extrai os crus do Monde; este script **entrega** cada cru ao Janus. É a
**única** implementação, fora do card de `/admin/uploads`, dos três passos do contrato
(`docs/contratos/ingestao-v1.md`, §2 e **errata 4**): o PAD só chama o script e lê o **código de saída**.

Os três passos, por execução:

1. `POST /api/ingestao/{base}/upload-url` — pede uma URL assinada por arquivo (nasce o `carga_id`);
2. `PUT <signed_url>` — sobe os bytes crus, sem a chave (a autorização é o token da própria URL);
3. `POST /api/ingestao/{base}` — a carga: sha256, parse, checksums, diff e (só com `-Aplicar`) a promoção.

Requisitos: **Windows PowerShell 5.1** (o que já vem no Windows — nada a instalar). Sem módulos, sem
`curl`, sem PowerShell 7.

## Conferência × aplicação

**Sem `-Aplicar` o script só CONFERE.** Ele manda `"confirmar": false` explícito no passo 3 (o default do
servidor é `true` — errata 4(f)); o servidor roda o parse, os checksums, a reconciliação e o diff e **para
antes de aplicar**, devolvendo `status: "conferida"`. Conferência **não grava linha em `ingestao.carga`**,
não consome a idempotência e não dispara alarme (errata 2(a)/4(f)): o que aconteceu aparece só na resposta
(`<primeiro-arquivo>.resposta.json`) e em `app.api_chamada_log`. O grafo (§5) é conferido também na
conferência.

**Com `-Aplicar`** a carga substitui a base inteira em produção e vira linha em `ingestao.carga` com
origem `rpa-pad` e a chave da RPA.

O script confere o próprio resultado: sem `-Aplicar`, uma resposta `aplicada` é **FATAL** (código `1`,
stderr começando com `FATAL:`); com `-Aplicar`, uma resposta `conferida` também.

## Instalar na máquina da RPA

1. Copie a pasta `scripts/rpa/` (o `.ps1` basta) para a máquina, por exemplo `C:\Janus\rpa\`.
2. Libere a execução de scripts para o usuário que roda o PAD — **uma** das duas formas:
   - uma vez: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (se o arquivo veio por download,
     `Unblock-File C:\Janus\rpa\entregar-ingestao.ps1`); ou
   - sem alterar a política: chamar sempre com `-ExecutionPolicy Bypass` (é o que as linhas abaixo fazem).
3. Grave a chave na variável de ambiente do **usuário** (próxima seção).

## A chave: variável de ambiente do usuário

O script recebe em `-ChaveEnv` o **NOME** da variável, nunca a chave. Ele lê a variável do ambiente do
**usuário** e, se não achar, do processo. A chave nunca é impressa nem gravada em disco.

| RPA | Variável (`-ChaveEnv`) | Bases que a chave cobre |
|---|---|---|
| Vendas | `JANUS_CHAVE_RPA_VENDAS` | `vendas-produto` |
| Lançamentos | `JANUS_CHAVE_RPA_LANCAMENTOS` | `lancamentos-movimentacao`, `lancamentos-aberto` |
| Operação | `JANUS_CHAVE_RPA_OPERACAO` | `lancamentos-operacao` |
| Demonstrativo | `JANUS_CHAVE_RPA_DEMONSTRATIVO` | `demonstrativo-competencia` |

**A chave aparece uma vez só**, no modal de criação em `/admin/api-externa`; depois só existe o hash no
banco. Criar, conferir, revogar e rotacionar chaves: **`docs/runbooks/chaves-rpa-runbook.md`** (não repetido
aqui).

Forma preferida de gravar — não deixa o segredo no histórico do console (PSReadLine). Troque o NOME pela
linha da tabela:

```powershell
# cola o segredo no prompt (não aparece na tela nem no histórico) e grava — troque o NOME pela linha da tabela
$p = Read-Host 'Cole a chave' -AsSecureString
$b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($p)
try { [Environment]::SetEnvironmentVariable('JANUS_CHAVE_RPA_VENDAS', [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b), 'User') }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
```

A forma direta é equivalente, mas o segredo fica no histórico (apague a linha depois):
`[Environment]::SetEnvironmentVariable('<NOME>', '<chave>', 'User')`.

Variável de usuário só vale para processos **novos**, e só para o **mesmo usuário do Windows** que a gravou:
feche e reabra o PAD antes de testar, e rode o PAD com esse mesmo usuário.

## Parâmetros

| Parâmetro | O que é |
|---|---|
| `-Url` | base da produção (`https://...`, com ou sem barra final). Só `https` (a chave viaja no cabeçalho); a única exceção é `http://localhost`, para teste local |
| `-Base` | `demonstrativo-competencia` · `vendas-produto` · `lancamentos-movimentacao` · `lancamentos-aberto` · `lancamentos-operacao` |
| `-Arquivos` | 1..N caminhos. **Só Vendas aceita mais de um** (um por ano). Extensão: `.xlsx` nas quatro bases de Excel; `.csv` em `lancamentos-operacao`. Vários caminhos: **separados por `\|` (pipe), dentro de um único par de aspas** — o `powershell.exe -File` entrega a lista como um texto só |
| `-ChaveEnv` | **nome** da variável de ambiente com a chave |
| `-Log` | só `lancamentos-operacao`: o `.log` da RPA; as linhas `PULADA` viram `puladas` no passo 3 |
| `-ExtraidoEm` | ISO-8601 **com fuso**, ex. `2026-09-29T09:58:00-03:00` (o momento da extração) |
| `-Aplicar` | sem ele, conferência; com ele, aplica |

Validação local antes de qualquer rede (falha ⇒ código `1`): base conhecida, arquivos existem e não estão
vazios, mais de um arquivo só em Vendas, extensão pela base, `-Log` só em Operação, variável de ambiente
presente e não vazia.

## Códigos de saída (o que o PAD lê)

| Código | Significado |
|---|---|
| `0` | aplicada ou conferida (bateu com o modo pedido) |
| `1` | qualquer outra falha após as retentativas (validação local, rede, 5xx, 429, log inconsistente, assert de modo `FATAL:`) |
| `2` | rejeitada pelo servidor (422) — base intacta; o motivo está em `erro.codigo`/`erro.mensagem` |
| `3` | chave inválida ou sem escopo (401/403) |
| `4` | grafo (409 `DEPENDENCIA_AUSENTE`) — a base anterior do dia não foi carregada |
| `5` | arquivo grande demais (413) — 50 MB por arquivo, 200 MB por carga |

Em todo código diferente de `0` há **uma linha** no stderr (com `erro.codigo` e `erro.mensagem` do servidor
quando houver). Em sucesso, uma linha no stdout: `OK: status=... carga_id=... base=... linhas=...`.
A resposta inteira do último passo (sucesso ou erro) vai para `<primeiro-arquivo>.resposta.json` (UTF-8).

**Retentativas.** Só o transitório: falha de rede/timeout, HTTP 5xx, 429 e 409 com
`erro.codigo = CARGA_EM_ANDAMENTO` — até 3 tentativas por passo, com espera crescente (5 s, 15 s). **Não**
retenta 401/403/413/422 nem o 409 `DEPENDENCIA_AUSENTE` (os dois 409 se distinguem pelo `erro.codigo` do
corpo, não pelo status). Toda retentativa reusa o **mesmo** `carga_id` e o **mesmo**
`x-ingestao-idempotencia` (um UUID gerado por execução): se a carga já aplicou, o passo 3 repetido devolve a
resposta guardada (`idempotente: true`). Um `PUT` que responde "já existe" conta como sucesso — o passo 3
reconfere o sha256.

## A ordem do dia

```
Vendas ──► Movimentação e Aberto ──► Operação          Demonstrativo (independente)
```

Ordem de entrega recomendada: Vendas, depois Movimentação e Aberto, depois Operação. A dependência que o
servidor **faz cumprir** é uma só: **Operação exige Aberto aplicado no mesmo dia** — sem ele, código **`4`**
(`409 DEPENDENCIA_AUSENTE`), **também na conferência**. O Demonstrativo não depende de nada.

## A linha que o PAD executa

Use a ação do PAD que executa um comando e devolve o **código de saída** (por exemplo, "Executar comando
DOS"/"Run DOS command") e trate o código conforme a tabela. Trocar `C:\Janus\...` pelos caminhos reais.
A URL de produção usada abaixo (`https://wt-janus.vercel.app`) é a do runbook de autenticação — confirme
antes do 1º uso. Cada linha abaixo é **conferência**; para aplicar, acrescente ` -Aplicar` ao fim.

**Vendas** (um `.xlsx` por ano, separados por `|`):

```
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\Janus\rpa\entregar-ingestao.ps1" -Url https://wt-janus.vercel.app -Base vendas-produto -Arquivos "C:\Janus\saida\vendas-2024.xlsx|C:\Janus\saida\vendas-2025.xlsx|C:\Janus\saida\vendas-2026.xlsx" -ChaveEnv JANUS_CHAVE_RPA_VENDAS -ExtraidoEm 2026-09-29T09:58:00-03:00
```

**Lançamentos — Movimentação** e **Lançamentos — Aberto** (mesma chave, duas chamadas):

```
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\Janus\rpa\entregar-ingestao.ps1" -Url https://wt-janus.vercel.app -Base lancamentos-movimentacao -Arquivos "C:\Janus\saida\movimentacao.xlsx" -ChaveEnv JANUS_CHAVE_RPA_LANCAMENTOS -ExtraidoEm 2026-09-29T09:58:00-03:00
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\Janus\rpa\entregar-ingestao.ps1" -Url https://wt-janus.vercel.app -Base lancamentos-aberto -Arquivos "C:\Janus\saida\aberto.xlsx" -ChaveEnv JANUS_CHAVE_RPA_LANCAMENTOS -ExtraidoEm 2026-09-29T09:58:00-03:00
```

**Operação** (com o `.log` da RPA; aplicando):

```
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\Janus\rpa\entregar-ingestao.ps1" -Url https://wt-janus.vercel.app -Base lancamentos-operacao -Arquivos "C:\Janus\saida\operacao.csv" -Log "C:\Janus\saida\operacao.log" -ChaveEnv JANUS_CHAVE_RPA_OPERACAO -ExtraidoEm 2026-09-29T09:58:00-03:00 -Aplicar
```

**Demonstrativo**:

```
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\Janus\rpa\entregar-ingestao.ps1" -Url https://wt-janus.vercel.app -Base demonstrativo-competencia -Arquivos "C:\Janus\saida\demonstrativo.xlsx" -ChaveEnv JANUS_CHAVE_RPA_DEMONSTRATIVO -ExtraidoEm 2026-09-29T09:58:00-03:00
```

`-NonInteractive` evita que o PowerShell fique esperando um prompt caso falte um parâmetro (o script valida
tudo sozinho e sai com código `1`).

## O `.log` da RPA de Operação (`-Log`)

Uma linha por operação: `operacao;id;status;entradas;saidas;leituras`, com `status` = `OK` ou
`PULADA - <motivo>`; última linha `RESUMO;;puladas=N;;;`. O script envia no passo 3 uma entrada em
`puladas` para cada linha `PULADA` — `{ "operacao": <nome>, "ids": [<id>] (ou [] se o id vier vazio),
"motivo": <texto depois de "PULADA - "> }`. Log sem nenhuma pulada envia `puladas: []`. Se o `RESUMO` diz
`puladas=N` e o log tem outra quantidade de linhas `PULADA`, o script **não envia nada** e sai com código
`1` (log inconsistente). O log é lido como UTF-8 (com ou sem BOM); se os bytes não forem UTF-8 válido, como
Windows-1252.

Na **aplicação**, lista de puladas não vazia dispara o alarme `operacoes_puladas` e fica em `diff.puladas` da
linha de `ingestao.carga`; na **conferência** as puladas aparecem só na resposta (errata 4(b)/(f)).

## Diagnóstico rápido

| Sintoma | Onde olhar |
|---|---|
| código `3` | a variável existe? o nome bate com a tabela? a chave cobre a base? — `docs/runbooks/chaves-rpa-runbook.md` §2 e §4 |
| código `4` | a base anterior do dia foi **aplicada** hoje? (Operação exige Aberto) |
| código `2` | `erro.codigo` na linha do stderr e em `<primeiro-arquivo>.resposta.json`; base intacta |
| código `1` com `FATAL:` | o servidor fez o contrário do modo pedido — conferir `ingestao.carga` antes de rodar de novo |
| código `1` sem `FATAL:` | rede/servidor após 3 tentativas, ou validação local — a linha do stderr diz qual |
