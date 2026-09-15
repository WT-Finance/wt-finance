import { describe, it, expect } from 'vitest'
import { acaoDaLinha } from './acao-da-linha'
import type { LivroLista } from './tipos'

// A regra do botão da linha é a face visível das travas da 0272. Se ela oferecer
// "Devolver" para quem o banco vai recusar, o usuário leva um erro que a tela podia
// ter evitado — e a recíproca (esconder de quem PODE) esconde função de gestão.

const base: LivroLista = {
  id: 1, titulo: 'Essencialismo', autor: null, editora: null, ano: null, isbn: null,
  obs: null, arquivado: false, emprestado: false, portador_id: null, portador_nome: null,
  desde: null, tem_historico: false,
}
const EU = 'uuid-eu'
const OUTRO = 'uuid-outro'

describe('acaoDaLinha', () => {
  it('livro disponível: qualquer um pega', () => {
    expect(acaoDaLinha(base, EU, false)).toBe('pegar')
  })

  it('livro comigo: eu devolvo', () => {
    expect(acaoDaLinha({ ...base, emprestado: true, portador_id: EU }, EU, false)).toBe('devolver')
  })

  it('livro com outra pessoa, sem gestão: nenhum botão', () => {
    expect(acaoDaLinha({ ...base, emprestado: true, portador_id: OUTRO }, EU, false)).toBe(null)
  })

  it('livro com outra pessoa, COM gestão: devolve por ela', () => {
    expect(acaoDaLinha({ ...base, emprestado: true, portador_id: OUTRO }, EU, true)).toBe('devolver')
  })

  it('sessão sem id não oferece devolução de livro alheio', () => {
    expect(acaoDaLinha({ ...base, emprestado: true, portador_id: OUTRO }, null, false)).toBe(null)
  })
})
