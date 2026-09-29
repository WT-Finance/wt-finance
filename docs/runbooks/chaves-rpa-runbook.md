# Runbook — chaves de MÁQUINA das RPAs (`rpa-vendas`, `rpa-lancamentos`, `rpa-operacao`, `rpa-demonstrativo`) · v6.1.0

Quatro RPAs (Power Automate Desktop) entregam os crus do Monde ao Janus; cada uma tem **a sua**
chave `x-api-key`, com o **escopo mínimo** da base que entrega (decisão 2 do briefing da v6.1.0).
Uma chave só abre as bases marcadas no escopo — revogar uma derruba só aquela RPA, e a RPA errada
com a chave de outra é barrada com `403 ESCOPO_INSUFICIENTE`. O cliente que usa a chave é
`scripts/rpa/entregar-ingestao.ps1` (README em `scripts/rpa/README.md`); o contrato é
`docs/contratos/ingestao-v1.md` (§1 e **errata 4(g)**).

| Referência (chave) | Bases que a chave cobre (`escopo_bases`) | Rótulo que a tela mostra | Variável de ambiente na máquina da RPA |
|---|---|---|---|
| `rpa-vendas` | `vendas-produto` | Vendas por Produto | `JANUS_CHAVE_RPA_VENDAS` |
| `rpa-lancamentos` | `lancamentos-movimentacao` + `lancamentos-aberto` | Lançamentos por Movimentação · Lançamentos por Vencimento (em aberto) | `JANUS_CHAVE_RPA_LANCAMENTOS` |
| `rpa-operacao` | `lancamentos-operacao` | Lançamentos por Operação | `JANUS_CHAVE_RPA_OPERACAO` |
| `rpa-demonstrativo` | `demonstrativo-competencia` | Demonstrativo de Resultado (competência) | `JANUS_CHAVE_RPA_DEMONSTRATIVO` |

Os rótulos são `ROTULO_BASE` (`src/lib/ingestao/bases.ts`) — é o texto dos checkboxes do modal de
criação e da coluna "Ingestão:" da listagem.

**O que uma chave de RPA é (e não é).**
- **Segredo:** `jns_` + 40 hex (44 caracteres — `src/lib/api-externa/segredo.ts`). Só o **hash**
  sha256 fica em `app.api_chave.segredo_hash`; o claro aparece **uma vez**, na criação, e nunca mais.
- **Autoriza a porta HTTP, por base.** A rota `/api/ingestao/{base}` (e `/upload-url`) resolve a
  chave por hash e confere `escopo_bases`. A **promoção no banco** roda com a credencial `ingestor`
  (usuário `ingestor@janus.interno` — `docs/runbooks/credenciais-maquina-runbook.md`), não com a
  chave: a chave abre a porta, o `ingestor` faz o trabalho.
- **Só relatório, nada mais.** Desde a v6.1.0 uma chave com `escopo_bases` não vazio recebe
  `403 ESCOPO_INSUFICIENTE` na API de Solicitações (`/api/externo/*` — `autenticarChamadaSolicitacoes`,
  `src/lib/api-externa/http.ts`). O inverso também vale: a chave de integrador de Solicitações
  (escopo vazio) não abre nenhuma base.
- **A origem da carga é decidida pela chave:** chamada com `x-api-key` grava `rpa-pad` (ou
  `rpa-cloud`); `manual`/`reprocesso` são só da sessão do card (errata 4(g)).
- **O robô Auth de cada chave** (`integracao-<referência>@janus.internal`, ex.:
  `integracao-rpa-vendas@janus.internal`) é uma conta do Supabase Auth com senha aleatória
  descartada e vínculo RBAC `ativo = false`, sem role: **nunca loga, nunca passa em
  `app.exigir_acesso`**. Existe só porque `app.api_chave.robo_user_id` exige um usuário (FK).
  Não é alavanca de nada: ativar/desativar/apagar esse usuário não muda o que a chave pode. **Não
  confundir** com `ingestor@janus.interno` (ativo, com role de máquina) — domínios `.internal` × `.interno`.
- **Trilha:** toda chamada com chave, inclusive a negada, vai para `app.api_chamada_log`
  (tela `/admin/api-externa` → "Ver log", últimas 50 por chave); a carga **aplicada** vira linha em
  `ingestao.carga` com `chave_id`, e `/admin/ingestao` mostra a coluna "quem" como
  **`API · <referência>`** (migration 0281). Conferência (`confirmar: false`) não grava linha de
  carga — só aparece no log de chamadas e na resposta.

## 1. Criar (uma vez por RPA — quem cria é o Yan; a sessão nunca vê o segredo)

Quem cria precisa da área **`solicitacoes`** (é a área da tela `/admin/api-externa` e das RPCs
`api_chave_*`). Ver a carga depois em `/admin/ingestao` exige **`admin/uploads`**.

1. Abrir `/admin/api-externa` → seção "Chaves de API" → **Nova chave de API**.
2. **Referência:** exatamente o nome da tabela acima, em minúsculas com hífen (`rpa-vendas`…). É
   único no banco **inclusive entre chaves já revogadas** e vira o e-mail do robô e o "quem" das cargas.
3. **Bases de ingestão:** marcar **só** as bases da tabela (`rpa-lancamentos` = **duas**; as demais, uma).
   Deixar sem marcar não cria uma chave de RPA — cria chave de Solicitações. O escopo **não se edita
   depois** (uma chave só tem dois estados: criada e revogada).
4. **Criar chave.** O modal mostra o segredo `jns_…` **uma vez**. Antes de fechar: gravá-lo na variável
   da máquina da RPA (passo abaixo). Fechou sem guardar ⇒ a única saída é revogar e criar outra (§2).
5. Repetir para as quatro. Cada RPA usa **só a variável dela** (`-ChaveEnv` com o nome da tabela); o
   segredo de uma nunca é gravado na variável de outra.

**Guardar (máquina da RPA, PowerShell 5.1, usuário que roda o PAD).** Variável de ambiente do
**usuário**; nunca arquivo, planilha, e-mail, chat, ticket ou print. Prefira a forma que **não deixa o
segredo no histórico do console** (o PSReadLine grava a linha digitada em
`%APPDATA%\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt`):

```powershell
# cola o segredo no prompt (não aparece na tela nem no histórico) e grava — troque o NOME pela linha da tabela
$p = Read-Host 'Cole a chave' -AsSecureString
$b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($p)
try { [Environment]::SetEnvironmentVariable('JANUS_CHAVE_RPA_VENDAS', [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b), 'User') }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
```

A forma direta é equivalente, mas o segredo fica no histórico (apague a linha depois):
`[Environment]::SetEnvironmentVariable('<NOME>', '<chave>', 'User')`.

Depois de copiar do modal, **limpe a área de transferência** (copie qualquer outro texto; se o
histórico do Windows — `Win+V` — estiver ligado, apague a entrada). Variável de usuário só vale para
processos **novos**: feche e reabra o PAD/console antes de testar.

## 2. Conferir (sem exibir o segredo)

**Que a variável existe e tem o formato certo** (nunca imprime a chave — só o tamanho):

```powershell
([Environment]::GetEnvironmentVariable('JANUS_CHAVE_RPA_VENDAS','User')).Length      # esperado: 44
([Environment]::GetEnvironmentVariable('JANUS_CHAVE_RPA_VENDAS','User')).StartsWith('jns_')   # esperado: True
```

Saída vazia — ou erro "cannot call a method on a null-valued expression" na segunda linha — =
variável inexistente. Outro tamanho = segredo truncado ou com espaço/quebra de linha.

**Que as quatro chaves existem com os escopos certos:** a listagem de `/admin/api-externa` mostra, por
chave, "Ingestão: <rótulos>", status (ativa/revogada) e "última chamada". Compare com a tabela do topo.
A sessão confere o mesmo pela RPC `api_chave_listar` (não devolve segredo nem hash) — ela emite
`escopo_bases` por chave.

**Que cada chave funciona e SÓ na base dela** (é o GATE da M5):
- conferência da base certa ⇒ exit `0`, e a "última chamada" da chave passa a ter data;
- prova negativa: a chave de `rpa-operacao` entregando Vendas ⇒ `403 ESCOPO_INSUFICIENTE` (exit `3`),
  visível em "Ver log" de `rpa-operacao` (status 403, detalhe `auth_negada`). Barreira não vista
  negando não vale;
- a mesma chave em `/api/externo/*` ⇒ `403 ESCOPO_INSUFICIENTE`, detalhe `escopo_insuficiente: chave de
  ingestão na API de Solicitações`.

## 3. Revogar / rotacionar — duas alavancas, alcances diferentes

**Alavanca 1 — revogar UMA chave (derruba só aquela RPA, sem tocar nas outras).** `/admin/api-externa`
→ ícone de revogar na linha da chave → digitar a referência para confirmar (`api_chave_revogar(id)`,
`revogarChaveApi`). Efeito: a partir da próxima chamada `api_chave_resolver` não acha mais a chave ⇒
`401 AUTH_INVALIDA` (exit `3`). Propriedades:
- **Irreversível:** nenhuma RPC reativa. Voltar = criar uma chave **nova**.
- **Não afeta as outras três chaves** (cada uma é uma linha em `app.api_chave`) nem as cargas já aplicadas.
- **Não remove nem desativa o robô Auth** (ele nunca esteve ativo); a linha da chave fica na listagem
  como revogada.
- Carga **em andamento** que já passou do passo 1 e é cortada antes do passo 3 termina com 401; o
  arquivo enviado ao Storage sem virar carga é apagado em 7 dias (errata 3(b)).

**Rotacionar (chave vazou, foi perdida ou o escopo está errado).** A referência é **única para sempre**
e o e-mail do robô deriva dela, então recriar com o mesmo nome **falha** (o Auth recusa o e-mail já
cadastrado). Faça em ordem, para a RPA não ficar sem chave:
1. Criar a nova com **outra referência** e o mesmo escopo, ex.: `rpa-vendas-2` (vira
   `integracao-rpa-vendas-2@janus.internal`; a carga aparecerá como `API · rpa-vendas-2`).
2. Gravar o novo segredo na **mesma** variável (`JANUS_CHAVE_RPA_VENDAS`) — sobrescreve o valor; o
   README do cliente não muda porque só conhece o nome da variável.
3. Conferir (§2) com uma conferência da base.
4. Só então revogar a antiga (`rpa-vendas`).

Escopo errado (marcou base a mais ou a menos) não tem edição: é o mesmo procedimento — cria outra com o
escopo certo, troca a variável, revoga a errada.

**Alavanca 2 — desativar o usuário `ingestor@janus.interno` (emergência geral; NÃO é por RPA).** Vale
para **todas as quatro RPAs e para o card `/admin/uploads`**, porque toda promoção usa essa credencial
(`src/lib/supabase/ingestor.ts`). Pela tela `/admin/acessos` ou pelo SQL do runbook de credenciais de
máquina (`docs/runbooks/credenciais-maquina-runbook.md` §2). A chave continua "válida" e as chamadas
passam da porta HTTP; a promoção é que é negada no banco (`USUARIO_INATIVO` enquanto o token de máquina
ainda vive, permissão negada no login seguinte) e a RPA provavelmente vê uma falha de servidor
(`500 ERRO_INTERNO`, exit `1`), **não** um 401/403. Use quando o problema é "parem todas as cargas", não "esta RPA está comprometida".

| Situação | Alavanca |
|---|---|
| Chave de uma RPA vazou/foi perdida/máquina comprometida | 1 — revogar **aquela** chave e rotacionar |
| A carga automática está aplicando dado errado e ninguém sabe a causa | 2 — desativar `ingestor@janus.interno` (para tudo, inclusive o card); depois reativar |
| Só uma base está errada | 1 na chave daquela RPA (ou desligar a RPA); a alavanca 2 é grande demais |

## 4. Sintomas e diagnóstico (do ponto de vista da CHAVE)

Códigos de saída do cliente (`scripts/rpa/entregar-ingestao.ps1`, briefing §4-D): `0` aplicada/conferida
· `2` rejeitada (422) · `3` chave inválida/sem escopo (401/403) · `4` grafo (409) · `5` arquivo grande
demais (413) · `1` qualquer outra falha após as retentativas. O código HTTP e `erro.codigo` completos
ficam em `<primeiro-arquivo>.resposta.json`.

| Sintoma | Causa provável | Onde olhar / o que fazer |
|---|---|---|
| exit `1`, stderr "a variavel de ambiente `<NOME>` esta ausente ou vazia" (**não** é `3`/`401`) | a variável **não chegou** ao processo: nome errado em `-ChaveEnv`, variável não gravada, ou o PAD/console foi aberto **antes** de gravar. O cliente recusa **localmente, antes de qualquer rede** — nenhuma chamada sai, então também não há linha em "Ver log" | §2 (`.Length`); reabrir o PAD; conferir o nome da variável contra a tabela do topo |
| exit `3`, `401 AUTH_INVALIDA` | segredo digitado/colado errado ou truncado (tamanho ≠ 44), **ou chave revogada** | §2 (`.Length`/`StartsWith`); na listagem, a chave aparece como revogada? Se sim, rotacionar (§3). Chamada com segredo desconhecido/revogado é registrada com `chave_id` **nulo** — **não** aparece no "Ver log" de nenhuma chave (só em `app.api_chamada_log`) |
| exit `3`, `403 ESCOPO_INSUFICIENTE` numa base que a RPA deveria cobrir | **variável trocada entre RPAs** (ex.: `JANUS_CHAVE_RPA_VENDAS` com o segredo da `rpa-operacao`), ou a chave nasceu sem a base no escopo | "Ver log" da chave: aparece 403 com a chamada negada (o 403 **é** vinculado à chave). Conferir o escopo na listagem; se a chave está certa, regravar a variável com o segredo da RPA certa; se o escopo está errado, criar outra (§3 — escopo não se edita) |
| exit `3` só em `/api/externo/*` | chave de ingestão usada na API de Solicitações (errata 4(g)) — esperado | usar a chave de integrador (escopo vazio) para Solicitações; não há como "liberar" |
| `rpa-lancamentos` entrega Movimentação mas 403 no Aberto (ou o inverso) | a chave foi criada com **uma** das duas bases | §3, escopo errado |
| exit `2` com `FORMATO_INVALIDO` citando **"origem contradiz a credencial"** | o cabeçalho `x-ingestao-origem` não é `rpa-pad`/`rpa-cloud` numa chamada com chave — o cliente versionado não faz isso; indica script alterado ou chamada manual | usar o cliente do repositório; a origem é decidida pela credencial (errata 4(g)) |
| exit `1` logo após desativar `ingestor@janus.interno` | alavanca 2 acionada (a chave está boa) | `SELECT email, ativo FROM app.rbac_usuarios WHERE email = 'ingestor@janus.interno'` |
| criar chave falha com "Não foi possível criar o usuário-robô: … already been registered" / `PLATAFORMA_EM_USO` | referência já usada — **inclui as revogadas** | escolher outra referência (§3, `-2`) |
| criar chave falha com `PERMISSAO_NEGADA` | quem criou não tem a área `solicitacoes` | `/admin/acessos` |
| "Ver log" mostra 200 mas nenhuma linha em `/admin/ingestao` | era **conferência** (não grava carga) ou a tela exige `admin/uploads` | rodar com `-Aplicar` para a base; conferir a área |

## 5. O que NÃO fazer

- **Não reaproveitar um segredo em duas RPAs**, nem criar uma chave "universal" com as cinco bases
  "para facilitar": o escopo mínimo é a prova de que a RPA de Operação não consegue entregar Vendas.
- **Não guardar o segredo fora da variável de ambiente do usuário da máquina da RPA** — arquivo,
  planilha, e-mail, chat, ticket, print, `.env` do repositório, mensagem de commit ou out-briefing.
  Nem colar no `-ChaveEnv`: o parâmetro recebe o **NOME** da variável, nunca a chave.
- **Não tentar recuperar o segredo** (não existe "ver de novo"; só o hash está no banco). Perdeu ⇒ §3.
- **Não apagar o robô `integracao-<referência>@janus.internal`** no Auth nem em `app.rbac_usuarios`:
  `app.api_chave.robo_user_id` referencia o vínculo RBAC dele (FK sem cascade) e a listagem faz JOIN
  com ele; apagar quebra a chave e não é necessário — revogar a chave já basta.
- **Não desativar `ingestor@janus.interno` para "revogar uma RPA"**: derruba as quatro e o card.
- **Não reaproveitar a chave de Solicitações** (escopo vazio) nem a de ingestão na API alheia: o 403 é o
  desenho, não um defeito a contornar.
- **Não recriar uma chave revogada com o mesmo nome**: falha; rotacione com `-2`.
