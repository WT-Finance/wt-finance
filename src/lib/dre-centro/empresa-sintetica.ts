import type { DreLinha, DreMensalLike } from '@/lib/dre/schemas'
import { CATEGORIA_TAXA_ANTECIPACAO, type BlocoFormula } from './fixture'

// ── Árvore sintética para os TESTES da DRE por centro (v6.5.1) ───────────────
// Mesma gramática da viva: folhas (formula null) recebem categorias; totalizadores somam
// chaves. Ano corrente com 11 meses realizados. Só testes importam este módulo.

const m = (f: (i: number) => number) => Array.from({ length: 12 }, (_, i) => Math.round(f(i) * 100) / 100)
export const tot = (v: number[]) => v.reduce((s, x) => s + x, 0)
const somaM = (...xs: number[][]) => m(i => xs.reduce((s, x) => s + x[i], 0))

export const ENTRADA = m(i => 100_000 + i * 3_000)
const REPASSE = m(i => -60_000 - i * 1_000)
const ADM = m(() => -25_000)
export const TAXA = m(i => ([0, 1, 3, 8, 9].includes(i) ? -900 - i * 10 : 0))
const JUROS = m(() => 150)
const LUCRO_OP = somaM(ENTRADA, REPASSE, ADM)
const FIN = somaM(TAXA, JUROS)
export const REX = somaM(LUCRO_OP, FIN)
export const FIM = 11

type Base = Pick<DreLinha, 't' | 'rotulo' | 'meses' | 'chave' | 'g' | 'categoria_id'>
const linha = (l: Base): DreLinha => ({ ...l, estrela: false, venc: 0, total: tot(l.meses) })

export const EMPRESA: DreMensalLike = {
  ano: 2026, hoje: '2026-11-06', relacao: 'corrente', mes_corrente: FIM, token_estrutura: null, bandeja: [],
  linhas: [
    linha({ t: 'blocoH', chave: 'RV', rotulo: '(+) Receitas', meses: ENTRADA }),
    linha({ t: 'cat', g: 'RV', categoria_id: 1, rotulo: 'Entrada de clientes', meses: ENTRADA }),
    linha({ t: 'tot', chave: 'RB_H', rotulo: '(=) Receita bruta', meses: ENTRADA }),
    linha({ t: 'sub', chave: 'REPASSE', rotulo: '(−) Repasse', meses: REPASSE }),
    linha({ t: 'cat', g: 'REPASSE', categoria_id: 2, rotulo: 'Pagamento ao fornecedor', meses: REPASSE }),
    linha({ t: 'sub', chave: 'ADM', rotulo: '(−) Administrativas', meses: ADM }),
    linha({ t: 'cat', g: 'ADM', categoria_id: 3, rotulo: 'Honorários', meses: ADM }),
    linha({ t: 'tot', chave: 'LOP', rotulo: '(=) Lucro operacional', meses: LUCRO_OP }),
    linha({ t: 'sub', chave: 'FIN', rotulo: '(+/−) Financeiro', meses: FIN }),
    linha({ t: 'cat', g: 'FIN', categoria_id: CATEGORIA_TAXA_ANTECIPACAO, rotulo: 'Taxa de Antecipação', meses: TAXA }),
    linha({ t: 'cat', g: 'FIN', categoria_id: 4, rotulo: 'Juros', meses: JUROS }),
    linha({ t: 'tot', chave: 'REX', rotulo: '(=) Resultado do exercício', meses: REX }),
  ],
}

export const BLOCOS: BlocoFormula[] = [
  { chave: 'RV', formula: null }, { chave: 'RB_H', formula: ['RV'] }, { chave: 'REPASSE', formula: null },
  { chave: 'ADM', formula: null }, { chave: 'LOP', formula: ['RB_H', 'REPASSE', 'ADM'] },
  { chave: 'FIN', formula: null }, { chave: 'REX', formula: ['LOP', 'FIN'] },
]
