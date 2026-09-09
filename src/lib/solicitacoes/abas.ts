import { emAndamento } from './schemas'
import type { StatusSolic } from './schemas'

// Abas de STATUS do board de Solicitações (v4.18/M6, extraído para módulo puro na v5.9.3
// para que a contagem exibida nas pills — antes um "(N)" textual só na aba Aprovadas —
// possa ser calculada e testada sem montar o componente. O predicado antigo era o
// COMPLEMENTO de 'aberta', o que empurraria um status novo direto para "encerradas" sem
// erro nenhum (mesma armadilha documentada em ciclo-de-vida.test.ts) — cada aba mantém
// predicado PRÓPRIO e explícito.
export type FiltroStatus = 'abertas' | 'aprovadas' | 'encerradas'

export const ABAS: Record<FiltroStatus, { rotulo: string; casa: (status: StatusSolic) => boolean; vazio: string }> = {
  abertas:    { rotulo: 'Abertas',    casa: status => status === 'aberta',   vazio: 'Nenhuma solicitação aberta na sua caixa de entrada.' },
  aprovadas:  { rotulo: 'Aprovadas',  casa: status => status === 'aprovada', vazio: 'Nenhuma solicitação aprovada aguardando execução.' },
  // 'encerradas' é o COMPLEMENTO de emAndamento — não duplica a lista de status terminais,
  // que já vive em STATUS_EM_ANDAMENTO (schemas.ts).
  encerradas: { rotulo: 'Encerradas', casa: status => !emAndamento(status),  vazio: 'Nenhuma solicitação encerrada.' },
}

/** Contagem por aba, sobre a lista recebida (escopo atual, ANTES do filtro de busca) —
 *  é o número que a pill exibe no badge vermelho. */
export function contarPorAba(lista: { status: StatusSolic }[]): Record<FiltroStatus, number> {
  return {
    abertas:    lista.filter(s => ABAS.abertas.casa(s.status)).length,
    aprovadas:  lista.filter(s => ABAS.aprovadas.casa(s.status)).length,
    encerradas: lista.filter(s => ABAS.encerradas.casa(s.status)).length,
  }
}
