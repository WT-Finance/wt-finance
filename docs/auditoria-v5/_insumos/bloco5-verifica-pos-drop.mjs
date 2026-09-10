// Bloco 5 — verificação PÓS-DROP, para rodar depois de aplicar a 0270 em TTY.
//   node docs/auditoria-v5/_insumos/bloco5-verifica-pos-drop.mjs
//
// Duas metades, e as duas importam:
//   (A) os caminhos VIVOS seguem 200 — é o que prova que o DROP não quebrou tela nenhuma;
//   (B) os alvos devolvem 404/PGRST202 — é o que prova que o DROP teve efeito de verdade
//       (o guard dentro da migration já cobre isso no banco; aqui é pela porta do REST,
//       que é por onde o app entra).
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('/home/yan-wt/projects/wt-finance/.env.local', 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const URL = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/(rest\/v1\/?)?$/, '')
const KEY = env.SUPABASE_SERVICE_ROLE_KEY

async function rpc(fn, args = {}) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  return { status: r.status, corpo: (await r.text()).slice(0, 120) }
}

const HOJE = { p_from: '2026-01-01', p_to: '2026-12-31' }
let falhas = 0

console.log('(A) CAMINHOS VIVOS — todos tem de seguir 200')
for (const [fn, args] of [
  ['get_fluxo_caixa_kpis_b', { p_from: '2026-01-01', p_to: '2026-12-31' }],
  ['get_gerencial_lancamentos', { p_limit: 5 }],
  ['get_gerencial_saldos', {}],
  ['get_gerencial_projecao_diaria', { p_dias: 30 }],
  ['get_gerencial_lancamentos_planilha', {}],
  ['get_sumario_subsetor', HOJE],        // FICA — nome parecido com o que saiu
  ['get_minhas_permissoes', {}],         // ocupou o lugar de get_my_profile
  ['get_dashboard_config', {}],          // le app.config direto
  ['get_decomposicao_bloco', { p_from: '2026-01-01', p_to: '2026-01-31' }], // NAO entrou na 0270
]) {
  const r = await rpc(fn, args)
  const ok = r.status === 200
  if (!ok) falhas++
  console.log(`   ${ok ? 'OK   ' : 'FALHA'} ${r.status}  ${fn}${ok ? '' : '  ' + r.corpo}`)
}

console.log('\n(B) ALVOS — todos tem de ter SUMIDO (404 / PGRST202)')
for (const [fn, args] of [
  ['get_fluxo_caixa_kpis_diario', {}],
  ['get_gerencial_lancamentos__nucleo', { p_limit: 5 }],
  ['get_gerencial_lancamentos_planilha__nucleo', {}],
  ['get_gerencial_projecao_diaria__nucleo', { p_dias: 30 }],
  ['get_gerencial_saldos__nucleo', {}],
  ['get_my_profile', {}],
  ['metas_subsetor_listar', { p_ano: 2026 }],
  ['metas_subsetor_upsert', { p_metas: [] }],
  ['metas_sumario_subsetor', HOJE],
]) {
  const r = await rpc(fn, args)
  const sumiu = r.status === 404 || /PGRST202|does not exist|Could not find/i.test(r.corpo)
  if (!sumiu) falhas++
  console.log(`   ${sumiu ? 'SUMIU' : 'AINDA VIVA'} ${r.status}  ${fn}`)
}

console.log(falhas ? `\n${falhas} FALHA(S) — investigar antes de fechar o bloco` : '\nTUDO CONFORME')
process.exit(falhas ? 1 : 0)
