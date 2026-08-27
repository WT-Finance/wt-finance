import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { STATUS_SOLIC, STATUS_EM_ANDAMENTO, emAndamento, type StatusSolic } from './schemas'
import { STATUS_LABEL, statusBadge, acaoBadge, vencida } from './format'

// ─────────────────────────────────────────────────────────────────────────────────────
// CICLO DE VIDA da Solicitação — paridade SQL ↔ TS e comportamento (v5.9.0).
//
// A etapa "Aprovada" existe em DOIS lugares: como CHECK no banco (a barreira que vale) e
// como união de literais em `STATUS_SOLIC` (que decide abas, colunas, cores e quais ações
// a UI oferece). Os dois lados dizem, em comentário, que mudam juntos. Comentário não
// reprova nada — este teste reprova.
//
// Por que isto importa mais aqui do que num enum qualquer: o `tsc` NÃO pega a divergência.
// Os pontos que decidem por status usam `switch` com `default` ou filtram por igualdade,
// então um estado novo é silenciosamente tratado como "aberta" ou como "encerrada", e o
// build passa verde. Foi assim que, ao introduzir 'aprovada', a solicitação aprovada
// sumiria da tela do próprio solicitante (as colunas de "Minhas" filtram por igualdade) e
// cairia na aba de encerradas do board (o filtro era o COMPLEMENTO de 'aberta').
//
// ⚠️ MANUTENÇÃO: migration aplicada é registro imutável, então uma alteração futura do
// CHECK virá numa migration NOVA, de número maior — e este teste continuaria lendo o
// arquivo antigo e aprovando um espelho obsoleto. Ao mexer no ciclo de vida, APONTE
// `SQL_CHECKS` para o arquivo novo. É a única parte desta rede que não se atualiza sozinha.
// (Mesma ressalva do `paridade-sql.test.ts` do Inventário, v5.6.0.)
//
// A 0262 vive em `supabase/patches/` — e não em `supabase/migrations/` — porque é
// DESTRUTIVA: `db push` empurra todo o conjunto pendente da pasta de migrations, e uma
// destrutiva parada lá é arrastada por qualquer push (a v5.2.0 dropou bases assim). Ela é
// movida para `migrations/` só no instante em que um humano a aplica, em TTY — por isso
// `sqlLimpoEm` aceita os DOIS caminhos, e este teste atravessa a aplicação sem ficar
// vermelho por motivo burocrático.
// ─────────────────────────────────────────────────────────────────────────────────────

const RAIZ = resolve(__dirname, '../../..')

function sqlLimpo(caminho: string): string {
  return readFileSync(resolve(RAIZ, caminho), 'utf8')
    .split('\n')
    .map(l => l.replace(/--.*$/, ''))   // sem isto, 'aprovada' citada em comentário falsearia
    .join('\n')
}

/** Lê o primeiro caminho que existir. A 0262 MUDA DE PASTA no ciclo de vida dela: vive em
 *  `supabase/patches/` enquanto espera (para não ser arrastada por um `db push`) e é movida
 *  para `supabase/migrations/` no instante em que um humano a aplica. Um teste amarrado a um
 *  só caminho ficaria vermelho exatamente no momento da aplicação — um gate falhando por
 *  motivo burocrático, bem quando a atenção precisa estar no banco. */
function sqlLimpoEm(...caminhos: string[]): string {
  for (const c of caminhos) {
    try { return sqlLimpo(c) } catch { /* tenta o próximo */ }
  }
  throw new Error(`0262 não encontrada em nenhum de: ${caminhos.join(', ')}`)
}

const SQL_CHECKS = sqlLimpoEm(
  'supabase/patches/0262_solic_status_aprovada_checks.sql',      // antes de aplicar
  'supabase/migrations/0262_solic_status_aprovada_checks.sql',   // depois de aplicar
)
const SQL_RPCS   = sqlLimpo('supabase/migrations/0261_solic_aprovada_e_anexo_pos_criacao.sql')
// ⚠️ `solic_anexar` foi REDEFINIDA pela 0263 (anexo livre — reverte a D7). Ler a 0261 para
// ela testaria a versão MORTA e passaria verde contra um corpo que o banco não usa mais —
// exatamente a armadilha anunciada no aviso de MANUTENÇÃO acima, e a primeira vez que ela
// se materializou. Cada objeto se lê da ÚLTIMA migration que o define.
const SQL_ANEXAR = sqlLimpo('supabase/migrations/0263_solic_anexo_livre.sql')

describe('paridade SQL ↔ TS do ciclo de vida', () => {
  it('STATUS_SOLIC tem exatamente os valores que o CHECK do banco aceita', () => {
    // Extrai o ARRAY[...] do CHECK de solicitacao_status_check.
    const bloco = SQL_CHECKS.match(/solicitacao_status_check\s+CHECK\s*\(([\s\S]*?)\n\);/)
    expect(bloco, 'CHECK de status não encontrado na 0262').not.toBeNull()
    const doSql = Array.from(bloco![1].matchAll(/'([a-z_]+)'::text/g)).map(m => m[1]).sort()
    expect(doSql).toEqual([...STATUS_SOLIC].sort())
  })

  it('STATUS_EM_ANDAMENTO espelha os estados que o CHECK dispensa de decisão terminal', () => {
    // solicitacao_terminal_decidido: status IN (...) OR (decidido_por/decidido_em NOT NULL).
    // O IN é, por definição, o conjunto dos estados NÃO-terminais.
    const bloco = SQL_CHECKS.match(/solicitacao_terminal_decidido\s+CHECK\s*\(([\s\S]*?)\n\);/)
    expect(bloco, 'CHECK terminal não encontrado na 0262').not.toBeNull()
    const naoTerminais = Array.from(bloco![1].matchAll(/'([a-z_]+)'/g)).map(m => m[1]).sort()
    expect(naoTerminais).toEqual([...STATUS_EM_ANDAMENTO].sort())
  })

  it('toda transição da 0261 aceita as MESMAS origens que STATUS_EM_ANDAMENTO', () => {
    // Se uma RPC de transição esquecesse 'aprovada', a solicitação aprovada ficaria presa:
    // visível, com botão na tela, e recusada pelo banco.
    const travas = Array.from(SQL_RPCS.matchAll(/v_sol\.status NOT IN \(([^)]+)\)/g))
      .map(m => Array.from(m[1].matchAll(/'([a-z_]+)'/g)).map(x => x[1]).sort())
    expect(travas.length, 'nenhuma trava NOT IN encontrada na 0261').toBeGreaterThanOrEqual(4)
    for (const trava of travas) expect(trava).toEqual([...STATUS_EM_ANDAMENTO].sort())
  })

  it('solic_aprovar só transiciona a partir de aberta (não existe reaprovar nem desaprovar)', () => {
    const corpo = SQL_RPCS.match(/FUNCTION public\.solic_aprovar[\s\S]*?\$function\$;/)
    expect(corpo).not.toBeNull()
    expect(corpo![0]).toMatch(/v_sol\.status <> 'aberta'/)
    // e grava as duas colunas que sustentam o histórico
    expect(corpo![0]).toMatch(/aprovado_por\s*=\s*app\.uid_jwt\(\)/)
    expect(corpo![0]).toMatch(/aprovado_em\s*=\s*now\(\)/)
    // sem tocar nos campos da decisão TERMINAL
    expect(corpo![0]).not.toMatch(/decidido_por\s*=/)
  })

  it('a Aprovação no histórico deriva de aprovado_em, não do status', () => {
    // É o que a faz SOBREVIVER à conclusão. Se alguém trocar por `status = 'aprovada'`,
    // a linha some no instante em que a solicitação encerra — e o passado é reescrito.
    // Isola o ramo inteiro (de 'Aprovação' até o UNION ALL seguinte) e pega o WHERE
    // EXTERNO — o do `FROM app.solicitacao s`. Casar o primeiro WHERE depois de
    // 'Aprovação' pegaria o da subquery que resolve o nome do ator.
    const ramo = SQL_RPCS.match(/'Aprovação'[\s\S]*?\n\s*UNION ALL/)
    expect(ramo, 'ramo de Aprovação não encontrado em solic_movimentacoes').not.toBeNull()
    const whereExterno = ramo![0].match(/\n\s*WHERE (s\.[^\n]+)/)
    expect(whereExterno, 'ramo de Aprovação sem WHERE externo').not.toBeNull()
    expect(whereExterno![1]).toContain('aprovado_em IS NOT NULL')
    expect(whereExterno![1]).not.toContain("status = 'aprovada'")
  })

  it('solic_anexar ACEITA anexo livre (campo_id nulo) — a D7 foi revertida na 0263', () => {
    const corpo = SQL_ANEXAR.match(/FUNCTION public\.solic_anexar[\s\S]*?\$function\$;/)
    expect(corpo).not.toBeNull()
    // A trava que recusava campo_id nulo NÃO pode voltar: sem anexo livre, um tipo sem
    // campo de anexo configurado fica sem lugar para o comprovante — o caso que originou
    // a versão. Se alguém reintroduzir o RAISE, este teste reprova.
    expect(corpo![0]).not.toMatch(/CAMPO_ANEXO_OBRIGATORIO/)
    // e a validação do campo passa a ser CONDICIONAL: só quando o campo_id vem preenchido.
    expect(corpo![0]).toMatch(/v_campo IS NOT NULL AND NOT EXISTS/)
  })

  it('solic_anexar mantém as travas que NÃO foram relaxadas', () => {
    const corpo = SQL_ANEXAR.match(/FUNCTION public\.solic_anexar[\s\S]*?\$function\$;/)!
    // afrouxar o campo_id nulo não pode ter afrouxado o resto junto:
    expect(corpo[0]).toMatch(/tipo_campo = 'anexo'/)                  // campo informado é DAQUELE tipo
    expect(corpo[0]).toMatch(/status NOT IN \('aberta','aprovada'\)/) // encerrada segue imutável
    expect(corpo[0]).toMatch(/sou_atendente/)                         // só solicitante ou atendente
    expect(corpo[0]).toMatch(/ANEXO_INVALIDO/)                        // path/nome continuam exigidos
  })
})

describe('comportamento do estado Aprovada', () => {
  it('toda origem em andamento tem rótulo, cor e é reconhecida como viva', () => {
    for (const s of STATUS_SOLIC) {
      expect(STATUS_LABEL[s], `sem rótulo para ${s}`).toBeTruthy()
      expect(statusBadge(s), `sem cor para ${s}`).toBeTruthy()
    }
    expect(emAndamento('aberta')).toBe(true)
    expect(emAndamento('aprovada')).toBe(true)
    for (const s of ['concluida', 'rejeitada', 'cancelada'] as StatusSolic[]) {
      expect(emAndamento(s), `${s} não deveria contar como em andamento`).toBe(false)
    }
  })

  it('aprovada NÃO reusa a cor de concluída — autorizar não é encerrar', () => {
    expect(statusBadge('aprovada')).not.toBe(statusBadge('concluida'))
    expect(statusBadge('aprovada')).not.toBe(statusBadge('aberta'))
    expect(acaoBadge('Aprovação')).not.toBe(acaoBadge('Conclusão'))
  })

  it('aprovada ainda vence: a data-limite corre até o desfecho, não até a autorização', () => {
    const ontem = '2020-01-01'
    const amanha = '2999-12-31'
    expect(vencida(ontem, 'aprovada')).toBe(true)
    expect(vencida(ontem, 'aberta')).toBe(true)
    expect(vencida(amanha, 'aprovada')).toBe(false)
    // encerradas nunca vencem — o prazo deixou de correr
    expect(vencida(ontem, 'concluida')).toBe(false)
    expect(vencida(ontem, 'rejeitada')).toBe(false)
    expect(vencida(ontem, 'cancelada')).toBe(false)
  })
})
