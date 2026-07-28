# Out-briefing — v5.3.3 · Fontes Avenir nas telas não-autenticadas

**Rota C (patch).** Fechada em 2026-07-28, branch `feat/v5-3-3-fontes-avenir`, base `93ea294`
(= `origin/main`, v5.3.2). Sem migrations, sem ADR novo, sem mudança de comportamento em nenhuma
rota de página ou API. **Merge é do Yan.**

## 0. Escopo pedido (a Rota C não tem briefing — o prompt é a especificação)

Corrigir o achado ALTO do `verificador-visual` registrado no out-briefing da v5.3.2 §4: isentar
assets estáticos de fonte no matcher do `proxy.ts`, **sem expandir além do matcher**. A forma da
isenção (prefixo `/fonts/*` específico × padrão canônico do Next para assets públicos) foi delegada
como decisão técnica, com a instrução de **verificar antes se há outros assets públicos hoje
interceptados pela mesma via**. Cuidado elevado exigido: proxy é superfície de auth — a isenção não
pode abrir bypass, e o revisor tinha de revisar o diff com essa lente explícita. Verificação pedida:
gates, parecer do revisor, `verificador-visual` nas três telas não-autenticadas e smoke de uma rota
protegida.

## 1. Causa-raiz e correção

O `matcher` do `src/proxy.ts` (camada 1 do enforcement, ADR-0109) não isentava `/fonts/`. Um
`/fonts/avenir/*.otf` pedido por uma tela **sem sessão** entrava no proxy, não era rota pública, e
levava `307` para `/login` — o browser recebia HTML no lugar da fonte, abortava o decode
(`OTS parsing error`) e caía para fonte de sistema. Telas **com** sessão nunca foram afetadas: o
`proxy()` só redireciona no ramo `!user`; com usuário ele cai no `return response` e o asset é
servido normalmente.

**Correção (2 linhas úteis em 1 arquivo):** `fonts/` entrou no negative lookahead do matcher **por
prefixo de diretório**, ao lado do `logos/` que já existia, mais um bloco de comentário registrando
a decisão e o custo histórico.

**Por que prefixo e não extensão.** O comentário pré-existente do arquivo documenta que isenção por
extensão (`qualquer path terminado em .png/.svg`) furou a camada 1 na auto-auditoria S11 — uma rota
dinâmica `/api/.../[id]` com id terminado em `.png` escapava do proxy. O "padrão canônico do Next"
que a doc costuma mostrar é justamente o de extensão; ele é **incompatível com a lição do projeto**,
então a forma correta aqui é a que o repo já tinha para `logos/`: prefixo de diretório, nome exato
para arquivo solto.

**Inventário de assets públicos interceptados hoje** (levantado antes de escolher a forma, com o
dev server de pé — era o pedido explícito do prompt):

| Asset | Antes | Consumidor vivo | Decisão |
|---|---|---|---|
| `/fonts/avenir/*.otf` (5) | `307` | **sim** — as 5 `@font-face` de `src/app/globals.css` | **isentado** |
| `/apple-touch-icon.png` | `307` | não — o ícone servido é `src/app/apple-icon.png` (isento por nome, e é o que o HTML referencia) | registrado, ver §4 |
| `/next.svg`, `/vercel.svg`, `/window.svg`, `/globe.svg`, `/file.svg` | `307` | não — sobras do template do Next, zero ocorrências em `src/` | registrado, ver §4 |

Ou seja: **a única lacuna com efeito real era `/fonts/`**. Não expandi o matcher para os órfãos —
seriam 6 termos a mais num regex de auth para arquivos que ninguém pede.

## 2. Divergência do escopo, encontrada na auto-auditoria

O prompt (herdando o "provavelmente" do registro da v5.3.2) listava **`/trocar-senha`** entre as
telas não-autenticadas afetadas. **Não é tela não-autenticada:** `src/app/trocar-senha/page.tsx:19-20`
tem duplo portão (`if (!sessao.logado) redirect('/login')` e `if (!sessao.precisaTrocarSenha)
redirect('/')`), e sem sessão o proxy já a manda para `/login` com `307`. Como o bug só existia no
ramo sem usuário, **`/trocar-senha` nunca esteve afetada**.

A terceira tela pública de verdade é **`/auth/confirm`** (o `PUBLIC_PREFIXES = ['/auth/']` do proxy),
que estava afetada exatamente como as outras duas. O conjunto real é: **`/login`,
`/solicitar-acesso`, `/auth/confirm`** — e é esse que foi verificado. (`/sem-acesso` também exige
sessão.)

## 3. Guard mecânico novo (régua de 5 destinos, destino 1)

`src/proxy.test.ts` — 32 casos. A camada 1 inteira depende de um regex onde **nenhum gate pega erro**:
um termo a menos devolve HTML no lugar de um asset (este bug), um termo a mais isenta uma rota da
exigência de sessão em silêncio (lição S11). O teste fixa as duas bordas:

- **isentos:** as fontes reais lidas de `public/fonts/avenir` (nome cru **e** percent-encoded — os
  nomes têm espaço e o browser pede `%20`), `logos/`, `_next/` e os 6 ícones de metadata por nome;
- **sempre passam pelo proxy:** raiz, páginas protegidas, aninhadas, `/admin/uploads`, rotas de API,
  as públicas (quem decide é o `proxy()`, não o matcher), `/api/monde/ingest` (o bypass dele é no
  handler, não no matcher) e as armadilhas `/api/uploads/abc.png` (S11), `/api/uploads/abc.otf`,
  `/api/algo/fonts/x.otf`, `/api/algo/logos/x.svg`, `/fonts` sem barra, `/FONTS/`, `/meus-fonts/`.

Confirmei que o guard **reprova com o matcher antigo** (sem `fonts/` o `.otf` volta a casar) — um
teste que passa nas duas versões não seria rede nenhuma.

## 4. Verificação

**Gates (todos na worktree, serializados, rodada limpa após `rm -rf .next`):** `npm run build` ✅ ·
`npx tsc --noEmit` ✅ (0) · `npm run lint` ✅ (0, sem warning novo) · `npm test` ✅ **525/525**
(493 da baseline + 32 do guard novo), 38 arquivos.

⚠️ **Armadilha de ambiente encontrada aqui:** com o `next dev` tendo rodado na worktree (conferência
visual), o `next build` seguinte deixa `.next/dev/types/{routes.d.ts,validator.ts}` e o
`npx tsc --noEmit` acusa 3 erros de sintaxe **em arquivo gerado** — o `**/*.ts` do tsconfig os
varre. Não é código e não se afrouxa o tsconfig para calar (barreira dura): `rm -rf .next` e rodar
a sequência de novo, que é a rodada reportada acima. Registrado no `/fechamento-versao`.

**Camada 1 — smoke de rota protegida (pedido do prompt), com `next dev`:**

| Alvo | Depois | |
|---|---|---|
| `/`, `/financeiro`, `/executiva`, `/metas`, `/solicitacoes`, `/trocar-senha`, `/admin/uploads` | `307 → /login` com `next=` preservado | inalterado |
| `/api/setores`, `/api/dashboard/kpi-historico` | `401 {"error":"AUTH_NECESSARIA"}` | inalterado |
| `/login`, `/solicitar-acesso`, `/auth/confirm` | `200` | inalterado |
| `/fonts/avenir/*.otf` (5) | `307` → **`200 font/otf`** | **corrigido** |
| travessia: `/fonts/../admin/uploads`, `/fonts/%2e%2e/admin/uploads`, `/fonts/avenir/../../financeiro`, `/fonts/./../executiva` | `307 → /login` (normaliza antes do matcher) | sem bypass |
| `/fonts/..%2fadmin%2fuploads`, `/fonts/%2e%2e%2f…` | `404` | sem bypass |
| `/fonts` (sem barra), `/FONTS/avenir/x.otf` | `307` — só `/fonts/` é isento; matcher é case-sensitive | erra para o lado seguro |

**Bytes:** os 5 `.otf` servidos têm o magic OpenType `OTTO` e são **byte a byte idênticos** aos
arquivos de `public/fonts/avenir/` (`cmp`) — o browser recebe fonte válida, não só status 200.

**Tipografia nas 3 telas** (Chromium headless, contexto novo = sem cookie): `.otf` pedidos todos
`200 font/otf`; **0** `OTS parsing error`, **0** `Failed to load resource`, **0** `pageerror`;
`document.fonts.status = loaded` e `document.fonts.check('1em "Avenir LT Std"') = true`; largura de
referência a 64px = **726,86px em Avenir contra 796,44px** do fallback (Arial e fonte inexistente
medem igual — prova objetiva de que não é fallback); anel de foco visível em todos os inputs,
botões e links das três telas (o `nextjs-portal` sem anel é o overlay do dev, não UI do app);
identidade neutra, sem dourado de marca, logos Janus + Welcome Group renderizando.
`check('800 …') = false` em todas: nenhuma das três telas usa o peso Heavy, então ele não é
carregado — esperado com `font-display: swap`, não defeito.

**Banco:** N/A — versão sem migration/RPC. Nenhuma migration na pasta (o passo 4 do `/nova-versao`
foi pulado por não haver `db:migrate`), nada destrutivo pendente, `revisor-db` N/A.

## 5. Parecer da revisão

**`revisor` — APROVADO.** Zero CRÍTICO, zero ALTO. Confirmou por leitura independente que fora do
`matcher` e do comentário **nenhuma linha** mudou (`PUBLIC_PATHS`, `PUBLIC_PREFIXES`,
`API_AUTH_PROPRIA`, `ehPublica()` e o corpo de `proxy()` idênticos ao main); que **não existe**
`src/app/fonts/**` nem `src/app/logos/**` (os dois prefixos servem só `public/`, sem nenhuma
`page.tsx`/`route.ts` por baixo, então não há superfície para a camada 2 proteger); que o `|fonts/`
está sintaticamente correto na alternação e que o lookahead está ancorado logo após a barra raiz —
portanto `/api/algo/fonts/x` **não** herda a isenção; e que a escolha prefixo-em-vez-de-extensão se
sustenta contra a lição S11. Avaliou a alternativa de servir os assets por CDN/`headers` dedicados e
concluiu que seria expansão de escopo sem ganho para um patch de Rota C.

- **BAIXO (endereçado como registro, §6):** o comentário chama os `.otf` de "públicos por natureza".
  Correto quanto a segurança de autenticação, mas a **Avenir LT Std é fonte comercial licenciada**
  (ADR-0039) e, com a isenção, passa a ser baixável por visitante anônimo — antes só com sessão, e
  por acidente. É questão de licença/negócio, não de auth. Não bloqueia.

**`verificador-visual` — NÃO VERIFICADO (bloqueio de ferramenta).** O MCP Playwright do `.mcp.json`
**não conecta em sessão de background/headless**: o agente foi despachado sem as ferramentas
`browser_*` do próprio papel dele e, corretamente, **recusou-se a fabricar** resultado de rede,
console e screenshot — devolveu o que dava com `Read` (inspeção estática) e recomendou relançar com
o browser anexado. Esse comportamento é o certo e vale registrar como acerto do agente.

**Substituição (protocolo D5 — não contornar rede de proteção, completar o resto, deixar pronto,
sinalizar, declarar o não-verificado):** o passo barrado é de **verificação**, não uma salvaguarda,
e a via alternativa não é mais fraca — rodei o **mesmo motor** (o Chromium que o próprio MCP
instalou, via `playwright-core` do cache do npx) num script fora do repo, medindo o que o agente
mediria e mais: status/`content-type` por request, console completo, `document.fonts.check()`,
largura comparada com o fallback, anel de foco por Tab e screenshot das três telas — resultados em
§4. Eu mesmo olhei os três screenshots. **O que fica não-verificado pelo agente formal:** o parecer
independente de contexto limpo sobre a UI; se quiser a assinatura dele, basta relançar a delegação
numa sessão CLI interativa (o dev server e as três URLs são os mesmos). Registrado também no
WORKING-CONTEXT para a próxima sessão não tropeçar no mesmo bloqueio.

## 6. Achados e pendências registradas (fora do escopo — não implementados)

- **[BAIXO — produto/negócio, do revisor] Licença da Avenir LT Std × exposição pública dos `.otf`.**
  Conferir os termos (ADR-0039) agora que os arquivos são baixáveis sem sessão. Se houver
  necessidade de limitar, o caminho é subsetting/`woff2` com controle de referrer — **não** voltar a
  quebrar a fonte no login. **Decisão do Yan.**
- **[BAIXO — limpeza] 6 assets órfãos em `public/`:** `apple-touch-icon.png` (superado por
  `src/app/apple-icon.png`) e os 5 SVGs do template do Next. Seguem interceptados pelo proxy e sem
  consumidor. Deletar é limpeza de 1 commit — **não fiz porque remoção sem pedido expresso não é
  minha decisão**, e o prompt travou o escopo no matcher.
- **[REGISTRO — harness] MCP Playwright indisponível em background/headless.** Ver §5. Se isso for
  virar rotina, o caminho durável é embutir o script headless como ferramenta do projeto (destino 1
  da régua) em vez de reescrevê-lo a cada versão.
- **ADR: nenhum.** A isenção não cria decisão arquitetural nova — ela **aplica** a política de
  matcher já decidida no ADR-0109 e na auto-auditoria S11, e o "por quê" mora no comentário do
  arquivo, que é onde a próxima pessoa vai olhar. Próximo ADR livre segue **0158**.

## 7. Aprendizado permanente (régua de 5 destinos)

1. **Enforcement mecânico:** `src/proxy.test.ts` (§3) — a classe de bug (matcher que ninguém testa)
   virou máquina, nas duas bordas. É o destino preferido e é o que foi usado.
2. **Já coberto:** "auto-auditoria contra o próprio briefing" já é invariante do core — e pegou o
   `/trocar-senha`. Nada a acrescentar lá.
3. **Core:** nada. O core não cresce por causa deste patch (teto 180; hoje 162).
4. **Skill de domínio:** nada novo em `contrato-rpc-front` — o §6 dela já descreve a camada 1
   corretamente; o situacional deste caso mora no comentário do `proxy.ts` e neste out-briefing.
5. **Ritual:** `/nova-versao` ganhou a **tabela de rotas** (quais passos rodam em A/B/C), o passo 4
   condicionado a tocar banco, e o aviso de validar o escopo contra o repo **em toda rota** com o
   caso `/trocar-senha` como precedente. `/fechamento-versao` ganhou a armadilha do `.next/dev`
   quebrando o `tsc` depois da conferência visual. `docs/WORKING-CONTEXT.md` ganhou o caveat do MCP
   Playwright em background.

## 8. Arquivos modificados/criados

- `src/proxy.ts` — `fonts/` no matcher + comentário da decisão (único arquivo de runtime).
- `src/proxy.test.ts` (**novo**) — 32 casos fixando as duas bordas do matcher.
- `.claude/skills/nova-versao/SKILL.md` — tabela de rotas, passo 4 condicional, aviso de escopo×repo.
- `.claude/skills/fechamento-versao/SKILL.md` — armadilha do `.next/dev` × `tsc` após a visual.
- `docs/WORKING-CONTEXT.md` · `CHANGELOG.md` · `src/data/changelog-diretoria.ts` · `package.json`
  (5.3.2 → 5.3.3) · este out-briefing.

## 9. DoD

- [x] `build` ✅ · `tsc` 0 ✅ · `lint` 0 ✅ · `test` **525/525** ✅
- [x] `revisor` **APROVADO** (lente de segurança explícita; 1 BAIXO endereçado como registro)
- [x] `revisor-db` **N/A** — sem migration/RPC
- [~] `verificador-visual` **NÃO VERIFICADO por MCP ausente** → substituído por verificação headless
      equivalente e mais objetiva (§5); o que ficou sem a assinatura do agente está declarado
- [x] Smoke de rota protegida + travessia — camada 1 provada inalterada (§4)
- [x] Auto-auditoria adversarial — pegou a divergência do `/trocar-senha` (§2)
- [x] CHANGELOG.md · CHANGELOG_DIRETORIA (hora real de autoria, reconciliar no `/pos-merge`) · bump
- [x] Out-briefing (este) · WORKING-CONTEXT · aprendizado roteado pela régua
- [ ] **PR draft aberto — merge é do Yan.** Nunca mergear, nunca deployar.
