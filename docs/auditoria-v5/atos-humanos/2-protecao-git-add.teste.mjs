#!/usr/bin/env node
// Bateria do hook `protecao-git-add` — roda SEM instalar nada:
//     node docs/auditoria-v5/atos-humanos/2-protecao-git-add.teste.mjs
//
// Testa o ARTEFATO ao lado (`2-protecao-git-add.mjs`), que é o que se copia para
// `.claude/hooks/`. Depois de instalar, vale rodar de novo apontando para o instalado:
//     HOOK=.claude/hooks/protecao-git-add.mjs node docs/.../2-protecao-git-add.teste.mjs
//
// HISTÓRICO DESTA BATERIA — por que ela cresceu de 21 para 31 casos (v5.10.0, fechamento):
// o `revisor` achou TRÊS falsos negativos que a versão de 21 casos não cobria, todos
// confirmados ao vivo antes da correção. A bateria existia justamente para pegá-los e não
// pegou, porque testava o que o autor já sabia que funcionava:
//   1. `bash -c 'git add -A'` — a remoção de TODO texto entre aspas apagava o próprio
//      comando. Vale para `sh -c`, `eval`, `ssh host '…'`. Pior que não ter hook.
//   2. `git add -- .` — o `--` idiomático antes do pathspec escapava do padrão.
//   3. `git add -vA` — o cluster de flags exigia `a` MINÚSCULO, sem flag `i`.
// Lição: caso de teste que nasce DEPOIS da regex só confirma a regex. Os casos que valem
// são os que um adversário tentaria.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const HOOK = process.env.HOOK ?? join(AQUI, '2-protecao-git-add.mjs');

const BLOQUEIA = 2;
const PASSA = 0;

/** [rótulo, comando, esperado, env?] */
const CASOS = [
  // ── os 3 falsos negativos que o revisor achou no fechamento ──────────────────
  ['interpretador: bash -c',        "bash -c 'git add -A'",                 BLOQUEIA],
  ['interpretador: sh -c',          'sh -c "git add -A"',                   BLOQUEIA],
  ['interpretador: eval',           'eval "git add -A"',                    BLOQUEIA],
  ['pathspec com -- .',             'git add -- .',                         BLOQUEIA],
  ['pathspec com -- :/',            'git add -- :/',                        BLOQUEIA],
  ['cluster -vA',                   'git add -vA',                          BLOQUEIA],
  ['cluster -Av',                   'git add -Av',                          BLOQUEIA],

  // ── stage cego nas formas diretas ───────────────────────────────────────────
  ['-A',                            'git add -A',                           BLOQUEIA],
  ['--all',                         'git add --all',                        BLOQUEIA],
  ['-a',                            'git add -a',                           BLOQUEIA],
  ['ponto',                         'git add .',                            BLOQUEIA],
  ['raiz :/',                       'git add :/',                           BLOQUEIA],
  ['espaços extras',                'git add   -A  ',                       BLOQUEIA],
  ['encadeado após &&',             'npm run lint && git add -A',           BLOQUEIA],
  ['opção global --no-pager',       'git --no-pager add --all',             BLOQUEIA],
  ['opção global -C',               'git -C /outro/dir add -A',             BLOQUEIA],
  ['-A com pathspec depois',        'git add -A -- src/',                   BLOQUEIA],
  ['-m não é escudo p/ o add',      'git commit -m "x" && git add -A',      BLOQUEIA],

  // ── o caminho normal da casa NÃO pode quebrar ───────────────────────────────
  ['caminho explícito',             'git add src/lib/fmt.ts',               PASSA],
  ['dois caminhos',                 'git add docs/ src/',                   PASSA],
  ['migration nomeada',             'git add supabase/migrations/0269_x.sql', PASSA],
  ['patch interativo -p',           'git add -p',                           PASSA],
  ['patch interativo --patch',      'git add --patch src/',                 PASSA],
  ['só rastreados -u',              'git add -u',                           PASSA],
  ['status',                        'git status --short',                   PASSA],
  ['arquivo com hífen inicial',     'git add -- -analise.csv',              PASSA],

  // ── a regra citada no TEXTO da mensagem (o falso positivo que motivou o hook) ─
  ['mensagem cita a regra',         'git commit -m "nao usar git add -A cego (CLAUDE.md)"', PASSA],
  ['mensagem em aspas simples',     "git commit -m 'menciona git add -A no texto'",         PASSA],
  ['mensagem com --message=',       'git commit --message="git add -A no texto"',           PASSA],

  // ── escapes (variável de ambiente da sessão; o agente não as alcança) ───────
  ['escape WT_PERMITIR_ADD_TUDO',   'git add -A', PASSA, { WT_PERMITIR_ADD_TUDO: '1' }],
  ['escape WT_DESLIGAR_HOOKS',      'git add -A', PASSA, { WT_DESLIGAR_HOOKS: '1' }],
];

let falhas = 0;
let secao = '';
const SECOES = {
  0: 'os 3 falsos negativos que o revisor achou',
  7: 'stage cego nas formas diretas',
  18: 'o caminho normal da casa (não pode quebrar)',
  26: 'a regra citada no TEXTO da mensagem',
  29: 'escapes',
};

CASOS.forEach(([rotulo, comando, esperado, env], i) => {
  if (SECOES[i] && SECOES[i] !== secao) {
    secao = SECOES[i];
    console.log(`\n=== ${secao} ===`);
  }
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_input: { command: comando } }),
    env: { ...process.env, WT_PERMITIR_ADD_TUDO: '', WT_DESLIGAR_HOOKS: '', ...(env ?? {}) },
    encoding: 'utf8',
  });
  const ok = r.status === esperado;
  if (!ok) falhas++;
  const verbo = esperado === BLOQUEIA ? 'bloqueia' : 'passa';
  console.log(
    `  ${ok ? 'OK    ' : 'FALHOU'} exit=${r.status} (${verbo})  ${rotulo.padEnd(30)} ${comando}`,
  );
});

console.log(`\n${CASOS.length} casos · ${CASOS.length - falhas} OK · ${falhas} falha(s)`);
if (falhas > 0) {
  console.error('\nBATERIA REPROVOU — não instale o hook assim.');
  process.exit(1);
}
console.log('TODOS OS CASOS PASSARAM');
