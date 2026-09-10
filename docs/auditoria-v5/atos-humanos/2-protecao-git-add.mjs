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

// TEXTO ENTRE ASPAS NÃO É COMANDO. Removido antes de casar qualquer padrão, senão
// `git commit -m "não usar git add -A"` é bloqueado — e as mensagens de commit deste
// projeto citam a regra literalmente, então o hook brigaria com o próprio CLAUDE.md.
// (Os dois falsos positivos que a bateria de teste pegou eram exatamente isto.)
// O que sobra depois da remoção é a estrutura do comando, que é o que interessa.
const semAspas = cmd
  .replace(/'[^']*'/g, "''")
  .replace(/"(?:[^"\\]|\\.)*"/g, '""');

// `add` tem de ser o SUBCOMANDO do git, não uma palavra qualquer depois dele.
//
// A 1ª versão desta regex era `\bgit\b[^;&|]*?\badd\b[^;&|]*?(-A|--all)` e reprovou no
// próprio teste: bloqueava `git commit -m "não usar git add -A"`, porque a palavra estava
// no TEXTO da mensagem. Falso positivo que morderia todo dia — as mensagens de commit
// deste projeto citam a regra literalmente. Daí a âncora: `git`, opcionalmente seguido das
// opções GLOBAIS que podem preceder o subcomando, e então `add`.
const GLOBAIS = String.raw`(?:-C\s+\S+|-c\s+\S+|--no-pager|--git-dir=\S+|--work-tree=\S+|--exec-path=\S+)`;
const GIT_ADD = String.raw`\bgit\s+(?:${GLOBAIS}\s+)*add\b`;

// Argumentos do `add` = daqui até o próximo separador de comando.
const ARGS = String.raw`[^;&|]*`;

const PADROES = [
  new RegExp(GIT_ADD + ARGS + String.raw`(?:^|\s)(?:-A|--all)(?:\s|$)`),
  new RegExp(GIT_ADD + ARGS + String.raw`(?:^|\s)-[A-Za-z]*a[A-Za-z]*(?:\s|$)`), // -a e combinações
  new RegExp(GIT_ADD + String.raw`\s+(?:\.|:\/)(?:\s|$)`),
];

if (PADROES.some((r) => r.test(semAspas))) {
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
