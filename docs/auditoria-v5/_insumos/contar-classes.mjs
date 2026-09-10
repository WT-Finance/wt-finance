// Contagem mecânica dos achados por dimensão × classe (auto-auditoria do relatorio.md).
// Uso: node docs/auditoria-v5/_insumos/contar-classes.mjs
import { readFileSync, readdirSync } from 'node:fs';
const dir = 'docs/auditoria-v5';
const classes = ['apagar', 'corrigir', 'simplificar', 'documentar', 'decidir'];
const total = Object.fromEntries(classes.map((c) => [c, 0]));
const linhas = [];
for (const f of readdirSync(dir).filter((f) => /^D\d+-.*\.md$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))) {
  const txt = readFileSync(`${dir}/${f}`, 'utf8');
  const rows = txt.split('\n').filter((l) => /^\| D\d+-\d{3} \|/.test(l));
  const cnt = Object.fromEntries(classes.map((c) => [c, 0]));
  let outras = 0;
  for (const r of rows) {
    const cols = r.split(/(?<!\\)\|/).map((s) => s.trim());
    const classe = cols[7];
    if (classe in cnt) cnt[classe]++; else outras++;
  }
  classes.forEach((c) => (total[c] += cnt[c]));
  linhas.push(`| ${f.replace('.md', '')} | ${rows.length} | ${classes.map((c) => cnt[c]).join(' | ')} |${outras ? ` ⚠ ${outras} classe(s) fora do padrão` : ''}`);
}
const soma = Object.values(total).reduce((a, b) => a + b, 0);
process.stdout.write(`| dimensão | achados | ${classes.join(' | ')} |\n|---|---|${classes.map(() => '---').join('|')}|\n${linhas.join('\n')}\n| **total** | **${soma}** | ${classes.map((c) => `**${total[c]}**`).join(' | ')} |\n`);
