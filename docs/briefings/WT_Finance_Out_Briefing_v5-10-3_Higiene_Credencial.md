# Out-Briefing v5.10.3 — Higiene de credencial e a convenção que voltou a descrever a realidade

**Rota:** C (patch, a spec é o prompt) · **Data:** 14/09/2026 · **Branch:** `feat/v5-10-3-role-verificador`
**Migration:** nenhuma · **ADR:** nenhum · **Suíte:** **1.225** testes (1.220 + 5 casos novos), 74 arquivos, zero `skip`
**Mudança de comportamento da aplicação:** nenhuma. Nenhum arquivo de `src/` fora de teste.

> **Contexto.** A v5.11.0 (role `verificador`, credencial de varredura com privilégio mínimo) foi
> **adiada para a v6** por bloqueio operacional; o risco de varrer produção com `service_role` fica
> **aceito por decisão do Yan**. Este patch fecha só o que não depende da role: tirar do repositório
> o molde do erro, e fazer a convenção descrever a realidade.

---

## 1. Frente A — o molde do incidente sai do repositório

### 1.1 A varredura foi da CLASSE, não do arquivo citado

`grep` por `SUPABASE_SERVICE_ROLE_KEY` / `service_role` em `docs/**`, `scripts/**`,
`supabase/seed/**`, `supabase/**` e todo `.mjs`/`.ts` fora de `src/`. A varredura bruta devolve
~60 linhas, e **a maioria não é credencial**: `GRANT … TO service_role` em migrations e ADRs é
gramática SQL de privilégio, não uma chave carregada por um processo. Filtrando por **quem lê a
chave**, o conjunto fecha em quatro pontos fora de `src/`:

| `caminho:linha` | O que é | Destino |
|---|---|---|
| `docs/auditoria-v5/_insumos/bloco5-verifica-pos-drop.mjs:16` | varredura pontual pós-`0270`; lê o `.env.local` por caminho absoluto e chama RPCs em série | **REMOVIDO** |
| `scripts/dre-oracle.mjs:25` | oráculo antes/depois da DRE: **uma** RPC de leitura nomeada, com argumentos | declarado |
| `.env.example:8` · `README.md:47,51` | declaração de onboarding — nomeiam a chave, não a portam | declarado |
| `supabase/patches/RESTORE-incidente-varredura-rest.mjs` | recuperação do incidente **ainda aberto**; vai pelo `pg` do backup-gate, **não usa a chave** | declarado |

### 1.2 O que foi apagado, e a prova no ato

`bloco5-verifica-pos-drop.mjs` era **exatamente o molde**: credencial que pula
`app.exigir_acesso` (ramo *trusted*) + laço sobre RPCs, pronto para a próxima sessão copiar quando
precisasse "conferir se algo quebrou". Já cumprido — a `0270` está aplicada e o resultado
transcrito no out-briefing da v5.10.0 (*"0269 e 0270 aplicadas e verificadas via REST/service_role"*).
**O registro é o out-briefing, não o executável.**

Grep de prova rodado **no ato** e transcrito no commit `5ff9100`, varrendo também `docs/runbooks/`
e `docs/adr/` (lição do `getPool`: um export "órfão" que o runbook de recuperação importava):

```
$ grep -rn bloco5-verifica-pos-drop docs scripts supabase src .claude package.json README.md CHANGELOG.md
supabase/migrations/0270_v5_10_0_drop_objetos_orfaos.sql:291:--    Script pronto: `node docs/…`
```

Uma citação só, e num comentário de **migration já aplicada** — que não se reescreve. O comentário
fica apontando para um arquivo que não existe mais; é o preço correto, e está registrado aqui.

### 1.3 O que NÃO foi apagado, e por quê

- **`scripts/dre-oracle.mjs`** — não é varredura: lê **uma** RPC nomeada com argumentos. E já foi
  triado: achado **D1-003** da auditoria da v5 ("descartar", ou seja manter), exceção registrada em
  `knip.json`, citado por `ADR-0168:94,185`, por `docs/estado-do-projeto.md` e pela própria skill
  `banco-e-rpc:501` **como modelo** de oráculo antes/depois. Apagá-lo reverteria uma decisão
  registrada.
- **`supabase/patches/RESTORE-incidente-varredura-rest.mjs`** — o incidente das 306.261 linhas
  **segue aberto**. É `--confirmar` humano por desenho e não carrega a chave de serviço.
- **`docs/auditoria-v5/_insumos/{contar-classes,mapa-rpc-chamadores}.mjs`** — zero credencial, zero
  banco: leem arquivo e geram as tabelas citadas como **evidência** em `relatorio.md:25` e em dez
  achados de D1/D2/D9. Apagá-los romperia a rastreabilidade do relatório sem fechar risco nenhum.

Os três blocos ficaram registrados em **`docs/estado-do-projeto.md` §9**, cada um com a linha de
porquê — que é o formato "ponto declarado" pedido pela spec.

---

## 2. Frente B — os consumidores de `SUPABASE_DB_URL` eram cinco, não três

### 2.1 O defeito era de leitura, não de contagem

A skill `banco-e-rpc` §6 terminava com *"três arquivos; o próximo é o 4º"*. A frase estava certa
**sobre o que ela dizia** (testes que escrevem contra produção), e vinha sendo lida como o
inventário da **credencial de conexão direta** — que é outra coisa: `SUPABASE_DB_URL` é o pooler em
session mode (ADR-0119), **fora do PostgREST e fora de `exigir_acesso`**. Os dois que faltavam não
eram teste-que-escreve, e é por isso que ninguém sentiu falta deles.

| Consumidor | Classe |
|---|---|
| `src/lib/dre/reverter-diario.test.ts:18` | escreve-e-reverte (`0268`) |
| `src/lib/monde/virada-paridade.test.ts:13` | escreve-e-reverte (`0181`) |
| `src/lib/api-externa/contrato-api-externa.test.ts:54` | exceção: fixture **commitada**, limpa em `afterAll` |
| `src/lib/rpc-contrato.test.ts:1890` | **somente leitura** → ganhou a trava |
| `scripts/db-gate/lib.mjs:49` | infra do backup-gate: `COPY OUT` do backup, `COPY IN` da recuperação |

### 2.2 A trava

Os **dois** helpers `comCliente` do `rpc-contrato.test.ts` (o bloco da `0267` e o da `0269`) passam
a emitir, como primeiro comando depois do `connect()`:

```ts
await c.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')
```

Por que isso é mais do que documentação de intenção: o Postgres passa a **recusar** qualquer
escrita naquela conexão (`cannot execute … in a read-only transaction`) — **inclusive a que uma
função faria por dentro**, que é precisamente o que a leitura do texto do teste não enxerga. É o
mesmo argumento que fez a sonda da v5.9.6 ser *allowlist* e não blacklist de `INSERT`/`UPDATE`.

`CHARACTERISTICS` e não `SET TRANSACTION`: vale para toda transação **implícita** da sessão, sem
exigir um `BEGIN` — e abrir `BEGIN` num bloco declarado somente-leitura reprovaria a própria
declaração na sonda. Precedente da trava: a medição do baseline da v5.4.5.

**Prova viva:** os 143 casos do `rpc-contrato.test.ts` rodaram verdes **já com a trava** contra
produção. Se ela tivesse atrapalhado as leituras de catálogo, a suíte diria.

### 2.3 Enforcement (régua de 5 destinos, destino 1)

`src/lib/sonda-teste-escreve-banco.test.ts` ganhou uma segunda parte, no molde da primeira (análise
estática da **fonte**, listas inline, nada executado): o inventário de
`process.env.SUPABASE_DB_URL` passa a ser **fechado** — varre `src/`, `scripts/` e `supabase/`, e
cada consumidor tem de cair em uma de quatro listas (`ESCREVEM_E_REVERTEM_HOJE`,
`EXCECOES_CONHECIDAS`, **`INFRA_DECLARADA`** — nova — ou `SOMENTE_LEITURA`); quem não
escreve-e-reverte e não é infra declarada precisa da trava. **5 → 10 casos.**

Detecção por `process.env.SUPABASE_DB_URL` **literal**, de propósito: `sonda-skipif-silencioso`
cita `'SUPABASE_DB_URL'` como *string* numa lista declarativa e não abre conexão nenhuma — **citar
não é consumir**, e uma regex frouxa transformaria a sonda numa fonte de falso positivo.

### 2.4 Vista vermelha antes de valer

Sonda que não foi vista reprovando não vale. Mutante: `src/lib/__mutante-readonly.test.ts`, um
arquivo que abre `pg` por `SUPABASE_DB_URL`, sem trava e fora das listas. Os **dois casos novos**
reprovaram nomeando-o:

```
× o inventário de consumidores de SUPABASE_DB_URL é a lista fechada declarada
  + "src/lib/__mutante-readonly.test.ts"
× quem lê SUPABASE_DB_URL sem escrever-e-reverter abre com SET SESSION … READ ONLY
  + "src/lib/__mutante-readonly.test.ts — abre pg por SUPABASE_DB_URL, não está declarado
     como escreve-e-reverte e não trava a sessão em READ ONLY"
```

(mais os dois casos da primeira parte, que já o pegavam por `BEGIN`/`ROLLBACK`/`lock_timeout` — o
que mostra que as duas partes se sobrepõem por desenho, e não se substituem.) Mutante removido;
árvore de trabalho limpa, que é parte da prova.

### 2.5 Skill atualizada

`.claude/skills/banco-e-rpc/SKILL.md` §6 ganhou a subseção **"Quem se conecta por `SUPABASE_DB_URL`:
são CINCO, e quem só lê trava a sessão"** — a tabela dos cinco, a regra da trava com o porquê do
`CHARACTERISTICS`, e a nota de que a sonda cobra **as duas coisas** (inventário + trava). A tabela
só volta a derivar se alguém mexer nas duas ao mesmo tempo, que é o ponto: **a contagem deixou de
ser prosa**.

---

## 3. Frente C — carona: a lição da v5.10.2 que ficou proposta

`.claude/skills/email/SKILL.md` §1 ganhou **"A suíte MOCKA o nodemailer — ela não prova a
biblioteca"**. `email.test.ts:8` faz `vi.mock('nodemailer', …)`: substitui o **transporte inteiro**.
Correto para o que ela testa (config, fallback, corpo, códigos SMTP) e é o que a deixa rodar
offline — mas **nenhum caso executa uma linha de nodemailer**. Suíte verde depois de um bump prova
que *o nosso código* não regrediu; não prova a biblioteca. E a major da v5.10.2 mexia justamente na
camada que o mock apaga: MIME, `attachments`, CID, SMTP.

Regra registrada: bump do transporte exige envio **real** pela camada de verdade (`src/lib/email/`,
não um script paralelo que remonta a mensagem), em **MODO TESTE fail-closed**, com conferência no
**Outlook real** e o anexo comparado **por bytes** (igualdade de bytes é afirmação sobre o encode
inteiro; "a imagem apareceu" é sobre o renderizador). Mais o contra-lado, que também custou:
**antes de chamar de regressão, ache o controle** — o `<img cid:>` sumido era o Graph, não a major.

---

## 4. Parecer da revisão

**`revisor`** (contexto limpo, 9 arquivos lidos) — **APROVADO COM RESSALVAS**. Zero CRÍTICO, zero
ALTO.

### MÉDIO — **corrigido antes do fechamento**

> *"A trava READ ONLY é verificada por ARQUIVO, não por CONEXÃO. `rpc-contrato.test.ts` tem duas
> funções `comCliente` independentes, cada uma abrindo seu próprio `pg.Client`; hoje as duas travam,
> então não há violação ativa — mas se alguém acrescentar um terceiro bloco sem repetir a trava, a
> sonda continua verde, porque a regex encontra a trava presente **em algum lugar** do arquivo."*

O revisor estava certo, e o achado é exatamente o cenário "arquivo com duas conexões onde só uma
trava". A trava é de **sessão**: a de um bloco não alcança a conexão do outro, então a unidade de
verificação tem de ser a **conexão**, não o arquivo. A sonda ganhou `aberturasSemTrava()`, que fatia
o texto em cada `new pg.Client(`/`new pg.Pool(` e exige a trava **dentro da fatia**, mais um caso
próprio (10º).

**E o caso novo foi visto vermelho**, como manda a regra que esta própria versão reforça — corrigir
um achado é escrever código novo, e código novo pede a mesma desconfiança: acrescentei um terceiro
`pg.Client` sem trava ao `rpc-contrato.test.ts` (que já trava nos outros dois) e ele reprovou
**sozinho**, com os outros 9 verdes:

```
× a trava vale por CONEXÃO: toda abertura de pg.Client/pg.Pool nesses arquivos trava a própria sessão
  AssertionError: src/lib/rpc-contrato.test.ts — 1 abertura(s) de conexão sem a trava READ ONLY
  na própria sessão; a trava de outro bloco do mesmo arquivo não alcança esta
```

Que **só** esse caso tenha reprovado é a prova de que era mesmo o ponto cego: o cheque por arquivo
passou no mutante. Mutante restaurado byte a byte (o arquivo nem aparece como modificado).

### BAIXO — registrado, não endereçado

- **`LE_DB_URL` é textual, não semântica.** `const { SUPABASE_DB_URL } = process.env`,
  `process.env['SUPABASE_DB_URL']` ou uma variável reexportada de outro módulo escapariam do
  inventário. É limitação inerente a sonda de análise estática por regex — a mesma classe que a
  skill já reconhece para `ABRE_PG` —, **não** algo introduzido aqui. Fechá-la de verdade pediria
  análise de AST, que é outra versão. Fica registrado para quando um sexto consumidor nascer com
  forma diferente.
- **O revisor não tem ferramenta de git**, então não conferiu o texto do grep transcrito no commit
  `5ff9100` — conferiu a **realidade atual do repositório**, que é o que decide o merge, e a
  confirmou: nenhuma referência viva ao arquivo removido em `src/`, `scripts/`, `supabase/`,
  `docs/`, `.claude/`, `knip.json` ou `package.json`, fora a citação na `0270` já aplicada.

### O que o revisor verificou e **não** gerou achado (com prova)

Exclusão da Frente A segura (grep amplo); justificativas dos arquivos mantidos se sustentam
(`dre-oracle.mjs` chama **uma** RPC nomeada; `RESTORE-incidente` nem carrega a chave — grep vazio);
a trava é o **primeiro** comando após `connect()` nos dois blocos e não há caminho que abra `pg` por
fora deles; a tabela dos 5 consumidores da skill §6 bate arquivo por arquivo com o repositório, sem
sexto; `email.test.ts:8` mocka mesmo o nodemailer inteiro; sem escopo além do pedido, sem
`console.log` residual, sem segredo hardcoded.

**`revisor-db`: N/A declarado** — zero migration, zero RPC. **`verificador-visual`: N/A declarado** —
nenhuma UI tocada.

### Auto-auditoria adversarial (depois das correções da revisão)

Rodada **após** o fix do MÉDIO, que é a ordem que a v5.9.0 ensinou. Confrontos feitos contra a spec:
as três frentes existem e estão completas; a spec dizia "a suíte tem de fechar em 1.220 testes, 0
skip — teste que sumir ou virar skip é regressão" e **nenhum teste sumiu nem virou skip** (1.220 →
1.225 é crescimento pelos 5 casos de sonda novos, não substituição); "zero mudança em `src/` fora do
teste" foi respeitado ao pé da letra (os únicos arquivos de `src/` tocados são dois `.test.ts` e o
`changelog-diretoria.ts` do bump, que é dado, não comportamento); e a spec pedia apagar "os
scripts" no plural — apaguei **um**, e o porquê de cada não-exclusão está em §1.3, para o Yan
discordar se quiser.

---

## 5. Gates

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | limpo (por frente e no fechamento) |
| `npm run lint` | limpo, zero warning novo |
| `npm test` | **1.225 passed**, 74 arquivos, **zero `skip`** |
| `npm run build` | verde |
| `npm audit` | **0 vulnerabilidades** (confirma o zero da v5.10.2) |

**`.env.local` presente na worktree** (symlink para o checkout raiz) — conferido **antes** de rodar
a suíte, que é a lição da v5.4.3: sem ele, ~180 casos se auto-skipam e a suíte parece verde por
omissão.

**Banco: N/A declarado.** Zero migration, zero RPC — logo, `db:migrate` não roda, `revisor-db` não
se aplica e `src/types/database.ts` **não** se regenera (o gerador só muda quando o catálogo muda).
**UI: N/A declarado** — `verificador-visual` não se aplica; nenhuma tela foi tocada.

### 5.1 Achados de ambiente, registrados

- **O `node_modules` da worktree era um symlink para o checkout raiz**, e o Turbopack recusa
  symlink que aponte para fora da raiz do projeto (`Symlink [project]/node_modules is invalid, it
  points out of the filesystem root`) — o `npm run build` abortava com `TurbopackInternalError`.
  `tsc`, `lint` e `vitest` atravessam o symlink sem reclamar; **só o build não**. Resolvido com um
  `npm ci` real dentro da worktree (`node_modules` é git-ignored; o checkout raiz não foi tocado).
  Vale para qualquer worktree futura montada assim.
- **`DeprecationWarning` do `pg`** (`client.query()` com o cliente já executando uma consulta,
  removido no `pg@9`) aparece no `npm test`. **Não é desta versão**: isolado, vem de
  `reverter-diario`/`virada-paridade`, arquivos não tocados aqui; `rpc-contrato` e
  `contrato-api-externa` rodados sozinhos não o emitem. Registrado para quando o `pg@9` chegar.

---

## 6. Arquivos

| Arquivo | O quê |
|---|---|
| `docs/auditoria-v5/_insumos/bloco5-verifica-pos-drop.mjs` | **removido** |
| `docs/estado-do-projeto.md` | §9 — pontos declarados de credencial de serviço |
| `src/lib/rpc-contrato.test.ts` | trava read-only nos dois helpers `comCliente` |
| `src/lib/sonda-teste-escreve-banco.test.ts` | segunda parte: inventário fechado + trava por conexão (5 → 10 casos) |
| `.claude/skills/banco-e-rpc/SKILL.md` | §6 — os cinco consumidores, a trava, o enforcement |
| `.claude/skills/email/SKILL.md` | §1 — a suíte mocka o transporte |
| `CHANGELOG.md` · `src/data/changelog-diretoria.ts` · `package.json` | entrada e bump 5.10.3 |
| `docs/WORKING-CONTEXT.md` | estado |

---

## 7. Aprendizado — régua de 5 destinos

| Aprendizado | Destino | Onde ficou |
|---|---|---|
| Consumidor de `SUPABASE_DB_URL` que só lê trava a sessão; o inventário é fechado | **1 — enforcement** | `sonda-teste-escreve-banco.test.ts` (5 casos novos) |
| Script de varredura pontual não sobrevive ao cumprimento da missão — o registro é o out-briefing | **4 — skill/doc** | `docs/estado-do-projeto.md` §9 |
| Os cinco consumidores, nominalmente, e a regra da trava | **4 — skill** | `banco-e-rpc` §6 |
| Suíte que mocka o transporte não prova a biblioteca; ache o controle antes de chamar de regressão | **4 — skill** | `email` §1 |
| Contagem em prosa deriva — quando uma contagem vira gatilho de decisão, ela tem de ser mecânica | **1 — enforcement** | o caso "inventário é a lista fechada" |

**Nada foi para o core.** Nenhum dos itens é transversal a toda sessão: os dois primeiros já estão
segurados por máquina, e os demais são situacionais de um domínio. Adicionar é também podar — e o
core continua em pé sem eles.

---

## 8. Pendências e o que aguarda decisão humana

- **Role `verificador` → v6.** O risco de varredura com `service_role` segue **aceito**; o item
  continua no `docs/backlog-v6.md`.
- **Comentário órfão na `0270:291`** — cita o script removido. Migration aplicada não se reescreve;
  fica registrado aqui.
- **Merge é do Yan.** O PR sai como **draft**.
