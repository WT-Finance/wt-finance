'use server'

import { randomUUID } from 'node:crypto'
import { getServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAreaAction } from '@/lib/auth/sessao'
import { parseRpc, ingestaoPainelSchema, type IngestaoPainel, type IngestaoExpectativa } from '@/lib/schemas-rpc'
import { ehBaseIngestao, type BaseIngestao } from '@/lib/ingestao/bases'
import { baixarCru, caminhoCru, BUCKET_INGESTAO } from '@/lib/ingestao/storage'
import type { ArquivoDaCarga } from '@/app/admin/uploads/ingestao-cliente'

// Server actions da tela /admin/ingestao (v6.0.0/M6, anexo §7). Guard de superfície
// (requireAreaAction('admin/uploads')) em TODA action — o banco revalida a mesma área via
// app.exigir_acesso inline nas três RPCs de leitura/config (ingestao_painel,
// ingestao_expectativa_definir, ingestao_vigia_definir); o guard da UI é conveniência, o do
// banco é o backstop (mesmo padrão de admin/acessos e admin/api-externa).
//
// Migration 0280 APLICADA e `database.ts` regenerado pela sessão principal — as RPCs abaixo são
// chamadas TIPADAS direto (`db.rpc('nome', args)`), sem cast frouxo (skill `contrato-rpc-front` §1).
//
// `getAdminClient()` (service_role) é usado SÓ no reprocesso — ler o arquivo cru de uma carga
// antiga e copiá-lo (ingestao_carga_obter e o Storage são service_role-only por desenho, ver
// migration 0276/0280): nunca para as três RPCs de leitura/config da tela, que correm com a
// SESSÃO do usuário (o mesmo cuidado de admin/api-externa/actions.ts).

/** Prefixos de erro do guard interno do banco (PREFIXO:detalhe) → mensagem legível
 *  (mesmo molde de admin/api-externa/actions.ts). */
const ERROS_BANCO: ReadonlyArray<readonly [string, string]> = [
  ['ALVO_OBRIGATORIO',             'Informe o alvo (processo ou base).'],
  ['ATIVO_OBRIGATORIO',            'Informe se é para ligar ou desligar.'],
  ['TOLERANCIA_OBRIGATORIA',       'Este alvo nunca teve uma tolerância definida — informe uma antes de ligar.'],
  ['EXPECTATIVA_NAO_ENCONTRADA',   'Alvo não encontrado entre as expectativas configuradas.'],
  ['VIGIA_CRON_NAO_ENCONTRADO',    'O cron do vigia não existe no banco — confirme que a migration 0280 foi aplicada.'],
  ['VIGIA_ALTERACAO_NAO_APLICADA', 'O banco não confirmou a alteração do vigia — tente novamente e, se persistir, avise o time técnico.'],
  ['CARGA_NAO_ENCONTRADA',         'Carga não encontrada.'],
  ['BASE_INVALIDA',                'Base de ingestão desconhecida.'],
  ['PERMISSAO_NEGADA',             'Você não tem permissão para esta ação.'],
  ['AUTH_NECESSARIA',              'Sessão necessária.'],
]

function traduzir(mensagem: string): string {
  for (const [prefixo, texto] of ERROS_BANCO) {
    if (mensagem.includes(prefixo)) return texto
  }
  return mensagem.replace(/^[A-Z_]+:\s*/, '')
}

/** Releitura do painel (após ligar/desligar vigia ou expectativa, ou depois do reprocesso
 *  aplicar) — mesma RPC/schema da carga inicial da página. `null` = falha (a UI mantém o
 *  estado anterior e mostra aviso; nunca finge painel vazio). */
export async function obterPainelIngestaoAction(): Promise<IngestaoPainel | null> {
  await requireAreaAction('admin/uploads')
  const sb = await getServerClient()
  const res = await sb.rpc('ingestao_painel')
  return parseRpc(ingestaoPainelSchema, res, 'ingestao_painel')
}

export async function definirVigiaAction(
  ativo: boolean,
): Promise<{ ok: true; ativo: boolean } | { ok: false; erro: string }> {
  await requireAreaAction('admin/uploads')
  try {
    const sb = await getServerClient()
    const { data, error } = await sb.rpc('ingestao_vigia_definir', { p_ativo: ativo })
    if (error) return { ok: false, erro: traduzir(error.message) }
    const resultado = data as unknown as { ativo?: boolean } | null
    return { ok: true, ativo: resultado?.ativo ?? ativo }
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : 'Erro ao alterar o vigia.' }
  }
}

export async function definirExpectativaAction(
  alvo: string,
  ativo: boolean,
  tolerancia?: string,
): Promise<{ ok: true; expectativa: IngestaoExpectativa } | { ok: false; erro: string }> {
  await requireAreaAction('admin/uploads')
  try {
    const sb = await getServerClient()
    const args: { p_alvo: string; p_ativo: boolean; p_tolerancia?: string } = { p_alvo: alvo, p_ativo: ativo }
    if (tolerancia && tolerancia.trim() !== '') args.p_tolerancia = tolerancia.trim()
    const { data, error } = await sb.rpc('ingestao_expectativa_definir', args)
    if (error) return { ok: false, erro: traduzir(error.message) }
    return { ok: true, expectativa: data as unknown as IngestaoExpectativa }
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : 'Erro ao alterar a expectativa.' }
  }
}

// ---------------------------------------------------------------------------
// Reprocesso (anexo §7) — o contrato diz "repetir o passo 3 com os mesmos paths", e isso NÃO
// funciona com a idempotência por carga_id da M4 (repetir devolveria a resposta guardada em
// vez de reprocessar). Esta action COPIA os objetos da carga antiga para caminhos novos sob um
// carga_id novo (mesmos bytes, mesmo sha256) — depois o cliente roda o POST /api/ingestao/{base}
// normal (confirmar:false → modal → confirmar:true), com x-ingestao-origem: reprocesso.
// ---------------------------------------------------------------------------

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Mesma regra de `ingestao-cliente.ts` (não exportada de lá) — .csv só existe em
 *  lancamentos-operacao; as demais bases do contrato são .xlsx. */
function tipoMimeArquivo(nome: string): string {
  return nome.toLowerCase().endsWith('.csv')
    ? 'text/csv'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

export interface PreparoReprocesso {
  readonly base: BaseIngestao
  readonly cargaId: string
  readonly arquivos: readonly ArquivoDaCarga[]
  readonly extraidoEm: string
}

/**
 * Passo 1 do reprocesso: lê a carga original (service_role — `ingestao_carga_obter` não tem
 * sessão de usuário, molde 0276), baixa cada objeto cru do bucket e o recopia para um caminho
 * novo sob um `carga_id` novo. Devolve o pacote pronto para o cliente rodar o POST normal.
 */
export async function prepararReprocessoAction(
  cargaId: string,
): Promise<{ ok: true; preparo: PreparoReprocesso } | { ok: false; erro: string }> {
  await requireAreaAction('admin/uploads')

  if (!REGEX_UUID.test(cargaId)) {
    return { ok: false, erro: 'Identificador de carga inválido.' }
  }

  try {
    const admin = getAdminClient()
    const { data, error } = await admin.rpc('ingestao_carga_obter', { p_carga_id: cargaId })
    if (error) return { ok: false, erro: traduzir(error.message) }

    const carga = data as unknown as { base?: unknown; arquivos?: unknown } | null
    if (!carga || !ehBaseIngestao(carga.base)) {
      return { ok: false, erro: 'Carga não encontrada ou de uma base desconhecida.' }
    }
    const base = carga.base

    const arquivosAntigos = Array.isArray(carga.arquivos)
      ? (carga.arquivos as { path?: unknown; nome?: unknown; sha256?: unknown }[])
      : []
    if (arquivosAntigos.length === 0) {
      return { ok: false, erro: 'Esta carga não tem arquivo cru guardado — reprocesso indisponível.' }
    }

    const novoCargaId = randomUUID()
    const agora = new Date()
    const novosArquivos: ArquivoDaCarga[] = []

    for (let i = 0; i < arquivosAntigos.length; i++) {
      const antigo = arquivosAntigos[i]
      if (typeof antigo.path !== 'string' || typeof antigo.nome !== 'string' || typeof antigo.sha256 !== 'string') {
        return {
          ok: false,
          erro: `O arquivo #${i + 1} da carga original está com metadado incompleto — reprocesso indisponível.`,
        }
      }
      // Lança ErroIngestaoStorage (ARQUIVO_AUSENTE/ERRO_STORAGE) se o objeto sumiu do bucket —
      // propaga para o catch geral abaixo, que devolve a mensagem ao operador.
      const bytes = await baixarCru(antigo.path)
      const novoPath = caminhoCru(base, novoCargaId, i, antigo.nome, agora)
      const { error: erroUpload } = await admin.storage
        .from(BUCKET_INGESTAO)
        .upload(novoPath, Buffer.from(bytes), { contentType: tipoMimeArquivo(antigo.nome), upsert: false })
      if (erroUpload) {
        return { ok: false, erro: `Falha ao copiar "${antigo.nome}" para o reprocesso: ${erroUpload.message}` }
      }
      novosArquivos.push({ path: novoPath, nome: antigo.nome, sha256: antigo.sha256 })
    }

    return {
      ok: true,
      preparo: { base, cargaId: novoCargaId, arquivos: novosArquivos, extraidoEm: agora.toISOString() },
    }
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : 'Erro ao preparar o reprocesso.' }
  }
}
