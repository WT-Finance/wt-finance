// Insumo D2 — mapa RPC → chamadores no código (src/) e no seed (supabase/seed/), a partir de catalogo-funcoes.txt.
// Uso: node docs/auditoria-v5/_insumos/mapa-rpc-chamadores.mjs > docs/auditoria-v5/_insumos/mapa-rpc-chamadores.txt
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const bruto = readFileSync('docs/auditoria-v5/_insumos/catalogo-funcoes.txt', 'utf8');
const json = JSON.parse(bruto.slice(bruto.indexOf('{')));
const funcoes = json.rows;

function contar(nome, dir) {
  try {
    const out = execFileSync('grep', ['-rlw', '--include=*.ts', '--include=*.tsx', '--include=*.mjs', '--include=*.sql', nome, dir], { encoding: 'utf8' });
    return out.trim().split('\n').filter(Boolean);
  } catch { return []; }
}
function contarMigrations(nome) {
  try {
    const out = execFileSync('grep', ['-rlw', nome, 'supabase/migrations'], { encoding: 'utf8' });
    return out.trim().split('\n').filter(Boolean).length;
  } catch { return 0; }
}

const linhas = ['schema|nome|args|grants|src_arquivos|seed_arquivos|migrations_n|outras_funcoes_que_citam'];
// referência cruzada entre funções: citação do nome dentro do def de outra função
let defs = [];
try {
  const d = readFileSync('docs/auditoria-v5/_insumos/catalogo-funcoes-def.txt', 'utf8');
  defs = JSON.parse(d.slice(d.indexOf('{'))).rows;
} catch {}

for (const f of funcoes) {
  const src = contar(f.nome, 'src');
  const seed = contar(f.nome, 'supabase/seed');
  const mig = contarMigrations(f.nome);
  const re = new RegExp(`\\b${f.nome}\\b`);
  const citadaPor = defs.filter((d) => d.nome !== f.nome && re.test(d.def)).map((d) => `${d.schema}.${d.nome}`);
  linhas.push([f.schema, f.nome, f.args, f.grants ?? '', src.join(' '), seed.join(' '), mig, citadaPor.join(' ')].join('|'));
}
process.stdout.write(linhas.join('\n') + '\n');
