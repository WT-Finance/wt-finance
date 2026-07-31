---
name: contrato-rpc-front
description: Contrato app↔dados do Janus — como o front chama RPC (helper de tipagem frouxa para RPC nova fora do database.ts congelado; o retorno é thenable, sem .catch), validação parseRpc/Zod (.optional() para campo que às vezes não vem; caso vivo em rpc-contrato.test.ts), campo novo que atravessa 5 camadas, e superfícies protegidas (requireArea/requireAreaApi/requireAreaAction, proxy.ts, senha provisória, magic link em 2 passos). Use quando ligar página/action/route a uma RPC, criar rota nova, adicionar campo que viaja form→RPC→UI, ou quando dois números vizinhos na mesma tela precisam concordar.
---

# Contrato RPC ↔ Front (Janus)

Esta skill cobre o lado **app** do contrato entre Next/TS e as RPCs do Supabase: como
chamar, como validar, como não deixar um campo se perder no caminho, e como proteger a
superfície (página/API/action) que consome o dado. O lado **banco** (RBAC inline no SQL,
`exigir_acesso`, RLS, verificação REST) vive na skill `banco-e-rpc` — leia as duas juntas
quando a tarefa cruza as duas pontas (ex.: criar RPC nova + a tela que a chama).

## 1. Chamando uma RPC nova — `database.ts` está CONGELADO

`src/types/database.ts` (tipos gerados do Supabase) não é regenerado a cada RPC nova —
está congelado desde ~v4.29. Chamar `db.rpc('minha_rpc_nova')` direto **quebra o `tsc`**
(o nome não está na união de funções conhecidas do tipo gerado).

**Não regenere nem edite `database.ts` por causa de uma RPC.** O padrão do projeto é um
**helper de tipagem frouxa**: uma função pequena que casta o `db.rpc` para uma assinatura
genérica e devolve `{ data: unknown, error }`, deixando a validação de shape para o
`parseRpc`/schema Zod no call-site. Precedentes vivos: `rpcSessao` (acervo/solicitações),
o helper de faturamento, e o compartilhado `@/lib/metas/rpc-metas.ts`:

```ts
// src/lib/metas/rpc-metas.ts
export function rpcMetas(
  db: ServerClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<RpcLike> {
  const call = db.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<RpcLike>
  return call.call(db, fn, args)
}
```

RPC **antiga**, já presente em `database.ts` (ex.: `get_executiva_kpis`), continua via
`db.rpc` tipado normal — não precisa do helper. O helper é só para o que veio depois do
congelamento.

(Custou caro: `db.rpc('metas_listar')` estourou o `tsc` na v5.0.0 — o M1 passou porque só
o teste chamava a RPC via `fetch`; o erro só apareceu quando a página passou a chamá-la
diretamente. Ao adicionar uma RPC nova, teste a CHAMADA real da UI, não só o schema.)

### O `this` do cliente é OBRIGATÓRIO — `.call(db, …)` / `.bind(db)` não é enfeite

Repare no `call.call(db, fn, args)` acima: **o `this` é passado de propósito.**
`SupabaseClient.rpc` é método de **protótipo** e o corpo é `return this.rest.rpc(...)`. Sem
o `this` do cliente, a chamada estoura em runtime:

```ts
const rpc = db.rpc as unknown as Fn   // ⛔ a ATRIBUIÇÃO destaca o método do cliente
await rpc('minha_rpc', {})            // TypeError: Cannot read properties of undefined (reading 'rest')
```

A sutileza que engana: **parênteses em torno de um acesso a membro PRESERVAM a referência**
(`(db.rpc as Fn)(fn, args)` funciona, `this` = `db`), mas **guardar em variável DESTRÓI**.
Destacado, o `this` é `undefined` porque `rpc` é definido dentro de um `class` e **corpo de
classe é sempre strict** — não depende de quem chama nem do sistema de módulos. As duas
formas parecem iguais no diff.

Formas seguras — use uma delas, sempre:
```ts
const rpc = (db.rpc as unknown as Fn).bind(db)   // ✅
return (db.rpc as unknown as Fn).call(db, fn, args)  // ✅
```

**Custou caro (v5.3.5): 18 dias de solicitações de acesso perdidas em produção.** Um
refactor que só criou uma variável para reusar a referência nos dois caminhos derrubou o
fluxo inteiro, e o `catch` anti-enumeração da action engoliu o `TypeError` — a tela dizia
"pedido enviado" e nada era gravado. Quando um caminho tem `catch` que não pode falar com
o usuário, o teste é a **única** rede: ao testar RPC, o dublê do cliente precisa ser objeto
com `rpc` no **protótipo tocando `this`** — um `vi.fn()` solto passa com o bug presente.

## 2. O retorno de `.rpc()` é *thenable*, não `Promise` — cuidado com `.catch()`

O builder do `supabase-js` implementa `.then` (por isso `await` e `Promise.all`/
`Promise.allSettled` funcionam normalmente), mas **não implementa `.catch`/`.finally`**.
Encadear `.catch()` direto numa chamada de RPC compila (o `tsc` não pega — o cast do
helper de tipagem frouxa promete `Promise<RpcLike>`, mas o objeto real em runtime não tem
o método) e **estoura em runtime**: `TypeError: ... .catch is not a function`.

```ts
// ERRADO — estoura em runtime, tsc não acusa
db.rpc('get_algo').catch(() => fallback)

// CERTO — trate falha pelo status de cada item do allSettled
const resultados = await Promise.allSettled([db.rpc('a'), db.rpc('b')])
// ou envolva explicitamente numa Promise nativa antes de encadear:
Promise.resolve(db.rpc('get_algo')).catch(() => fallback)
```

Ao fazer fetch paralelo de várias RPCs numa página, use o padrão já adotado nas páginas
existentes: `Promise.allSettled` + checar `.status === 'fulfilled'` por item, não
`.catch()` solto.

(Custou caro: a página da DRE quebrou inteira na v5.3.0 com todos os gates verdes —
`build`/`tsc`/`lint`/`test` não pegam esse tipo de erro porque é de runtime; só a
conferência visual pegou.)

## 3. Validando o shape com `parseRpc` + Zod

`parseRpc(schema, res, contexto)` (`src/lib/schemas-rpc.ts`) é o ponto único de validação:
loga erro de RPC, faz `schema.safeParse(res.data)`, loga drift se o shape não bater, e
**degrada para `null`** em qualquer um dos dois casos — nunca lança, nunca deixa passar
dado fora do formato esperado para a UI.

```ts
export function parseRpc<T>(schema: ZodType<T>, res: RpcLike, contexto: string): T | null {
  if (res.error) { console.error(`[RPC ${contexto}] ${res.error.message}`); return null }
  const parsed = schema.safeParse(res.data)
  if (!parsed.success) { console.error(`[RPC ${contexto}] shape inesperado: ...`); return null }
  return parsed.data
}
```

**O schema Zod reflete o retorno REAL da RPC, não o tipo TS** — o TS pode mentir (campo
que a assinatura promete mas a função às vezes não emite). Um campo que a RPC não emite
sempre precisa ser `.optional()`, **não só `.nullable()`**: `.nullable()` ainda reprova
`undefined` (chave ausente), enquanto `.optional()` tolera a chave não vir. Objeto raiz
geralmente usa `.passthrough()` para tolerar coluna extra do banco sem falsear um drift
que não existe (ex.: `mixProdutoSchema`, `minhasPermissoesSchema` em `schemas-rpc.ts`).

**Todo schema novo (ou alterado) ganha um caso em `src/lib/rpc-contrato.test.ts`** — é
esse teste que roda `safeParse` contra a RPC viva (via REST/service_role) e pega o drift;
nem o `tsc` nem o `build` pegam validação de runtime. Ao criar/mexer num schema de
`parseRpc`, é isso que o orquestrador vai checar nos gates.

(Custou caro: HTTP 500 na Lista de Operações por `passageiros_raw` — exigido no schema
mas nunca emitido pela RPC real — v4.12.1, fix pós-M2.)

## 4. Campo novo que viaja form → RPC → UI atravessa VÁRIAS camadas

Um atributo novo (ex.: regra de data por campo, config por entidade) passa por: o `map`
do `handleSubmit` do form → o `map` da server action → o `INSERT`/`jsonb_build_object` da
RPC de escrita → o `SELECT` da RPC de leitura → o schema Zod que a UI usa. **Cada camada
que faz pick/strip de campos descarta chave desconhecida em silêncio** — e o objeto Zod
sem `.passthrough()` estripa antes da UI ler. Esquecer **uma única camada** faz a feature
sumir **sem nenhum erro de build/tsc/lint** — a degradação só aparece em runtime, e só se
alguém olhar o dado certo na tela.

Regra prática: ao adicionar um campo, liste as camadas explicitamente e confira cada uma
(form → action → RPC escrita → RPC leitura → schema). O teste que pega esse tipo de furo
é o de contrato (`rpc-contrato.test.ts`, `safeParse`/sobrevivência da chave) — não o
`tsc`.

(Custou caro: regra de data por campo em Solicitações precisou de 5 camadas + o `SELECT`
do loop de `criar_solicitacao` corrigido — v4.19.0, ADR-0118.)

## 5. Duas RPCs vizinhas na mesma tela precisam CONCORDAR — vira caso de contrato

Reuso de RPC é a preferência do projeto, mas **granularidade e assinatura compatíveis não
garantem FILTRO compatível**. Antes de reusar uma RPC existente para um número que vai
aparecer **lado a lado com outro na mesma tela**, a pergunta certa não é "a RPC serve?" e
sim "ela aplica o MESMO filtro/definição que o número vizinho?" — e isso só se responde
com **uma query real**, não lendo a assinatura da função.

Quando a resposta é "sim, os dois precisam concordar", a igualdade vira **caso de
contrato** em `rpc-contrato.test.ts`, não nota de rodapé no código — senão a próxima
"otimização" numa das duas RPCs quebra a outra silenciosamente, e isso só aparece na tela
do usuário (o pior lugar para um demonstrativo financeiro discordar de si mesmo).

(Custou caro na v5.3.1: `get_decomposicao_categoria` tinha exatamente o par `p_from`/
`p_to` que a tela de Decomposição precisava — e mesmo assim somava `previsto` junto do
`realizado`, com competência retroativa via vencimento, e ignorava o de-para curado
`dre_categoria_map`. Medido: R$ 4,3 Mi de previsto e −R$ 30 mil de transferência interna
na janela em questão. Reusar sem medir teria produzido duas somas vizinhas, ambas
plausíveis, discordando sem explicação.)

## 6. Superfícies protegidas do app

Toda rota nova (página, route handler, server action) **nasce protegida** — o padrão é
duas camadas que se somam, nunca uma sozinha:

- **Camada 1 — `src/proxy.ts`** (convenção Next 16 do projeto; **não** `middleware.ts`):
  exige sessão fora de `/login`, `/solicitar-acesso` e `/auth/*`. Não checa área — só que
  existe sessão. Rota de API que se autentica sozinha no handler (ex.: cron com secret
  próprio) precisa entrar explicitamente na lista de isenção do proxy, senão o request sem
  cookie de sessão morre com 401 antes de chegar ao handler.
- **Camada 2 — guard por superfície**, em `src/lib/auth/sessao.ts`:
  - página → `await requireArea(area)` (redireciona para `/login`/`/sem-acesso`)
  - route handler → `await requireAreaApi(area)` (retorna `Response` 401/403 — checar
    `instanceof Response` antes de seguir)
  - server action → `await requireAreaAction(area)` (lança `Error`, a action devolve erro
    à UI)

  As três compartilham o mesmo mapa: `AREAS`/`Area` em `src/lib/auth/areas.ts`, **espelhado**
  em `app.rbac_areas` no banco (paridade testada em `rpc-contrato.test.ts`). Área nova
  entra nas duas pontas — esquecer o espelho no banco quebra esse teste.

- **`getServerClient()` é assíncrono e por-request** (`@supabase/ssr` + cookies) —
  **sempre `await`**. As RPCs chamadas por essa sessão correm como `authenticated`
  (timeout **8s**, não os 3s do `anon`) — RPC pesada consumida pela UI precisa caber
  nesse orçamento. `getAdminClient()` (service role) é **só server-side**, para cargas e
  `auth.admin` — nunca para servir dado de tela comum.

- **Portão forte de troca de senha**: com `app.rbac_usuarios.precisa_trocar_senha` ligado,
  os três guards (`requireArea`/`requireAreaApi`/`requireAreaAction`) desviam para
  `/trocar-senha` (página), `403 TROCA_SENHA_OBRIGATORIA` (API) ou lançam (action) **antes
  de qualquer dado ser tocado** — não dá para pular por URL direta. Login é por
  **e-mail + senha**; admin cria/reseta com **senha provisória exibida na tela** (nunca
  por e-mail — sem depender de SMTP). Nunca persistir senha em claro.

- **Magic link é DOIS passos** (`/auth/confirm`): o GET só renderiza um botão; o
  `verifyOtp`/`exchangeCodeForSession` roda **no POST** do clique, nunca no GET. Magic
  link é uso único — confirmar já no GET deixa bots de pré-visualização de link
  (WhatsApp/e-mail/antivírus/prefetch) consumirem o token antes do humano clicar, e o
  convite morre com "link inválido". **Nunca consumir token de auth num handler GET.**
  Hoje o magic link é só recuperação/anti-lockout (fora da tela de login normal); convite
  por e-mail depende de SMTP próprio (o nativo do Supabase limita a 2/h — ver skill
  `email` para a camada de envio). (Custou caro: diretoria ficou sem acesso na ativação da
  v4.13 por esse tipo de consumo prematuro de token; fix v4.13.1.)

## Ver também

- **`banco-e-rpc`** — o lado banco deste mesmo contrato: `exigir_acesso` inline,
  REVOKE/GRANT explícitos, RLS deny-by-default, `coalesce(..., false)` em predicado
  anulável, e a verificação REST com `service_role` (que **executa o corpo** da RPC —
  diferente de `db query`, que nega antes do corpo e mascara erro de runtime).
- **`email`** — camada de envio (`src/lib/email/`) para convite/senha provisória/SMTP;
  esta skill cobre só o consumo do token no `/auth/confirm`, não o envio em si.
