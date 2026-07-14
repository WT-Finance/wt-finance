#!/usr/bin/env node
// contexto-sessao.mjs — SessionStart
// Injeta docs/WORKING-CONTEXT.md (a "verdade atual" do projeto) no contexto da sessão
// nova, para que qualquer sessão — inclusive remota — parta do estado correto sem
// re-explorar o repositório. Informativo; nunca bloqueia.
import { readFileSync, existsSync } from 'node:fs';

if (process.env.WT_DESLIGAR_HOOKS === '1') process.exit(0);

const CAMINHO = 'docs/WORKING-CONTEXT.md';
try {
  if (existsSync(CAMINHO)) {
    const conteudo = readFileSync(CAMINHO, 'utf8').trim();
    if (conteudo) {
      console.log('=== WORKING-CONTEXT (verdade atual do projeto) ===');
      console.log(conteudo);
      console.log('=== fim do WORKING-CONTEXT ===');
    }
  }
} catch {
  // silencioso — a ausência do arquivo não é erro
}
process.exit(0);
