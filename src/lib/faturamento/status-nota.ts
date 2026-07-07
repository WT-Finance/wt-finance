// Classificação do STATUS de uma NFS-e (Asaas) — FONTE ÚNICA, reusada pela tabela de revisão e
// pelos dois modais de resultado do Faturamento. (v4.38.0)
//
// FAIL-SAFE INVERTIDO (a lição do bug "processando infinito"): antes, qualquer status desconhecido
// caía no default "processando" (allowlist NEGATIVO), então uma nota REJEITADA pela prefeitura —
// que chega com um status de erro que não conhecíamos — ficava com o spinner girando para sempre,
// mascarando o erro. Aqui o allowlist é POSITIVO: só um conjunto CONHECIDO de estados de andamento
// vira "processando"; AUTHORIZED = autorizada; CANCEL* = cancelada; QUALQUER OUTRO (ERROR e todo
// status desconhecido) = FALHOU. O vocabulário de erro da NF nunca foi confirmado empiricamente
// (o legado só observou PENDING/IN_PROCESS/AUTHORIZED/CANCEL_REQUESTED), então "desconhecido =
// falhou" é a escolha segura: um erro real nunca fica escondido como andamento perpétuo.

export type ClasseNota = 'autorizada' | 'processando' | 'cancelada' | 'falhou'

// Estados de ANDAMENTO conhecidos da NF assíncrona. '' (vazio) = "ainda sem informação" — logo
// após emitir, antes do 1º refresh — é legitimamente andamento (o refresh resolve).
const EM_ANDAMENTO = new Set<string>([
  '', 'SCHEDULED', 'SYNCHRONIZED', 'PENDING', 'PROCESSING', 'IN_PROCESS', 'PROCESSING_CANCELLATION',
])

/** Classe visual da NF a partir do status FRESCO do Asaas (nunca do `resultado` congelado na emissão). */
export function classificarStatusNota(status: string | null | undefined): ClasseNota {
  const s = (status ?? '').trim().toUpperCase()
  if (s === 'AUTHORIZED') return 'autorizada'
  if (EM_ANDAMENTO.has(s)) return 'processando'   // andamento conhecido (inclui '' = sem info ainda)
  if (s.includes('CANCEL')) return 'cancelada'    // CANCELED / CANCELLATION_* / CANCEL_REQUESTED
  return 'falhou'                                  // ERROR e QUALQUER desconhecido → não mascara erro
}

const LABEL: Record<ClasseNota, string> = {
  autorizada:  'autorizada',
  processando: 'processando',
  cancelada:   'cancelada',
  falhou:      'falhou',
}

/** Rótulo PT-BR da classe (nunca o status cru em inglês). */
export function labelClasseNota(classe: ClasseNota): string {
  return LABEL[classe]
}

/** Atalho: status cru → rótulo PT-BR (via classificação). */
export function labelStatusNota(status: string | null | undefined): string {
  return LABEL[classificarStatusNota(status)]
}
