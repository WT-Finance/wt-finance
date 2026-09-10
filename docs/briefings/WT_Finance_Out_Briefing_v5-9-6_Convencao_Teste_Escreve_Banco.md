# Out-Briefing v5.9.6 — Convenção de teste que ESCREVE no banco

**Tipo:** PATCH · **Rota C** (o prompt do Yan é a spec; sem briefing em `docs/briefings/`) · **Branch:**
`fix/v5-9-6-convencao-teste-escreve-banco` · **Base:** `main` (v5.9.5 + docs, `c377fea`) · **Migration:** nenhuma ·
**ADR:** nenhum · **Código de produção:** intocado · **Testes:** 1207 (de 1202).

Fechamento em 10/09/2026. Merge humano pendente.

## 1. A decisão registrada

**Decisão de método (10/09/2026):** teste que precisa escrever no banco para provar o comportamento de uma RPC
pode rodar contra produção dentro de transação revertida. **Padrão aceito, não exceção** — com contrato
obrigatório:

| Cláusula | Por quê |
|---|---|
| uma transação **por caso** (`it`), nunca uma para o arquivo | fixture em `beforeAll` é escrita fora de transação |
| `describe.skipIf(!SUPABASE_DB_URL)` | offline o gate pula, não quebra |
| linhas escolhidas **dinamicamente**, nunca id fixo | a base muda; id fixo apodrece em silêncio |
| chave sintética `ZZ_TESTE_<migration>` no dado escrito | resíduo, se um dia sobrar, é reconhecível e apagável |
| `SET LOCAL lock_timeout` | duas suítes concorrentes em worktrees diferentes travam disputando lock até o timeout do runner, em vez de falhar rápido (MÉDIO do `revisor` na v5.9.5) |
| `SAVEPOINT` em volta da chamada que pode falhar | o erro não derruba a transação do caso antes de conferir o estado |
| nenhum `COMMIT` | nada persiste |

Referência: `src/lib/dre/reverter-diario.test.ts` (0268, v5.9.5), que já cumpria tudo.

**Gatilho de reavaliação:** à **terceira ou quarta RPC** testada assim, reabrir a decisão de **ambiente de teste
próprio** (staging/branching). Este caminho é para quando escrever é a **única** prova, não para conveniência.

## 2. O que foi entregue

1. **Skill `banco-e-rpc` §6** — subseção "Provar comportamento de RPC que ESCREVE", junto da nota sobre `db query`
   não executar o corpo: a decisão, o contrato, a referência, o enforcement, a exceção conhecida e o gatilho.
2. **Checklist inline do `revisor-db`** (D-12) — item em "Contrato com o app": a sonda pega a FORMA; o revisor cobra
   a ESCOLHA (escrever é a única prova?) e conta para o gatilho.
3. **Sonda `src/lib/sonda-teste-escreve-banco.test.ts`** (régua, destino 1), desenho **allowlist**: TODO
   `src/**/*.test.ts` que obtém o driver `pg` é alvo e precisa de `BEGIN`/`ROLLBACK`/`lock_timeout`/`skipIf` sem
   `COMMIT`, salvo se declarado somente-leitura (e provado). Cinco casos: (a) a referência é reconhecida como alvo;
   (b) a allowlist só lê; (c) nenhum alvo viola; (d) cada exceção **ainda existe e ainda viola**; (e) a **contagem do
   gatilho é mecânica** (lista fechada; arquivo novo reprova até a skill ser atualizada).
4. **`virada-paridade.test.ts`** (v5.1.4) — `SET LOCAL lock_timeout` acrescentado; era o único alvo fora do contrato
   sem justificativa de desenho. Nenhuma expectativa muda.

## 3. O que a varredura mudou no caminho

### 3.1 A v5.9.5 estava errada: `reverter-diario` NÃO era o primeiro teste que escreve

`src/lib/api-externa/contrato-api-externa.test.ts` (v5.4.0) cria **fixture commitada** em produção em `beforeAll`
(roles `ZZ_TESTE_API_V540*`, tipos `zz_teste_api_v540*`, chave de API), apaga em `afterAll` (com `.catch(() => {})`)
e tem um bloco `BEGIN … COMMIT` para simular JWT via `set_config`. Ele testa a API externa **ponta a ponta por
HTTP** — as RPCs rodam numa conexão do PostgREST, que só vê dado commitado. **Não cabe em transação revertida por
desenho.**

**Decisão do orquestrador (técnica, registrada para o Yan confirmar):** entra na sonda como **exceção explícita e
justificada** (`EXCECOES_CONHECIDAS`), com o caso (d) que reprova se ela deixar de ser necessária. A alternativa —
reescrever o teste da API externa — mudaria a natureza dele (deixaria de ser ponta a ponta) e está fora do escopo
de um patch de convenção. A contagem do gatilho de reavaliação, agora mecânica na sonda, é **três** (`reverter-diario`, `virada-paridade`
em transação revertida; `contrato-api-externa` como exceção commitada). O próximo é o 4º — o gatilho.

### 3.2 A sonda pegou a própria sonda

Na 1ª rodada, `reverter-diario` **não** era reconhecido como alvo: a regex procurava `require('pg')` literal, e o
arquivo obtém o driver por `createRequire(process.cwd() + '/')('pg')`. O caso (a) — "a sonda enxerga o arquivo de
referência, senão não vale nada" — reprovou e a regex passou a aceitar qualquer chamada com `'pg'` como argumento
(ou `import … from 'pg'`). Autoconferência em sonda de fonte é barata e paga.

### 3.3 Vista vermelha antes de valer

Arquivo temporário `zz-temp-escreve-sem-tx.test.ts` (obtém `pg`, faz `INSERT` sem transação):

```
× todo teste pg que escreve tem BEGIN + ROLLBACK + lock_timeout + skipIf e nenhum COMMIT
  → src/lib/zz-temp-escreve-sem-tx.test.ts — sem `query('BEGIN')` — escreve fora de transação
    … — sem `query('ROLLBACK')` — a transação não é revertida
    … — sem `SET LOCAL lock_timeout` — suítes concorrentes travam em vez de falhar
    … — sem `describe.skipIf` — offline, o gate quebraria em vez de pular
```

Removido o arquivo: verde. Segunda rodada, após o CRÍTICO do `revisor` (§5): arquivo temporário que chamava
`select financeiro.fn_que_grava($1)` sem transação — no desenho antigo passaria; no allowlist, vermelho em dois
casos (contrato e lista fechada). `rpc-contrato.test.ts` (só lê catálogo) está na allowlist, com prova.

### 3.4 O que a sonda prova e o que não prova

Ela prova a **presença do contrato no arquivo** (tokens no comando passado ao driver — `query('BEGIN')`, não
menção em comentário; case-insensitive) e a **ausência de `COMMIT`**. Ela **não** prova estaticamente que cada
escrita está dentro do `BEGIN` (análise de fluxo); um arquivo que abre transação num caso e escreve fora dela em
outro passaria — e não vê chave sintética nem `SAVEPOINT`. Isso fica para o `revisor-db` (item novo, agora
explícito) e para a leitura humana — registrado como limite, não como lacuna a fechar agora.

### 3.5 Hook `protecao-config`

`.claude/skills/` e `.claude/agents/` **não** são alvos do hook (alvos: `eslint.config.*`, `tsconfig*.json`,
`.prettierrc*`, `eslint-rules/`, `.claude/hooks/`, `settings.json`). Sem D5.

## 4. Arquivos (por commit)

1. `5c7d7a1 test(db): convencao de teste que escreve no banco — skill, checklist do revisor-db e sonda` e
   `6b44d87 test(db): sonda vira allowlist e contagem do gatilho fica mecanica (achados do revisor)` —
   `src/lib/sonda-teste-escreve-banco.test.ts` (novo), `src/lib/monde/virada-paridade.test.ts`,
   `.claude/skills/banco-e-rpc/SKILL.md`, `.claude/agents/revisor-db.md`.
2. `chore(release): v5.9.6` — `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `package.json`,
   `docs/WORKING-CONTEXT.md`, este out-briefing.

## 5. Parecer da revisão

`revisor-db`: **não se aplica** (sem migration/RPC).

**`revisor` — CORREÇÕES NECESSÁRIAS na 1ª rodada; todas corrigidas antes de fechar.**
- **CRÍTICO** — a sonda filtrava alvos por tokens de escrita (INSERT/UPDATE/…) no texto do teste; um teste que
  chamasse `SELECT financeiro.fn_que_grava($1)` sem `BEGIN` **não virava alvo** e passava verde com escrita real e
  permanente. Era exatamente a pergunta "prova isso ou só presença de tokens?" — a resposta era "só tokens".
  **Correção:** desenho **allowlist** — todo teste que obtém `pg` é alvo; quem só lê se declara em `SOMENTE_LEITURA`
  e prova (sem SQL de escrita em `query()`, sem `BEGIN`). Reproduzido com arquivo temporário (função gravadora via
  `SELECT`, sem transação): vermelho em dois casos. Rerodado: 5/5.
- **ALTO** — regexes case-sensitive: `query('begin')`/`insert into` em minúsculas escapavam. **Correção:** flag `i`
  nas três.
- **MÉDIO** — `ESCRITA_SQL` casava prosa ("// dispara um UPDATE na tabela") e criava falso positivo. **Correção:** só
  dentro de argumento de `query(`.
- **MÉDIO** — a "contagem hoje" na skill era prosa manual e já nascia errada (omitia `virada-paridade`, v5.1.4, que
  faz `BEGIN…ROLLBACK` contra produção). **Correção:** contagem **mecânica** — lista fechada
  `ESCREVEM_E_REVERTEM_HOJE` na sonda; arquivo novo reprova até a skill ser atualizada. Contagem real: **três
  arquivos** (`reverter-diario`, `virada-paridade`, mais `contrato-api-externa` como exceção). O próximo é o 4º.
- **MÉDIO** — o checklist do `revisor-db` dizia "a sonda pega a forma" sem dizer o que ela NÃO vê. **Correção:**
  explícito — chave sintética, `SAVEPOINT` e "escrita dentro do BEGIN" (fixture em `beforeAll` escapa) são conferência
  manual.
- **BAIXO** — `query({ text: 'COMMIT' })` escapava. **Correção:** `CMD` aceita a forma de objeto.
- Conferido e OK: regra "BEGIN ⇒ lock_timeout" coerente nos três lugares; mudança em `virada-paridade` correta e
  mínima; exceção de `contrato-api-externa` julgada honesta (registrada, justificada, com caso que a expira); sem
  `console.log`/`any`; escopo do diff = os 4 arquivos; zero migration, zero código de produção.

## 6. Aprendizado — régua de 5 destinos

1. **Enforcement:** a sonda (esta versão É o destino 1 de um aprendizado da v5.9.5).
2. **Deletar:** nada.
3. **Core:** nada.
4. **Skill:** `banco-e-rpc` §6 (feito). Duas lições pequenas: **sonda de fonte precisa de um caso que prove que ela
   enxerga o exemplo positivo** — sem o caso (a), a 1ª rodada teria ficado verde sem vigiar nada; e **sonda que vigia
   escrita é allowlist, não blacklist** — o texto do teste não mostra o que a função grava por dentro.
5. **Ritual:** nada.

## 7. Pendências

- 🔴 **Yan:** merge; **confirmar** a exceção de `contrato-api-externa` (fixture commitada por desenho HTTP) ou
  decidir que ela já conta como o 2º caso que empurra a reavaliação de ambiente de teste próprio.
- Registrado, fora do escopo: o comentário de `virada-paridade.test.ts` diz "é o único teste pg do projeto" —
  desatualizado desde a v5.4.0; `contrato-api-externa` limpa fixture com `.catch(() => {})` (falha silenciosa na
  limpeza → resíduo `ZZ_TESTE_API_V540` possível).

## 8. Fronteira (fica fora)

Reescrever `contrato-api-externa.test.ts`; análise de fluxo na sonda; ambiente de teste próprio (fica para o gatilho).
