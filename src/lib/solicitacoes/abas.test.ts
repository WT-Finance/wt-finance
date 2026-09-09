import { describe, it, expect } from 'vitest'
import { ABAS, contarPorAba } from './abas'
import type { StatusSolic } from './schemas'

// v5.9.3 — as pills "Abertas"/"Aprovadas" trocam o "(N)" textual pelo mesmo círculo
// vermelho da Caixa de entrada. `contarPorAba` é o número que vai dentro do badge; este
// teste garante que ele conta certo SEM montar o componente.

function lista(...status: StatusSolic[]): { status: StatusSolic }[] {
  return status.map(status => ({ status }))
}

describe('contarPorAba', () => {
  it('conta cada status na aba certa numa lista mista', () => {
    const l = lista('aberta', 'aberta', 'aprovada', 'concluida', 'rejeitada', 'cancelada')
    expect(contarPorAba(l)).toEqual({ abertas: 2, aprovadas: 1, encerradas: 3 })
  })

  it('lista vazia dá zero nas três abas', () => {
    expect(contarPorAba([])).toEqual({ abertas: 0, aprovadas: 0, encerradas: 0 })
  })

  it('encerradas é tudo que não está em andamento — inclusive cada status terminal isolado', () => {
    for (const s of ['concluida', 'rejeitada', 'cancelada'] as StatusSolic[]) {
      expect(contarPorAba(lista(s))).toEqual({ abertas: 0, aprovadas: 0, encerradas: 1 })
    }
  })

  it('abertas e aprovadas são mutuamente exclusivas', () => {
    expect(contarPorAba(lista('aberta'))).toEqual({ abertas: 1, aprovadas: 0, encerradas: 0 })
    expect(contarPorAba(lista('aprovada'))).toEqual({ abertas: 0, aprovadas: 1, encerradas: 0 })
  })
})

describe('ABAS — predicados', () => {
  it('cada predicado casa só com o próprio status entre os cinco possíveis', () => {
    const todos: StatusSolic[] = ['aberta', 'aprovada', 'concluida', 'rejeitada', 'cancelada']
    expect(todos.filter(ABAS.abertas.casa)).toEqual(['aberta'])
    expect(todos.filter(ABAS.aprovadas.casa)).toEqual(['aprovada'])
    expect(todos.filter(ABAS.encerradas.casa)).toEqual(['concluida', 'rejeitada', 'cancelada'])
  })
})
