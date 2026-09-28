import { describe, it, expect } from 'vitest'
import { mesParcialCompetencia, ehMesParcial, type EnvelopeMesParcial } from './mes-parcial'

// "Parcial" não deriva do calendário — é a base que decide, não o relógio de quem olha
// a tela. Os casos abaixo são os do contrato (anexo M7b/§3.1, decisão 14 do Yan).

function envelope(over: Partial<EnvelopeMesParcial> = {}): EnvelopeMesParcial {
  return { cobertura_ate: '2026-09-21', carregado_em: '2026-09-21T15:00:00Z', ...over }
}

describe('mesParcialCompetencia', () => {
  it('export de 21/09 com dado até setembro, olhado em 21/09 → setembro parcial', () => {
    expect(mesParcialCompetencia(envelope())).toEqual({ ano: 2026, mes: 9 })
  })

  it('o MESMO export olhado em 01/10 → setembro CONTINUA parcial (a função não recebe ' +
     '"hoje" — não há como o resultado variar com o relógio de quem olha)', () => {
    // Mesmíssimo envelope da carga — nenhum campo de "agora" existe para a função ler.
    const carga = envelope()
    expect(mesParcialCompetencia(carga)).toEqual({ ano: 2026, mes: 9 })
    expect(mesParcialCompetencia(carga)).toEqual(mesParcialCompetencia(carga)) // idempotente
  })

  it('carga de 02/10 com dado até setembro (outubro sem linhas) → nenhum mês parcial ' +
     '(setembro fechou antes da carga)', () => {
    expect(mesParcialCompetencia({
      cobertura_ate: '2026-09-30',
      carregado_em: '2026-10-02T15:00:00Z',
    })).toBeNull()
  })

  it('carga de 02/10 com 2 dias de outubro → outubro parcial', () => {
    expect(mesParcialCompetencia({
      cobertura_ate: '2026-10-02',
      carregado_em: '2026-10-02T15:00:00Z',
    })).toEqual({ ano: 2026, mes: 10 })
  })

  it('carregado_em ausente/nulo → nada marcado', () => {
    expect(mesParcialCompetencia({ cobertura_ate: '2026-09-21', carregado_em: null })).toBeNull()
    expect(mesParcialCompetencia({ cobertura_ate: '2026-09-21', carregado_em: undefined })).toBeNull()
  })

  it('cobertura_ate ausente/nulo → nada marcado', () => {
    expect(mesParcialCompetencia({ cobertura_ate: null, carregado_em: '2026-09-21T15:00:00Z' })).toBeNull()
    expect(mesParcialCompetencia({ cobertura_ate: undefined, carregado_em: '2026-09-21T15:00:00Z' })).toBeNull()
  })

  it('formas de data não reconhecidas nunca lançam, só devolvem null', () => {
    expect(mesParcialCompetencia({ cobertura_ate: 'set/2026', carregado_em: '2026-09-21T15:00:00Z' })).toBeNull()
    expect(mesParcialCompetencia({ cobertura_ate: '2026-09-21', carregado_em: 'não é data' })).toBeNull()
  })

  it('fuso: carregado_em 2026-10-01T02:30Z é 30/09 em São Paulo (UTC−3) — casa com ' +
     'cobertura até 30/09, não com outubro', () => {
    expect(mesParcialCompetencia({
      cobertura_ate: '2026-09-30',
      carregado_em: '2026-10-01T02:30:00Z',
    })).toEqual({ ano: 2026, mes: 9 })
  })

  it('a mesma virada de fuso, lida errado (split cru de UTC), classificaria a carga em ' +
     'outubro e perderia o parcial — é exatamente o que este teste impede', () => {
    // Documenta o contraste: SEM a conversão de fuso, '2026-10-01T02:30:00Z'.slice(0,7)
    // leria '2026-10', que não bate com a cobertura de setembro e devolveria null.
    const semFuso = '2026-10-01T02:30:00Z'.slice(0, 7)
    expect(semFuso).toBe('2026-10')
    expect(mesParcialCompetencia({
      cobertura_ate: '2026-09-30',
      carregado_em: '2026-10-01T02:30:00Z',
    })).not.toBeNull()
  })
})

describe('ehMesParcial', () => {
  const parcial = { ano: 2026, mes: 9 }

  it('mesmo ano e mesmo mês → true', () => {
    expect(ehMesParcial(parcial, 2026, 9)).toBe(true)
  })

  it('ano sendo exibido ≠ ano do mês parcial → false (nenhuma coluna marcada nesse ano)', () => {
    expect(ehMesParcial(parcial, 2025, 9)).toBe(false)
    expect(ehMesParcial(parcial, 2027, 9)).toBe(false)
  })

  it('mesmo ano, mês diferente → false', () => {
    expect(ehMesParcial(parcial, 2026, 8)).toBe(false)
    expect(ehMesParcial(parcial, 2026, 10)).toBe(false)
  })

  it('sem mês parcial (null) → sempre false', () => {
    expect(ehMesParcial(null, 2026, 9)).toBe(false)
  })
})
