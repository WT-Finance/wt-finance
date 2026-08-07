import { describe, it, expect } from 'vitest'
import { converterSerieSgs, urlSerieSgs } from './serie-sgs'
import { API_AUTH_PROPRIA } from '@/proxy'

// A conversão da série do SGS é o ponto onde um erro entra CALADO na base: as duas
// pontas têm um modo de falha que produz número plausível em vez de exceção.
//   • data — "01/07/2026" lido por `new Date()` vira 7 de JANEIRO. As duas datas
//     existem, então a taxa só aparece no mês errado e a conta composta segue sem
//     sintoma nenhum.
//   • valor — a série 4392 é a MESMA do CDI, porém ANUALIZADA. Trocar 4391 por ela
//     mantém tudo "funcionando" e infla o rendimento em uma ordem de grandeza.
// Nenhum dos dois é pego por tsc, lint ou build.

describe('converterSerieSgs — contrato da série 4391 do SGS/BACEN', () => {
  it('converte percentual ao mês em fração decimal, ancorando no 1º dia', () => {
    // Valores REAIS conferidos contra a API pública em 07/08/2026.
    const bruto = [
      { data: '01/01/2026', valor: '1.16' },
      { data: '01/07/2026', valor: '1.22' },
    ]
    expect(converterSerieSgs(bruto)).toEqual([
      { mes: '2026-01-01', taxa: 0.0116 },
      { mes: '2026-07-01', taxa: 0.0122 },
    ])
  })

  it('lê a data como dd/MM, não MM/dd (o mês NÃO pode virar dia)', () => {
    // Se algum dia isto for reescrito com `new Date(p.data)`, este caso reprova:
    // "01/07/2026" viraria 2026-01-07 e o teste veria janeiro no lugar de julho.
    expect(converterSerieSgs([{ data: '01/07/2026', valor: '1.00' }])[0].mes).toBe('2026-07-01')
    expect(converterSerieSgs([{ data: '01/12/2025', valor: '1.00' }])[0].mes).toBe('2025-12-01')
  })

  it('aceita valor numérico além de string', () => {
    expect(converterSerieSgs([{ data: '01/03/2026', valor: 1.21 }])[0].taxa).toBeCloseTo(0.0121, 10)
  })

  it('devolve lista vazia para série vazia (quem decide o que fazer é o chamador)', () => {
    expect(converterSerieSgs([])).toEqual([])
  })

  it.each([
    ['resposta que não é lista',      { erro: 'nada aqui' }],
    ['data ausente',                  [{ valor: '1.10' }]],
    ['data em formato desconhecido',  [{ data: '2026-07-01', valor: '1.10' }]],
    ['data que não é o 1º do mês',    [{ data: '15/07/2026', valor: '1.10' }]],
    ['mês fora de faixa',             [{ data: '01/13/2026', valor: '1.10' }]],
    ['valor ausente',                 [{ data: '01/07/2026' }]],
    ['valor não numérico',            [{ data: '01/07/2026', valor: 'n/d' }]],
  ])('falha alto em %s', (_caso, bruto) => {
    expect(() => converterSerieSgs(bruto as unknown)).toThrow()
  })

  it('rejeita a série ANUALIZADA (4392) nos níveis de taxa de hoje', () => {
    // 4392 devolve ~14 (% a.a.). Como fração seria 0,14 ao MÊS — acima do teto.
    expect(() => converterSerieSgs([{ data: '01/07/2026', valor: '14.90' }])).toThrow(/faixa plausível/)
  })

  it('o teto NÃO é proteção completa contra a troca de série — e é bom saber disso', () => {
    // Com o CDI anual em ~4% a.a. (cenário de 2020), o valor anualizado passaria
    // pelo teto sem acender nada e entraria como se fosse mensal. Quem garante a
    // série certa é a constante SERIE_SGS_CDI_MENSAL, não este guard. Este caso
    // existe para que a limitação fique registrada em teste, não em prosa.
    expect(converterSerieSgs([{ data: '01/07/2020', valor: '4.00' }])[0].taxa).toBe(0.04)
  })

  it('uma linha malformada reprova o LOTE inteiro, não é pulada', () => {
    // Ingerir só o que casa produziria buraco na série — e buraco é justamente o
    // que a conta composta atravessa sem sintoma.
    const bruto = [
      { data: '01/06/2026', valor: '1.12' },
      { data: '01/07/2026', valor: 'quebrado' },
    ]
    expect(() => converterSerieSgs(bruto)).toThrow()
  })
})

describe('urlSerieSgs — janela é sempre a série inteira', () => {
  it('vai de ago/2024 até a data de hoje, em dd/MM/yyyy', () => {
    const url = urlSerieSgs(new Date(Date.UTC(2026, 7, 7))) // 07/08/2026
    expect(url).toContain('bcdata.sgs.4391')
    expect(url).toContain('dataInicial=01/08/2024')
    expect(url).toContain('dataFinal=07/08/2026')
  })

  it('não tem modo separado de backfill — a mesma URL serve carga inicial e tique mensal', () => {
    const a = urlSerieSgs(new Date(Date.UTC(2026, 7, 7)))
    const b = urlSerieSgs(new Date(Date.UTC(2027, 0, 3)))
    expect(a.split('dataFinal=')[0]).toBe(b.split('dataFinal=')[0])
  })
})

describe('isenção do proxy para o cron do CDI', () => {
  it('/api/cdi/ingest autentica no próprio handler', () => {
    // Sem esta entrada o proxy exige sessão, o request do pg_cron chega só com o
    // Bearer do CRON_SECRET e morre em 401 ANTES do handler — invisível em dev (o
    // disparo manual tem sessão) e permanente em produção. Precedente: a rota do
    // Monde nasceu assim e o cron nunca autenticou até a v5.1.7 (ADR-0153).
    expect(API_AUTH_PROPRIA.has('/api/cdi/ingest')).toBe(true)
    expect(API_AUTH_PROPRIA.has('/api/monde/ingest')).toBe(true)
  })
})
