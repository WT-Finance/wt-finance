# Atos humanos da v5.10.0 — diff pronto, aplicação do Yan

Três achados da auditoria caem em território que **o agente não toca por desenho**:
`.claude/settings.json` e `.claude/hooks/` são bloqueados pelo hook `protecao-config`, e o
escape `WT_PERMITIR_CONFIG=1` é variável de ambiente da **sessão** — o agente não a alcança.
O protocolo (D5 do core) manda: não contornar, completar o que não depende do passo barrado,
**deixar o ambiente pronto** e sinalizar. É o que esta pasta é.

Nada aqui está instalado. São arquivos de proposta, versionados para ficarem revisáveis no
diff do PR.

---

## Ato 1 — `deny` do `db push` cru e `allow` estreito dos gates (D10-001)

**O achado.** O `CLAUDE.md` descreve uma "terceira camada" de permissões, com regra de
`allow` estreita e um `deny` de `npx supabase db push` cru protegendo o backup-gate. Essa
camada **não existe**: nem `.claude/settings.json` (só hooks) nem `~/.claude/settings.json`
(só `defaultMode: "auto"`) têm qualquer regra de `allow`/`deny`. Hoje é prosa.

**Por que importa.** `npx supabase db push` cru passa por fora do wrapper
`npm run db:migrate` e, com ele, por fora da classificação aditiva/destrutiva, do
backup-gate e do restore-test. Pior: `db push` empurra **todo** o conjunto pendente —
inclusive uma destrutiva estacionada na pasta. A única proteção hoje é disciplina, e a
v5.2.0 já mostrou o custo de confiar nisso (dropou bases por arrasto).

**O que aplicar:** `docs/auditoria-v5/atos-humanos/1-settings-projeto.json` é o conteúdo
proposto para `.claude/settings.json`. Ele **preserva os três hooks atuais** e acrescenta
o bloco `permissions` mais o hook do Ato 2.

⚠️ **Confira o `allow` antes de aplicar.** Regra de `allow` explícita dispensa o
classificador — é conveniência, mas cada linha alarga o que roda sem prompt. A lista
proposta cobre só gates de leitura, os dois comandos read-only do Supabase e o wrapper
aditivo. Corte o que não quiser.

---

## Ato 2 — hook que barra `git add -A` (D8-022)

**O achado.** "Não usar `git add -A` cego" é regra do `CLAUDE.md`, e é só prosa. Pela régua
de 5 destinos, o que dá para segurar por máquina não deveria ser prosa.

**O que aplicar:** `docs/auditoria-v5/atos-humanos/2-protecao-git-add.mjs` é o hook pronto,
escrito no mesmo contrato do `protecao-config` (lê o payload do stdin, `exit 2` bloqueia e
devolve o stderr ao agente, escape por variável de ambiente). Bloqueia `-A`, `--all`, `-a`,
`git add .` e `git add :/`; **não** bloqueia caminho explícito, `-p` nem `-u`. Escape
pontual: `WT_PERMITIR_ADD_TUDO=1`.

O registro dele no `settings.json` já está no arquivo do Ato 1.

**Já foi testado — 22 casos, todos passando** (`2-protecao-git-add.teste.mjs`, rode com
`node docs/auditoria-v5/atos-humanos/2-protecao-git-add.teste.mjs`). A bateria pegou **dois
falsos positivos** na primeira versão, e os dois valem a leitura porque explicam o desenho
final:

1. `git commit -m "não usar git add -A"` era **bloqueado** — a regex casava a palavra `add`
   em qualquer lugar depois de `git`. Corrigido ancorando `add` como **subcomando** (com as
   opções globais `-C`, `-c`, `--no-pager` etc. podendo vir antes).
2. Mesmo ancorado, `git commit -m "... git add -A ..."` seguia bloqueado, porque a string
   literal aparecia na mensagem. Corrigido removendo os trechos **entre aspas** antes de
   casar: texto entre aspas não é comando. Sem isso o hook brigaria com as próprias
   mensagens de commit deste repositório, que citam a regra ao pé da letra.

---

## Ato 3 — `superpowers` duplicado (E5)

**Estado real, medido em 10/09/2026 — o achado já está meio resolvido.** O E5 descrevia
"global v6.2.0 + projeto v5.1.0, os dois ativos, fazendo a sessão invocar todas as skills
em bloco". Hoje:

| cópia | versão | escopo | habilitada? |
|---|---|---|---|
| `superpowers@claude-plugins-official` | **6.3.0** | user (global) | `true` em `~/.claude/settings.json` |
| `superpowers@superpowers-marketplace` | **5.1.0** | local, `projectPath=/home/yan-wt/projects/wt-finance` | **`false`** em `.claude/settings.local.json` |

Ou seja: a duplicata **já está desligada**. O que resta é resíduo — a cópia 5.1.0 segue
*instalada* no registro de plugins, e o `false` que a desliga mora em
`.claude/settings.local.json`, que **não é versionado**: um clone novo do repositório não
herda esse desligamento.

**O que fazer, se quiser fechar de vez** (opcional — não há sintoma ativo hoje):

```bash
# remove a cópia 5.1.0 do registro, para não poder voltar por engano
claude plugin uninstall superpowers@superpowers-marketplace
```

**Não** desabilite a global 6.3.0: é a que está em uso.

---

## Depois de aplicar

Os Atos 1 e 2 mexem em arquivo protegido, então precisam do escape na **sua** sessão:

```bash
cd /home/yan-wt/projects/wt-finance

# Ato 2 primeiro (o settings do Ato 1 já referencia o hook — instalar na ordem inversa
# deixaria uma janela em que o settings aponta para um arquivo que não existe)
cp .claude/worktrees/chore+v5-10-0-limpeza-fechamento-v5/docs/auditoria-v5/atos-humanos/2-protecao-git-add.mjs \
   .claude/hooks/protecao-git-add.mjs

# Ato 1 (revise o allow antes; as chaves "//..." são comentários e podem sair)
$EDITOR .claude/worktrees/chore+v5-10-0-limpeza-fechamento-v5/docs/auditoria-v5/atos-humanos/1-settings-projeto.json
cp .claude/worktrees/chore+v5-10-0-limpeza-fechamento-v5/docs/auditoria-v5/atos-humanos/1-settings-projeto.json \
   .claude/settings.json

# conferir que o hook novo dispara (deve BLOQUEAR e imprimir a mensagem)
echo '{"tool_input":{"command":"git add -A"}}' | node .claude/hooks/protecao-git-add.mjs; echo "exit=$?  (esperado 2)"
echo '{"tool_input":{"command":"git add src/lib/fmt.ts"}}' | node .claude/hooks/protecao-git-add.mjs; echo "exit=$?  (esperado 0)"
```

O `cp` para `.claude/hooks/` e `.claude/settings.json` é feito por **você**, no seu shell —
o hook `protecao-config` bloqueia o agente nesses caminhos, e é essa a intenção.
