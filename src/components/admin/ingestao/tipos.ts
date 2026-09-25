// Tipos e rótulos compartilhados pela tela /admin/ingestao (v6.0.0/M6). Os tipos de DADO vêm
// de `@/lib/schemas-rpc` (fonte única, validada por `parseRpc` na leitura) — aqui só o que é
// puramente de UI: rótulo amigável por tipo de alarme/processo/status.

export type {
  IngestaoPainel, IngestaoCarga, IngestaoExecucao, IngestaoAlarme, IngestaoExpectativa,
} from '@/lib/schemas-rpc'
import type { TipoAlarmeIngestao } from '@/lib/email/template'

/** `ingestao.alarme.tipo` NÃO tem CHECK fechado no banco (migration 0280 — cresce sem
 *  migration destrutiva). A fonte da verdade dos tipos é `TipoAlarmeIngestao` (template do
 *  e-mail, os literais que `carga.ts`/o vigia gravam): o `Record` tipado por ela faz o `tsc`
 *  reprovar um tipo novo sem rótulo — a versão anterior, chaveada à mão em kebab-case, não
 *  casava NENHUM tipo gravado. Fallback = o `tipo` cru, para um tipo futuro não desaparecer. */
export const ROTULO_ALARME: Record<TipoAlarmeIngestao, string> = {
  checksum_falho:            'Carga rejeitada',
  ano_fechado_alterado:      'Ano fechado alterado',
  par_novo_bandeja:          'Par novo na bandeja',
  processo_sem_resultado:    'Processo sem resultado',
  carga_esperada_nao_chegou: 'Carga esperada não chegou',
}

export function rotuloAlarme(tipo: string): string {
  return (ROTULO_ALARME as Record<string, string>)[tipo] ?? tipo
}

/** `ingestao.execucao.processo` — CHECK fechado no banco (novo processo = nova migration). */
export const ROTULO_PROCESSO: Record<string, string> = {
  'monde-incremental':     'Sincronização incremental (Monde)',
  'monde-reconciliacao':   'Reconciliação diária (Monde)',
  'cdi-mensal':            'Ingestão mensal do CDI',
  'ingestao-vigia':        'O próprio vigia',
}

export function rotuloProcesso(processo: string): string {
  return ROTULO_PROCESSO[processo] ?? processo
}

export const ROTULO_STATUS_CARGA: Record<string, string> = {
  aberta:    'Em andamento',
  aplicada:  'Aplicada',
  rejeitada: 'Rejeitada',
  erro:      'Erro',
}

export const ROTULO_STATUS_EXECUCAO: Record<string, string> = {
  em_curso: 'Em andamento',
  ok:       'OK',
  // 'pulado' é status PRÓPRIO e SAUDÁVEL (lock ocupado) — nunca rotular como falha (anexo §3).
  pulado:   'Pulado (ocupado)',
  erro:     'Erro',
}
