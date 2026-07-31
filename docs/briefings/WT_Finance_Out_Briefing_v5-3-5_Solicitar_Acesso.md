# Out-briefing — v5.3.5 · Solicitação pública de acesso não criava a pendência

**Rota:** C (patch de correção, sem decisão de produto aberta)
**Data:** 2026-07-31
**Migrations:** nenhuma · **ADR novo:** nenhum (não muda arquitetura; o porquê vive no comentário
do ponto de uso)

---

## 0. Escopo pedido (Rota C — o prompt é a especificação)

> "o fluxo de solicitação de acesso parece não estar funcionando, os usuários ao solicitar o acesso
> na pagina de login não está criando uma solicitação para aprovação"

---

## 1. Causa-raiz: `this` perdido — não era o banco

O suspeito natural era banco (RPC não aplicada, grant de `anon`, guarda do `exigir_acesso`). **Não
era nada disso.** A action nunca chegava ao banco.

### O mecanismo

```ts
// ANTES (funcionava — v4.14 até 13/07 14h08)
await (supabase.rpc as unknown as AdminRpc)('solicitar_acesso_admin', { ... })

// DEPOIS (quebrado — commit 8863a69, 13/07 14h13)
const rpc = supabase.rpc as unknown as AdminRpc     // ← a ATRIBUIÇÃO destaca o método
await rpc('solicitar_acesso_admin', { ... })        // this === undefined
```

A distinção é sutil e é o coração do bug: **parênteses em torno de um acesso a membro preservam a
referência-base** (`(obj.m)(x)` ≡ `obj.m(x)`, `this` = `obj`); **atribuir o método a uma variável a
destrói** (`const m = obj.m; m(x)` → `this` = `undefined` em módulo ESM, que é strict por padrão).

`SupabaseClient.rpc` é método de **protótipo** cujo corpo é literalmente
`return this.rest.rpc(fn, args, options)`. Sem `this`, estoura
`TypeError: Cannot read properties of undefined (reading 'rest')` — e o nome da propriedade no erro
é a assinatura que fecha o diagnóstico.

A ironia: o commit que quebrou era um **fix defensivo** ("fallback se a RPC nova não estiver
aplicada"). O refactor criou a variável justamente para reusar a referência nos dois caminhos — e
por isso **os dois** morreram juntos.

### Por que ninguém viu por 18 dias

Três camadas de silêncio empilhadas:

1. o `catch` da action é **anti-enumeração por design** (ADR-0110): não pode revelar falha ao
   usuário, então engolia o `TypeError` junto;
2. a tela **sempre** redireciona para `?enviado=1` — o usuário recebe confirmação de sucesso;
3. o erro do fallback legado era **descartado** (`await rpc(...)` sem checar `error`).

O único rastro era o `console.error('[solicitar-acesso] erro:', err)` no log da Vercel — que ninguém
tinha motivo para olhar, porque a tela dizia que estava tudo bem.

### As 5 evidências (independentes entre si)

| # | Evidência | O que prova |
| --- | --- | --- |
| 1 | Log de runtime da Vercel: o `TypeError` exato em **100%** dos `POST /solicitar-acesso` — **18** tentativas só na janela de retenção de 7 dias | a falha é total e real, não intermitente |
| 2 | Fonte do `@supabase/supabase-js` instalado (2.105.1): `rpc(fn, …) { return this.rest.rpc(…) }` | explica o nome `rest` no erro; o método é de protótipo |
| 3 | **Todos** os outros call-sites de RPC do repo bindam: `.bind(sb)` em 6 arquivos, `.call(db, …)` em `rpc-dre`/`rpc-fluxo`/`rpc-metas` | este era o **único** fora do padrão |
| 4 | Base (via REST/service_role): 8 pedidos, todos `aprovada`, **zero pendentes**, `criado_em` mais recente **13/07 11h26** | nada foi criado após a regressão |
| 5 | Diff datado do `8863a69` (13/07 14h13) | data exata da quebra, coerente com (4) |

A evidência (4) foi a que **refutou** minha primeira hipótese: eu tinha concluído "nunca funcionou"
ao ver o padrão desde a v4.14, e os pedidos de 23/06, 25/06, 26/06 e 13/07 provaram o contrário —
foi o que me levou à distinção parênteses × atribuição e à data real.

---

## 2. A correção

Uma linha, no padrão que o repo já usa em `src/app/admin/uploads/actions.ts`:

```ts
const rpc = (supabase.rpc as unknown as AdminRpc).bind(supabase)
```

E o segundo buraco fechado: cada caminho agora loga, e a falha **dupla** grita `PEDIDO PERDIDO`.
A resposta ao usuário segue **sempre** de sucesso — a anti-enumeração (ADR-0110) está intocada.

---

## 3. Guard mecânico novo (régua de 5 destinos, destino 1)

`src/app/solicitar-acesso/actions.test.ts` — **primeiro teste de Server Action do repo**, 8 casos.

O ponto crítico é o **dublê**: uma `class` cujo `rpc` é método de **protótipo** que toca `this.rest`.
Isso replica a armadilha do supabase-js, então uma chamada destacada estoura no teste como estoura
em produção. **Um `vi.fn()` solto passaria com o bug presente** — seria teatro, não guard.

Cobre: caminho feliz (com asserção dos argumentos), normalização do e-mail (trim + minúsculas, nome
vazio → `null`), notificação só em pedido **novo**, silêncio em reenvio, fallback legado, falha dupla
com log de `PEDIDO PERDIDO`, e-mail inválido sem tocar o banco, e SMTP fora sem derrubar o pedido.

**Verificado que 7 dos 8 casos REPROVAM com o código antigo** (o 8º é o de e-mail inválido, que
nunca chega ao banco — passar ali é o correto).

---

## 4. Verificação

| Gate | Resultado |
| --- | --- |
| `npx tsc --noEmit` | limpo |
| `npx eslint` (arquivos alterados) | limpo |
| `npm test` | **549 passed**, 0 falhas |
| `npm run build` | compilado com sucesso |

**Não verificado:** o fluxo real em produção pós-deploy. A prova de ponta a ponta é submeter um
pedido na tela e ver a pendência aparecer em Usuários & Acessos (§6.1).

---

## 5. Parecer da revisão

`revisor` despachado com foco adversarial em: completude da varredura (outros métodos destacados —
`.storage`, `.from`, `.auth`, `.functions`), honestidade do guard (o dublê é real ou teatro?),
preservação da anti-enumeração, utilidade atual do fallback legado e efeitos colaterais do `.bind`.

*(Parecer consolidado na descrição do PR.)*

`revisor-db` **não se aplica** (sem migration/RPC — o banco estava correto o tempo todo).
`verificador-visual` **não se aplica** (nenhuma UI mudou).

---

## 6. Pendências e recomendações

1. **Prova de ponta a ponta pós-merge (recomendada):** submeter um pedido de teste em
   `/solicitar-acesso` e confirmar que a pendência aparece em Usuários & Acessos — depois rejeitar
   para não deixar lixo. É o único teste que exercita o caminho real.
2. **Pedidos perdidos são irrecuperáveis.** 18 dias sem gravar nada. Se alguém pediu acesso nesse
   período e ficou esperando, precisa **pedir de novo** — vale um aviso ativo a quem estava
   esperando, se você souber quem eram.
3. **Enforcement mecânico BLOQUEADO pelo harness (Protocolo D5).** O destino 1 da régua pediria uma
   regra de lint contra `.rpc` destacado, mas o hook `protecao-config` bloqueia `eslint.config.*` e
   `eslint-rules/` por construção — e o escape é variável de ambiente que o agente não alcança. O
   diff está pronto no §7 para você aplicar. Enquanto isso, o guard do teste cobre este call-site
   (mas só este).
4. **Fallback legado — avaliar remoção (não removi):** a 0177 está aplicada há muito tempo; o
   `solicitar_acesso` legado só existe para a janela "deploy antes da migration", que já passou.
   Hoje ele adiciona um caminho que quase nunca roda. Não toquei — remover objeto vivo exige
   verificar consumidores (regra do CLAUDE.md, lição v4.17.1) e é decisão sua.

---

## 7. Regra de lint proposta (para o Yan aplicar — o hook bloqueia o agente)

O bug é de uma classe que lint pega trivialmente. Sugestão em `eslint.config.mjs`, dentro do bloco
de regras do projeto:

```js
'no-restricted-syntax': ['error', {
  selector: "VariableDeclarator[init.type='MemberExpression'][init.property.name='rpc']",
  message:
    'Método .rpc destacado do cliente Supabase perde o `this` (rpc() faz this.rest.rpc(...)) e ' +
    'estoura em runtime, engolido por catch. Use (client.rpc as ...).bind(client) ou ' +
    'call.call(client, ...). Ver v5.3.5.',
}],
```

Cobre a atribuição direta (`const rpc = supabase.rpc`) — que é exatamente a forma que quebrou —
sem falso-positivo nos padrões corretos (`.bind(...)` e `.call(...)` são `CallExpression`, não
`MemberExpression` cru). Comando para validar depois de aplicar:

```bash
WT_PERMITIR_CONFIG=1 npx eslint eslint.config.mjs src/app/solicitar-acesso/actions.ts
```

---

## 8. Arquivos modificados/criados

| Arquivo | O quê |
| --- | --- |
| `src/app/solicitar-acesso/actions.ts` | `.bind(supabase)` (a correção) + erro do fallback legado logado |
| `src/app/solicitar-acesso/actions.test.ts` | **novo** — 8 casos, dublê com `rpc` de protótipo |
| `CHANGELOG.md` · `src/data/changelog-diretoria.ts` · `package.json` | entrada da v5.3.5 + bump |
| `docs/WORKING-CONTEXT.md` | estado + a lição do `this` destacado |
| `docs/briefings/WT_Finance_Out_Briefing_v5-3-5_Solicitar_Acesso.md` | este arquivo |

---

## 9. DoD

- [x] Causa-raiz **provada** por 5 evidências independentes, com a data exata da regressão
- [x] Primeira hipótese ("nunca funcionou") **refutada** pela base — e o registro diz isso
- [x] Correção no padrão que o repo já usa (não inventa mecanismo novo)
- [x] Guard mecânico novo, **visto reprovando** o código antigo (7 de 8)
- [x] Gates: `tsc`, `lint`, `test` (549), `build`
- [x] `revisor` despachado; `revisor-db` e `verificador-visual` não se aplicam
- [x] CHANGELOG técnico + diretoria (com o aviso de que pedidos perdidos não voltam) + bump
- [x] WORKING-CONTEXT atualizado
- [x] Enforcement bloqueado pelo harness **declarado** (D5) com o diff pronto (§7)
- [ ] **Merge humano** — fronteira de produção
- [ ] Prova de ponta a ponta pós-merge (§6.1)
