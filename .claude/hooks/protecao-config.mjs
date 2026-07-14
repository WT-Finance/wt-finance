#!/usr/bin/env node
// protecao-config.mjs — PreToolUse (Edit|Write|MultiEdit)
// BLOQUEIA edição em configs de gate: o gate incômodo se resolve corrigindo o código,
// nunca afrouxando a config. Alteração legítima = checkpoint com o usuário +
// reexecução com WT_PERMITIR_CONFIG=1. (Racional: mesmo do lint wt/*, v4.26/v4.27.)
import { readFileSync } from 'node:fs';

if (process.env.WT_DESLIGAR_HOOKS === '1' || process.env.WT_PERMITIR_CONFIG === '1') {
  process.exit(0);
}

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0); // payload ilegível → não bloquear às cegas
}

const fp = String(input.tool_input?.file_path ?? '');
if (!fp) process.exit(0);

// ATENÇÃO (missão de instalação): conferir/ajustar o caminho REAL das regras wt/*
// (eslint-plugin local) no repositório e incluí-lo abaixo.
const PROTEGIDOS = [
  /(^|\/)eslint\.config\.[cm]?js$/,
  /(^|\/)tsconfig(\.[\w-]+)?\.json$/,
  /(^|\/)\.prettierrc(\.[\w]+)?$/,
  /(^|\/)eslint-rules\//,          // regras wt/* — ajustar ao caminho real
  /(^|\/)\.claude\/hooks\//,       // os próprios hooks não se desarmam
  /(^|\/)\.claude\/settings\.json$/,
];

if (PROTEGIDOS.some((r) => r.test(fp))) {
  console.error(
    `[protecao-config] Edição BLOQUEADA: ${fp} é config de gate do projeto.\n` +
      `Regra (CLAUDE.md/Salvaguardas): gate incômodo se corrige no CÓDIGO, nunca ` +
      `afrouxando a config. Se a alteração de config for legítima, PARE, apresente a ` +
      `mudança ao usuário como checkpoint e aguarde; a reexecução aprovada usa ` +
      `WT_PERMITIR_CONFIG=1.`
  );
  process.exit(2); // exit 2 = bloqueia a ferramenta; stderr volta ao agente
}

process.exit(0);
