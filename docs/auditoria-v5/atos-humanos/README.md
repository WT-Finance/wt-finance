# Atos humanos da v5.10.0

Mudanças que o agente **não aplica**, com o conteúdo pronto ao lado. Cada uma traz o comando exato
e **a verificação** — nenhuma vale sem ver funcionar.

**Por que o agente não aplica.** O hook `protecao-config` cobre 6 alvos, entre eles
`.claude/hooks/` (os hooks não se desarmam) e qualquer `.claude/settings.json`, inclusive o global.
O escape `WT_PERMITIR_CONFIG=1` é variável de ambiente da **sessão**, que o agente não alcança.
O protocolo é: ele propõe o diff pronto, você aplica.

> ⚠️ **O enforcement tem um furo, e está registrado no backlog v6.** O `protecao-config` casa só
> `Edit|Write|MultiEdit` e lê `tool_input.file_path` — um `cp` ou `sed` via Bash **não é
> interceptado**. A regra do projeto ("o agente não toca config") continua valendo por disciplina,
> mas a máquina não a segura inteira.

---

## 🔴 Antes de tudo: o settings da raiz está quebrado desde 28/07

Conferido em 13/09: **`~/projects/wt-finance/.claude/settings.json` não é JSON válido.** Alguém
aplicou o Ato 1 à mão e deixou uma vírgula sobrando antes do `}` que fecha `permissions`:

```json
    "Bash(npx supabase migration list)"
  ],          ← vírgula sobrando
},
  "hooks": {
```

```
SyntaxError: Expected double-quoted property name in JSON at position 416 (line 17 column 1)
```

Esse arquivo é o que declara os hooks. Inválido, **provavelmente nenhum hook carrega no checkout
raiz há seis semanas** — e a tentativa nunca teve `deny` nenhum. Foi uma aplicação que **falhou em
silêncio**, que é exatamente o modo de falha que estes atos existem para fechar.

O arquivo é *tracked* e a edição **não está commitada** (a versão em `main` não tem `permissions`).
Nada de valor se perde ao reverter: os `allow` que realmente valem na raiz estão no
`.claude/settings.local.json`, que é outro arquivo, válido e git-ignored.

### Passo 1 — desarmar

```bash
cd ~/projects/wt-finance
git status --short                     # veja se há outro trabalho não commitado antes
git checkout -- .claude/settings.json  # descarta a edição inválida
node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'));console.log('VALIDO')"
```

A versão boa — com `allow` e o hook novo — chega aqui no `git pull` depois do merge do PR 2
(Passo 5).

---

## Ato 1 — permissões (D10-001)

**O risco.** `supabase db push` cru passa **por fora** do wrapper `npm run db:migrate` e, com ele,
por fora da classificação aditiva/destrutiva, do backup-gate e do restore-test. E empurra **todo**
o conjunto pendente, inclusive destrutiva estacionada — foi assim que a v5.2.0 dropou bases por
arrasto.

**O outro lado.** Sem nenhum `allow`, o classificador **nega seco**, sem prompt, um comando que
escreve. Aconteceu duas vezes em 10/09, na poda de branches. A worktree não herda o
`settings.local.json` da raiz (é por diretório e git-ignored), então sessões de worktree ficavam
sem regra nenhuma.

**A divisão (decisão de 13/09):**

| onde | o quê | por quê |
|---|---|---|
| `~/.claude/settings.json` (global) | **`deny`** | `db push` cru é perigoso em **qualquer** repo Supabase desta máquina |
| `.claude/settings.json` do projeto (**versionado**) | **`allow`** + registro dos **hooks** | os gates são deste projeto; e regra versionada é a única que alcança toda worktree e sobrevive a trocar de máquina |

### Como as regras funcionam (confirmado na documentação)

Vale ler antes de mexer — regra malformada **falha em silêncio**, e isto é controle de segurança.

- **`Bash(cmd:*)` e `Bash(cmd *)` são equivalentes**; `:*` é a forma preferida. Não ponha `*` antes
  do subcomando (`Bash(npm * test *)` gera aviso na abertura).
- **`deny` vence `allow`, sempre** — ordem `deny` → `ask` → `allow`, sem desempate por
  especificidade. É o que protege contra o `Bash(npm run *)` largo que existe no
  `settings.local.json` da raiz.
- **Cadeia com `&&`, `;` ou `|` é quebrada em subcomandos e cada um é testado.** Então
  `cd /x && npx supabase db push` é pego — não dá para escapar encadeando.
- **Regra exata (sem `*`) casa literalmente**, e os dois-pontos de `db:migrate` **não** interferem
  no parsing. Por isso as duas invocações aditivas vão por extenso.
- **Precedência** (o topo vence): managed → linha de comando → `settings.local.json` →
  `settings.json` do projeto → global. As listas são **combinadas**, não substituídas.
- **O hook `PreToolUse` roda ANTES do fluxo de permissão.** Logo `Bash(git add:*)` no `allow`
  **não** dá passe livre ao `git add -A`: o hook do Ato 2 dispara primeiro.

### Passo 2 — `deny` no global

```bash
cd ~/projects/wt-finance/.claude/worktrees/chore+v5-10-0-limpeza-fechamento-v5

node -e "
const fs=require('fs'), G=process.env.HOME+'/.claude/settings.json';
const alvo=JSON.parse(fs.readFileSync(G,'utf8'));
const novo=JSON.parse(fs.readFileSync('docs/auditoria-v5/atos-humanos/1b-deny-global.json','utf8'));
fs.copyFileSync(G, G+'.bak-'+Date.now());
alvo.permissions={...(alvo.permissions||{}), deny:novo.permissions.deny};
fs.writeFileSync(G, JSON.stringify(alvo,null,2)+'\n');
console.log('chaves preservadas:', Object.keys(alvo).join(', '));
console.log('deny:', alvo.permissions.deny.length, '| defaultMode:', alvo.permissions.defaultMode);
"
```

**O merge é obrigatório** — copiar o arquivo por cima apagaria `model`, `enabledPlugins`,
`extraKnownMarketplaces`, `theme` e o `defaultMode: auto`. O `.bak-<timestamp>` é a saída de
emergência.

> `Bash(git push origin main:*)` no global também alcança outros repositórios desta máquina. Se
> incomodar em algum, mova **essa regra** para o settings do projeto: não empurrar para `main` é
> regra deste projeto, não universal. As de `--force` valem em todo lugar.

### Passo 3 — `allow` + hooks no projeto (faz o Ato 2 junto)

```bash
cd ~/projects/wt-finance/.claude/worktrees/chore+v5-10-0-limpeza-fechamento-v5

# 3.1 — o hook ANTES do settings que o registra.
#       Registrar o hook sem o arquivo faz TODA chamada Bash falhar.
cp docs/auditoria-v5/atos-humanos/2-protecao-git-add.mjs .claude/hooks/protecao-git-add.mjs

# 3.2 — o settings do projeto
cp docs/auditoria-v5/atos-humanos/1-settings-projeto.json .claude/settings.json

# 3.3 — validar ANTES de reiniciar (é o erro que a raiz cometeu em julho)
node -e "
const j=JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'));
console.log('allow', j.permissions.allow.length, '| PreToolUse', j.hooks.PreToolUse.length);
"
node -e "require('fs').accessSync('.claude/hooks/protecao-git-add.mjs');console.log('hook no lugar')"

# 3.4 — a bateria do hook, sem depender de instalação
node docs/auditoria-v5/atos-humanos/2-protecao-git-add.teste.mjs   # 22 casos
```

Você **não** precisa de `WT_PERMITIR_CONFIG=1`: o `protecao-config` intercepta as ferramentas de
edição **do agente**, não o seu shell.

Os dois arquivos são **versionados**. Depois de validar, peça o commit ao agente — entra no PR 2 e
a proteção passa a viajar com o repositório.

**Reinicie a sessão do Claude Code.** Settings e hooks são lidos na abertura.

---

## Ato 2 — hook `PreToolUse` contra `git add -A` (D8-022)

A regra "não usar `git add -A` cego" está no `CLAUDE.md` e é **só prosa**. Pela régua de 5
destinos, o que dá para segurar por máquina não deveria ser — este é o destino 1.

**Bloqueia:** `git add -A`, `--all`, `-a` (e combinações como `-vA`), `git add .`, `git add :/`.
**Não bloqueia, de propósito:** `git add <caminho>` (o padrão da casa), `git add -p`/`--patch`
(interativo é escolha consciente) e `git add -u` (só rastreados já modificados — não arrasta
arquivo novo, que é o risco real).

**Escapes:** `WT_PERMITIR_ADD_TUDO=1` para o caso legítimo pontual (primeiro commit de uma árvore
nova) e `WT_DESLIGAR_HOOKS=1` para emergência geral. Os dois são variável de ambiente da sessão —
o agente não os alcança; quem reexecuta é você.

**Uma sutileza que a bateria pegou:** a primeira regex bloqueava `git commit -m "não usar git add
-A"`, porque a frase estava no **texto** da mensagem — e as mensagens de commit deste projeto
citam a regra literalmente. O hook agora remove o conteúdo entre aspas antes de casar.

A instalação é o Passo 3 acima.

---

## Passo 4 — verificação (não pule)

Em uma sessão nova, depois de reiniciar:

| # | o que rodar | esperado |
|---|---|---|
| 1 | `npx supabase db push --dry-run` | **negado**, sem prompt — o `deny` do Passo 2 |
| 2 | `npx tsc --noEmit` · `npm run build` | rodam **sem** pedir confirmação — o `allow` do Passo 3 |
| 3 | `git add -A` | **barrado** pelo hook, com a mensagem explicando a regra |
| 4 | `git add README.md` | **funciona** — o caminho normal não pode ter sido quebrado |
| 5 | `npm run db:migrate -- --destrutiva` | **negado** pelo `deny`, antes mesmo do gate de TTY |

⚠️ **Use `--dry-run` no teste 1.** Um `db push` que execute aplicaria o conjunto pendente de verdade.

Se o teste 1 passar reto: confira se a sessão foi reiniciada e se o `deny` entrou no arquivo certo.

---

## Passo 5 — depois do merge do PR 2

```bash
cd ~/projects/wt-finance
git pull --ff-only     # traz a v5.10.0 (a raiz está em main@885da65, duas versões atrás)
ls .claude/hooks/      # protecao-git-add.mjs tem de aparecer
node -e "const j=require('./.claude/settings.json');console.log('allow',j.permissions.allow.length)"
```

---

## Ato 3 — `superpowers` duplicado (E5): **nada a aplicar**

O achado, herdado da v5.3.2, mandava *"desativar a cópia do projeto (v5.1.0), manter a global"*.
Conferido em 10/09 e reconfirmado em 13/09 — **já está desativada**, e agora com o mecanismo à vista:

```json
// ~/projects/wt-finance/.claude/settings.local.json
"enabledPlugins": {
  "episodic-memory@superpowers-marketplace": true,
  "superpowers@superpowers-marketplace": false     ← a duplicata, desligada
}
```

`claude plugin list` confirma: `@claude-plugins-official` **6.3.0 ✔ enabled** (não 6.2.0 — atualizou
em 13/08) e `@superpowers-marketplace` **5.1.0 ✘ disabled**, com `.in_use` parado em **28/07**.

**O custo real, medido** (`claude plugin details`): **~688 tokens** de always-on, que é barato e não
é o que o achado queria atacar. O que dói é o **disparo em bloco** — as 14 skills somam **~50 mil
tokens** de `on-invoke` (`subagent-driven-development` ~11,8k e `writing-skills` ~9,7k as maiores).
E isso **não vem de duplicação**: vem do mandato do próprio plugin, cuja skill `using-superpowers`
manda invocar havendo 1% de chance de aplicar. Com uma instalação ou com duas.

**Vira decisão de custo, não tarefa de configuração.** Numa sessão nova, dê um prompt de domínio
("ajustar a cor de um badge na tabela da DRE") e veja se dispara **uma** skill ou o bloco:

- uma só → **feche o E5 por verificação**;
- o bloco → escolha entre pagar ou `claude plugin disable superpowers@claude-plugins-official`
  (o plugin traz brainstorming, TDD e debugging sistemático junto — não é óbvio).

Faxina opcional: `claude plugin uninstall superpowers@superpowers-marketplace`. **Não remova a
marketplace** — o `episodic-memory` vem dela e está habilitado.

`docs/harness/sonda-disparo.md` só existe enquanto o E5 está aberto; fechada a decisão, pode sair.

---

## Fica registrado, não resolvido

- **`Bash(npm run *)`** no `settings.local.json` da raiz auto-aprova qualquer script npm, inclusive
  o wrapper de migration. O `deny` do Passo 2 cobre o caso perigoso, mas a regra larga continua —
  junto de `Read(//etc/**)` e `Read(//home/yan-wt/.claude/**)`. Pendência desde a v5.3.2; decisão
  de 13/09 foi **não** mexer nesta rodada.
- **Furo do `protecao-config`** com Bash (topo deste arquivo) → backlog v6.

## Depois de aplicar

Atualize `docs/WORKING-CONTEXT.md`: a seção **Pendências do Yan** lista os atos como abertos e a
seção **Cuidados** traz um 🔴 dizendo que a terceira camada **não** está configurada. Os dois
precisam mudar juntos — foi a contradição entre eles que o revisor pegou como CRÍTICO na v5.10.0,
e seria irônico reintroduzi-la ao consertar a causa.
