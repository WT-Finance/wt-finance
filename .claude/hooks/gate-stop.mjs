#!/usr/bin/env node
// gate-stop.mjs — Stop
// Varre os .ts/.tsx modificados em src/ (git status na worktree corrente) atrás de:
//   1. console.log residual (console.error/warn passam);
//   2. shorthand Tailwind v3 inválido `-[--token]` — cor silenciosamente descartada
//      (classe do bug das 81 ocorrências, v4.16.1). A forma correta é `[var(--token)]`.
// Achou → exit 2 (a resposta não fecha; achados voltam ao agente para corrigir).
// build/tsc/lint/test continuam sendo os gates serializados de fim de missão —
// este hook cobre apenas o que é barato varrer a cada resposta.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

if (process.env.WT_DESLIGAR_HOOKS === '1') process.exit(0);

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}
// Guard anti-loop: se este Stop já foi provocado por um hook, não bloquear de novo.
if (input.stop_hook_active) process.exit(0);

let porcelain = '';
try {
  porcelain = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
} catch {
  process.exit(0); // fora de um repo git → nada a fazer
}

const arquivos = porcelain
  .split('\n')
  .filter(Boolean)
  .map((l) => l.slice(3).trim())
  .map((p) => (p.includes(' -> ') ? p.split(' -> ')[1] : p))
  .filter((p) => p.startsWith('src/') && /\.(ts|tsx)$/.test(p) && !/\.test\./.test(p));

if (arquivos.length === 0) process.exit(0);

const achados = [];
for (const arq of arquivos) {
  let conteudo = '';
  try {
    conteudo = readFileSync(arq, 'utf8');
  } catch {
    continue; // deletado/renomeado
  }
  conteudo.split('\n').forEach((linha, i) => {
    if (/console\.log\(/.test(linha)) {
      achados.push(`${arq}:${i + 1} — console.log residual`);
    }
    if (/[A-Za-z0-9\]]-\[--[A-Za-z]/.test(linha)) {
      achados.push(
        `${arq}:${i + 1} — shorthand Tailwind inválido \`-[--token]\` ` +
          `(cor descartada em silêncio; usar \`[var(--token)]\` ou a utilitária do @theme)`
      );
    }
  });
}

if (achados.length > 0) {
  console.error(
    `[gate-stop] ${achados.length} achado(s) nos arquivos modificados — corrigir antes de encerrar:\n` +
      achados.map((a) => `  - ${a}`).join('\n')
  );
  process.exit(2);
}

process.exit(0);
