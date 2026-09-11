# Atos humanos da v5.10.0

Três mudanças que o agente **não pode** aplicar por desenho, com o conteúdo pronto ao lado.
Cada uma traz o comando exato e **a verificação** — nenhuma delas vale sem ver funcionar.

**Por que o agente não aplica.** O hook `protecao-config` (PreToolUse, BLOQUEIA) cobre 6 alvos,
entre eles `.claude/hooks/` (os hooks não se desarmam) e qualquer `.claude/settings.json`,
**inclusive o global do usuário**. O escape `WT_PERMITIR_CONFIG=1` é variável de ambiente da
**sessão**, que o agente não alcança — o protocolo é este: ele propõe o diff pronto, você aplica.

> **Estado conferido em 10/09/2026**, antes de qualquer um destes atos:
> ```
> ~/.claude/settings.json       → permissions: {"defaultMode":"auto"}   (e nada mais)
> .claude/settings.json         → allow: 0 · deny: 0
> .claude/settings.local.json   → não existe
> ```
> Ou seja: a "terceira camada" que o `CLAUDE.md` descrevia **não existia**. O `db push` cru
> nunca esteve bloqueado por máquina.

---

## Ato 1 — permissões: `deny` do `db push` cru + `allow` estreito dos gates (D10-001)

**O risco concreto.** `npx supabase db push` cru passa **por fora** do wrapper
`npm run db:migrate` e, com ele, por fora da classificação aditiva/destrutiva, do backup-gate e
do restore-test. Pior: `db push` empurra **todo o conjunto pendente** — inclusive uma migration
destrutiva estacionada. Foi assim que a v5.2.0 dropou bases por arrasto. Até hoje, a única coisa
que impede isso é disciplina.

**O outro lado.** Sem nenhuma regra de `allow`, o classificador do modo auto pode **negar seco**
(sem prompt) um comando que escreve. Aconteceu duas vezes em 10/09, na poda de branches. O
`allow` estreito devolve fluidez ao que a sessão roda o tempo todo e não toca produção.

### Como as regras funcionam (confirmado na documentação, 10/09)

Vale ler antes de mexer — regra malformada **falha em silêncio**, e isto é controle de segurança.

- **`Bash(cmd:*)` e `Bash(cmd *)` são equivalentes**; `:*` é a forma preferida. Não ponha `*`
  antes do subcomando (`Bash(npm * test *)` gera aviso na abertura).
- **`deny` vence `allow`, sempre**, e a ordem é `deny` → `ask` → `allow`, sem desempate por
  especificidade. Um deny amplo bloqueia mesmo que um allow estreito também case.
- **Cadeia com `&&`, `;` ou `|` é quebrada em subcomandos e cada um é testado.** Então
  `cd /x && npx supabase db push` é pego pelo deny — não dá para escapar encadeando.
- **Regra exata (sem `*`) casa literalmente**, e os dois-pontos de `db:migrate` **não** interferem
  no parsing. É por isso que as duas invocações aditivas são escritas por extenso: `--destrutiva`
  nunca entra por arrasto.
- **O hook `PreToolUse` roda ANTES do fluxo de permissão.** Consequência prática: `Bash(git add:*)`
  no `allow` **não** dá passe livre ao `git add -A` — o hook do Ato 2 dispara primeiro e bloqueia.
  As duas camadas são independentes, e um hook pode apertar, nunca afrouxar.
- **Precedência dos settings** (o topo vence): managed → linha de comando → `.claude/settings.local.json`
  → `.claude/settings.json` (projeto) → `~/.claude/settings.json` (global). As listas são
  **combinadas**, não substituídas: um `deny` do projeto vence um `allow` do global.

> ⚠️ **`git push` precisou de deny explícito.** Um `allow` de `Bash(git push:*)` liberaria
> `--force` e push para `main` — que as barreiras duras do `CLAUDE.md` proíbem, mas só em prosa.
> Como `deny` vence `allow`, o arquivo traz 5 regras que devolvem a garantia por máquina. Elas não
> cobrem toda forma possível (um refspec exótico escapa), mas cobrem as que a mão digita.

### Aplicar (recomendado: no settings do PROJETO)

Os **hooks** precisam ficar no settings do projeto de qualquer forma — os comandos usam caminho
relativo (`node .claude/hooks/…`), que só resolve com o projeto como cwd. As **permissões** ficam
junto por três razões: são versionadas, são revisadas no PR, e valem em toda worktree nova sem
depender da máquina. Faça o Ato 2 **junto** — o arquivo já contém os dois.

```bash
cd ~/projects/wt-finance/.claude/worktrees/chore+v5-10-0-limpeza-fechamento-v5

# 1. copia o hook do Ato 2 (registrar sem o arquivo faz TODA chamada Bash falhar)
cp docs/auditoria-v5/atos-humanos/2-protecao-git-add.mjs .claude/hooks/protecao-git-add.mjs

# 2. instala o settings (as chaves "//" são comentários — JSON aceita, o Claude Code ignora)
WT_PERMITIR_CONFIG=1 cp docs/auditoria-v5/atos-humanos/1-settings-projeto.json .claude/settings.json

# 3. confere que o JSON está válido antes de reiniciar a sessão
node -e "const j=require('./.claude/settings.json');console.log('allow',j.permissions.allow.length,'deny',j.permissions.deny.length,'hooks',Object.keys(j.hooks))"
```

Depois **reinicie a sessão do Claude Code** — settings e hooks são lidos na abertura.

### Variante: permissões no `~/.claude/settings.json` (global)

Se preferir as regras no global, use o **merge** abaixo — nunca copie o `1b-*.json` por cima, ele
apagaria `model`, `enabledPlugins`, `extraKnownMarketplaces`, `theme` e o resto.

```bash
WT_PERMITIR_CONFIG=1 node -e "
const fs=require('fs'), G='/home/yan-wt/.claude/settings.json';
const alvo=JSON.parse(fs.readFileSync(G,'utf8'));
const novo=JSON.parse(fs.readFileSync('docs/auditoria-v5/atos-humanos/1b-settings-global-permissions.json','utf8'));
fs.copyFileSync(G, G+'.bak');                        // backup antes de tocar
alvo.permissions = { ...(alvo.permissions||{}), ...novo.permissions };
fs.writeFileSync(G, JSON.stringify(alvo,null,2)+'\n');
console.log('chaves preservadas:', Object.keys(alvo).join(', '));
"
```

Neste caso, instale do `1-settings-projeto.json` **só o bloco `hooks`** no projeto.

### Verificar (não pule)

Em uma sessão nova, peça ao agente que rode **exatamente** isto:

```bash
npx supabase db push --dry-run
```

**Esperado:** negado pela regra, sem prompt. Se executar, a regra não pegou — confira se a sessão
foi reiniciada e se o `deny` está no settings que vale.

E confira que o `allow` funcionou: `npx tsc --noEmit` e `npm run build` devem rodar **sem**
pedir confirmação.

> **Cuidado ao testar:** use `--dry-run`. Um `db push` que *execute* aplicaria o conjunto
> pendente de verdade.

---

## Ato 2 — hook `PreToolUse` contra `git add -A` (D8-022)

A regra "não usar `git add -A` cego" está no `CLAUDE.md`, e hoje é **só prosa**. Pela régua de 5
destinos, o que dá para segurar por máquina não deveria ser prosa — este é o destino 1.

**Bloqueia:** `git add -A`, `--all`, `-a` (e combinações como `-vA`), `git add .`, `git add :/`.
**Não bloqueia, de propósito:** `git add <caminho>` (o padrão da casa), `git add -p`/`--patch`
(interativo é escolha consciente) e `git add -u` (só rastreados já modificados — não arrasta
arquivo novo, que é o risco real).

**Escapes:** `WT_PERMITIR_ADD_TUDO=1` para o caso legítimo pontual (primeiro commit de uma árvore
nova) e `WT_DESLIGAR_HOOKS=1` para emergência geral. Os dois são variável de ambiente da sessão
— o agente não os alcança; quem reexecuta é você.

**Uma sutileza que a bateria de teste pegou:** a primeira versão da regex bloqueava
`git commit -m "não usar git add -A"`, porque a frase estava no **texto** da mensagem — e as
mensagens de commit deste projeto citam a regra literalmente. O hook agora remove o conteúdo
entre aspas antes de casar qualquer padrão.

### Aplicar

É o passo 1 do bloco de comandos do Ato 1 (`cp … .claude/hooks/protecao-git-add.mjs`) mais o
registro no `settings.json`, que o `1-settings-projeto.json` já traz — um matcher `Bash` **novo**,
sem tocar no matcher `Edit|Write|MultiEdit` do `protecao-config`.

### Verificar (não pule)

A bateria de 22 casos roda sem instalar nada:

```bash
node docs/auditoria-v5/atos-humanos/2-protecao-git-add.teste.mjs
# esperado: TODOS OS CASOS PASSARAM
```

Depois de instalado, **veja bloquear de verdade** numa sessão nova. Peça ao agente:

```bash
git add -A
```

**Esperado:** a ferramenta é barrada e a mensagem do hook volta explicando a regra. Em seguida,
confirme que o caminho normal **não** foi quebrado: `git add README.md` tem de funcionar.

---

## Ato 3 — `superpowers` duplicado (E5)

### ⛔ Não faça nada. O achado está errado, e a medição prova.

O E5, herdado da v5.3.2, mandava *"desativar a cópia do projeto (v5.1.0), manter a global"*.
Conferido em 10/09 com `claude plugin list` e `claude plugin details`:

| instalação | versão | escopo | status real |
|---|---|---|---|
| `superpowers@claude-plugins-official` | **6.3.0** | `user` | **✔ enabled** — é a única que carrega |
| `superpowers@superpowers-marketplace` | **5.1.0** | `local` (`~/projects/wt-finance`) | **✘ disabled** |

**A cópia de projeto já está desabilitada.** O `.in_use` dela é de **28/07**; o da 6.3.0 é de
9–10/09. Não há duplicação ativa há seis semanas — a ação que o E5 pedia já aconteceu, por
alguma atualização do ambiente, e ninguém registrou. (A global também não é 6.2.0: atualizou
para 6.3.0 em 13/08.)

### O custo real, medido

```
claude plugin details superpowers@claude-plugins-official
```

```
Always-on:   ~688 tok   adicionado a toda sessão
```

688 tokens por sessão é **barato** — não é isso que o E5 queria atacar. O custo que dói é o
**disparo em bloco**: as 14 skills somam **~50 mil tokens** de `on-invoke` se todas dispararem
(as mais caras são `subagent-driven-development` ~11,8k e `writing-skills` ~9,7k).

**E a causa disso não é duplicação: é o mandato do próprio plugin.** A skill `using-superpowers`
é injetada no `SessionStart` e diz, em letras maiúsculas, que havendo **1% de chance** de uma
skill se aplicar, ela **deve** ser invocada. O disparo amplo é o comportamento projetado — com
uma instalação ou com duas.

### O que fazer, então

**1. Medir se o sintoma ainda existe.** Numa sessão nova, dê um prompt de domínio — *"quero
ajustar a cor de um badge na tabela da DRE"* — e observe se dispara **uma** skill
(`ui-design-system` / `tabela-densa`) ou o bloco inteiro.

- Disparou uma → **feche o E5 por verificação.** Não há o que desativar.
- Disparou o bloco → siga para o item 3. Não adianta mexer em instalação.

**2. Faxina opcional** (não resolve nada, só tira entulho de disco e da listagem):

```bash
claude plugin uninstall superpowers@superpowers-marketplace
```

⚠️ **Não remova a marketplace** `superpowers-marketplace` sem pensar: o
`episodic-memory@superpowers-marketplace` vem dela, tem escopo `local` neste projeto e está
**✔ enabled**. (O servidor MCP dele falhou com `CONNECTION_CLOSED` nesta sessão — é um segundo
assunto, não relacionado, mas vale olhar.)

**3. Se o bloco persistir, a decisão é de custo, não de configuração.** Manter e pagar, ou:

```bash
claude plugin disable superpowers@claude-plugins-official
```

Isso é **decisão sua** — o plugin traz brainstorming, TDD e debugging sistemático junto. Registre
no `WORKING-CONTEXT.md` qual foi, e o porquê.

### Efeito colateral

`docs/harness/sonda-disparo.md` só existe enquanto o E5 está aberto — é a medição do sintoma.
Fechado o E5 (por verificação ou por decisão), o arquivo pode ser apagado: era a condição que a
triagem do D8-005 impôs.

---

## Depois de aplicar os três

Atualize `docs/WORKING-CONTEXT.md`: a seção **Pendências do Yan** lista os três como abertos, e a
seção **Cuidados** traz hoje um 🔴 dizendo que a terceira camada **não** está configurada. Os dois
lugares precisam mudar juntos — foi a contradição entre eles que o revisor pegou como CRÍTICO na
v5.10.0, e seria irônico reintroduzi-la ao consertar a causa.
