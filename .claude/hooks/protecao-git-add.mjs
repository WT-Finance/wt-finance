#!/usr/bin/env node
// protecao-git-add.mjs — PreToolUse (Bash)
//
// ATO HUMANO 2 da v5.10.0 (achado D8-022). ESTE ARQUIVO AINDA NÃO ESTÁ INSTALADO:
// mora em docs/auditoria-v5/atos-humanos/ porque `.claude/hooks/` é território protegido
// pelo `protecao-config` — o agente não instala hook, por desenho. Ver o README ao lado
// para o comando de instalação.
//
// BLOQUEIA `git add -A` / `git add -a` / `git add .` / `git add :/`.
// Racional (CLAUDE.md/Disciplina): "Não usar `git add -A` cego". A regra existe porque um
// stage cego arrasta arquivo não relacionado para dentro do commit da missão — e o custo
// aparece depois, no PR, quando já é história. Hoje a regra é só prosa; este hook é o
// destino 1 da régua de 5 destinos ("o que dá para segurar por máquina não vira prosa").
//
// O QUE NÃO BLOQUEIA, de propósito:
//   • `git add <caminho>` explícito, que é o padrão da casa
//   • `git add -p` / `--patch` (interativo, é escolha consciente)
//   • `git add -u` (só rastreados já modificados — não arrasta arquivo novo, que é o
//     risco real; se um dia isso incomodar, some `-u` à regex)
//
// ESCAPES: `WT_DESLIGAR_HOOKS=1` (emergência geral, registrar no out-briefing) e
// `WT_PERMITIR_ADD_TUDO=1` (para o caso legítimo pontual — ex.: primeiro commit de uma
// árvore nova). O escape é variável de ambiente da SESSÃO: o agente não a alcança por
// desenho, o humano é que reexecuta.
import { readFileSync } from 'node:fs';

if (process.env.WT_DESLIGAR_HOOKS === '1' || process.env.WT_PERMITIR_ADD_TUDO === '1') {
  process.exit(0);
}

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0); // payload ilegível → não bloquear às cegas (mesma escolha do protecao-config)
}

const cmd = String(input.tool_input?.command ?? '');
if (!cmd) process.exit(0);

// NEUTRALIZAR A MENSAGEM DE COMMIT — e SÓ ela.
//
// A 1ª versão apagava TODO texto entre aspas, partindo de "texto entre aspas não é
// comando". Isso é verdade para `git commit -m "…"` e FALSO para qualquer forma que passe
// o comando real como string a um interpretador: `bash -c 'git add -A'`, `sh -c "…"`,
// `eval "…"`, `ssh host '…'`. Nesses casos a remoção apagava justamente o `git add -A`, e
// o hook liberava — pior que não existir, porque dava confiança injustificada. Achado
// CRÍTICO do revisor no fechamento da v5.10.0, confirmado ao vivo.
//
// A correção é cirúrgica: neutraliza só o ARGUMENTO de `-m`/`--message`, que era o único
// falso positivo real (as mensagens de commit deste projeto citam a regra literalmente).
const semMensagem = cmd.replace(
  /(^|\s)(-m|--message)(?:=|\s+)(?:'[^']*'|"(?:[^"\\]|\\.)*"|\S+)/g,
  '$1$2 MSG',
);

// As ASPAS RESTANTES viram espaço — o CONTEÚDO fica visível ao scanner. É o que faz
// `bash -c 'git add -A'` ser enxergado: some a aspa, sobra o comando.
// Efeito colateral aceito: `echo "git add -A"` passa a ser bloqueado. Bloquear um `echo`
// inofensivo custa uma reexecução; liberar um `bash -c` de stage cego custa o commit.
const alvo = semMensagem.replace(/['"]/g, ' ');

// `add` tem de ser o SUBCOMANDO do git, não uma palavra qualquer depois dele — daí a
// âncora com as opções GLOBAIS que podem preceder o subcomando (`git -C /dir add …`).
const GLOBAIS = String.raw`(?:-C\s+\S+|-c\s+\S+|--no-pager|--git-dir=\S+|--work-tree=\S+|--exec-path=\S+)`;
const GIT_ADD = String.raw`\bgit\s+(?:${GLOBAIS}\s+)*add\b`;

// Argumentos do `add` = daqui até o próximo separador de comando.
const ARGS = String.raw`[^;&|]*`;

const PADROES = [
  // `-A` / `--all` como token exato.
  new RegExp(GIT_ADD + ARGS + String.raw`(?:^|\s)(?:-A|--all)(?:\s|$)`),

  // Cluster de flags curtas contendo `a` OU `A` — pega `-a`, `-vA`, `-Av`, `-va`.
  // A 1ª versão exigia `a` MINÚSCULO e sem flag `i`, então `-vA` passava: a documentação
  // afirmava cobrir "combinações como -vA" e não cobria (2º CRÍTICO do revisor).
  // O `[A-Za-z]*` fecha em `\s|$`, então um caminho como `-analise.csv` não casa — o `.`
  // quebra o token antes do fim, que é a guarda natural contra esse falso positivo.
  new RegExp(GIT_ADD + ARGS + String.raw`(?:^|\s)-[A-Za-z]*[aA][A-Za-z]*(?:\s|$)`),

  // `.` ou `:/` como pathspec, com o `--` idiomático OPCIONAL no meio.
  // `git add -- .` é equivalente a `git add .` e passava batido (3º CRÍTICO do revisor).
  new RegExp(GIT_ADD + String.raw`\s+(?:--\s+)?(?:\.|:\/)(?:\s|$)`),
];

if (PADROES.some((r) => r.test(alvo))) {
  console.error(
    `[protecao-git-add] BLOQUEADO: stage cego em \`${cmd.slice(0, 120)}\`.\n` +
      `Regra (CLAUDE.md/Disciplina): "Não usar \`git add -A\` cego" — um stage cego arrasta ` +
      `arquivo não relacionado para o commit da missão, e o custo só aparece no PR.\n` +
      `Faça \`git add\` dos CAMINHOS específicos da missão. Se o stage amplo for mesmo ` +
      `legítimo (ex.: primeiro commit de uma árvore nova), PARE, mostre ao usuário o que ` +
      `seria adicionado (\`git status --short\`) e aguarde; a reexecução aprovada usa ` +
      `WT_PERMITIR_ADD_TUDO=1.`
  );
  process.exit(2); // exit 2 = bloqueia a ferramenta; stderr volta ao agente
}

process.exit(0);
