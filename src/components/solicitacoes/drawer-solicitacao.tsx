'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Download, Check, X, Ban, ThumbsUp, Paperclip, FileText, FileSpreadsheet, FileImage, File as FileIcon } from 'lucide-react'
import ListDrawer from '@/components/shared/list-drawer'
import ModalCentral from '@/components/shared/modal-central'
import ConfirmModal from '@/components/shared/confirm-modal'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import Badge from '@/components/ui/badge'
import { PILL, PILL_NEUTRO, PILL_PERIGO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import { CAMPO } from '@/lib/ui/campos'
import { fmtDataHoraSP } from '@/lib/fmt'
import { concluirSolicitacao, rejeitarSolicitacao, cancelarSolicitacao, anexoUrl,
  aprovarSolicitacao, anexarEmSolicitacao, uploadAnexo, descartarAnexos, type AnexoMeta } from '@/app/solicitacoes/actions'
import { STATUS_LABEL, statusBadge, fmtDataBR, fmtValor, vencida } from '@/lib/solicitacoes/format'
import { emAndamento } from '@/lib/solicitacoes/schemas'
import type { Solicitacao } from '@/lib/solicitacoes/schemas'

const INPUT = `${CAMPO} resize-none`

// Ícone por tipo de arquivo (anexo): planilha, imagem, PDF/texto, ou genérico.
function iconeArquivo(mime: string, nome: string) {
  const m = (mime || '').toLowerCase()
  const ext = (nome.split('.').pop() ?? '').toLowerCase()
  if (m.includes('sheet') || m === 'text/csv' || ext === 'xlsx' || ext === 'csv') return FileSpreadsheet
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return FileImage
  if (m === 'application/pdf' || ext === 'pdf') return FileText
  return FileIcon
}

export default function DrawerSolicitacao({ sol, onClose }: { sol: Solicitacao; onClose: () => void }) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [rejeitando, setRejeitando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [justificativa, setJustificativa] = useState('')
  // id do anexo sendo baixado no momento (impede duplo-clique e exibe spinner)
  const [baixando, setBaixando] = useState<number | null>(null)
  // campo_id que está recebendo upload agora (trava a UI e exibe spinner) — v5.9.0
  const [anexando, setAnexando] = useState<number | null>(null)

  // v5.9.0 — o que libera AÇÃO é estar em andamento ('aberta' OU 'aprovada'); o que é
  // exclusivo de 'aberta' é APROVAR (não se aprova duas vezes, e não há desaprovar).
  const emAnd = emAndamento(sol.status)
  const podeAprovar  = sol.status === 'aberta' && !!sol.sou_atendente
  const podeConcluir = emAnd && (sol.sou_atendente || sol.sou_solicitante)
  const podeRejeitar = emAnd && !!sol.sou_atendente
  const podeCancelar = emAnd && !!sol.sou_solicitante
  // Anexar depois da abertura: os dois lados, enquanto não encerrada (D5/D6). A RPC
  // `solic_anexar` reenforça isto no banco — aqui é só afordância.
  const podeAnexar = emAnd && (!!sol.sou_atendente || !!sol.sou_solicitante)
  const venc = vencida(sol.data_limite, sol.status)

  async function run(fn: () => Promise<{ ok: boolean; erro?: string }>) {
    setErro(null); setOcupado(true)
    const r = await fn(); setOcupado(false)
    if (!r.ok) { setErro(r.erro ?? 'Falha na ação.'); return }
    router.refresh(); onClose()
  }
  async function baixarAnexo(id: number) {
    // Evita duplo-clique enquanto já há um download em progresso
    if (baixando !== null) return
    setErro(null)
    setBaixando(id)
    // Abre a janela de forma SÍNCRONA (antes do await) para não ser bloqueada pelo
    // popup-blocker; depois redirecionamos para a URL assinada. Sem 'noopener' na
    // feature string porque com ela window.open retorna null por especificação —
    // zeramos o opener manualmente logo abaixo.
    const w = window.open('', '_blank')
    if (w) w.opener = null
    try {
      const r = await anexoUrl(id)
      if (r.ok) {
        if (w) {
          w.location.href = r.url
        } else {
          // Fallback: o open síncrono já foi bloqueado — tenta o caminho direto
          window.open(r.url, '_blank', 'noopener')
        }
      } else {
        w?.close()
        setErro(r.erro)
      }
    } finally {
      setBaixando(null)
    }
  }

  /**
   * v5.9.0 — anexa arquivos a um campo de anexo DESTA solicitação, já existente.
   * Sobe um por vez (o transporte não ganha nada em paralelo e o erro fica atribuível),
   * junta os metadados e grava todos numa chamada só — assim ou entram todos, ou o
   * usuário vê um erro único, em vez de um sucesso pela metade.
   */
  async function anexarNoCampo(campoId: number, files: FileList) {
    if (anexando !== null) return
    setErro(null); setAnexando(campoId)
    const metas: AnexoMeta[] = []
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.set('file', file)
        fd.set('campo_id', String(campoId))
        fd.set('solicitacao_id', String(sol.id))   // grava direto em sol/<id>/… (sem promoção)
        const up = await uploadAnexo(fd)
        if (!up.ok) {
          setErro(`${file.name}: ${up.erro}`)
          // Sem isto, o que JÁ subiu neste lote fica pendurado no bucket para sempre: a
          // limpeza de `anexarEmSolicitacao` só corre se ela chegar a ser chamada, e um
          // erro no meio do lote retorna antes disso. Achado MÉDIO do revisor.
          await descartarAnexos(sol.id, metas.map(m => m.storage_path))
          return
        }
        metas.push(up.anexo)
      }
      const r = await anexarEmSolicitacao(sol.id, metas)
      if (!r.ok) { setErro(r.erro ?? 'Falha ao anexar.'); return }  // esta action já limpa
      router.refresh()   // o drawer relê a solicitação e os arquivos novos aparecem
    } finally {
      setAnexando(null)
    }
  }

  // Botão de download de um anexo (ícone por tipo de arquivo + nome).
  function BotaoAnexo({ a }: { a: Solicitacao['anexos'][number] }) {
    const Icone = baixando === a.id ? Loader2 : iconeArquivo(a.mime, a.nome)
    return (
      <button
        type="button" disabled={baixando !== null} onClick={() => baixarAnexo(a.id)}
        className="foco-neutro flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-left text-xs text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60"
      >
        <Icone size={15} className={`shrink-0 text-zinc-400 ${baixando === a.id ? 'animate-spin' : ''}`} />
        <span className="min-w-0 flex-1 truncate">{a.nome}</span>
        {baixando !== a.id && <Download size={13} className="shrink-0 text-zinc-400" />}
      </button>
    )
  }

  // Campos não-anexo (vão na grade de dois) e campos anexo (bloco próprio).
  const camposValor = sol.respostas.filter(r => r.tipo_campo !== 'anexo')
  const camposAnexo = sol.respostas.filter(r => r.tipo_campo === 'anexo')
  const anexosGerais = sol.anexos.filter(a => a.campo_id == null)

  return (
    <ListDrawer titulo={sol.tipo_nome ?? 'Solicitação'} subtitulo={`Solicitação #${sol.id}`} onClose={onClose}>
      {erro && <div className="mb-4"><FaixaMensagem tipo="erro" texto={erro} onFechar={() => setErro(null)} /></div>}

      {/* ── Zona 1 — Cabeçalho: status + data-limite (vermelho se vencida) ───────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-4">
        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadge(sol.status)}`}>{STATUS_LABEL[sol.status]}</span>
        <span className={`text-sm ${venc ? 'font-semibold text-danger' : 'text-zinc-500'}`}>
          Limite: {fmtDataBR(sol.data_limite)}{venc && ' · vencida'}
        </span>
      </div>

      {/* ── Zona 2 — Faixa de metadados: destinatário, solicitante, aberta em (hora SP) ── */}
      <div className="mb-5 rounded-lg border border-zinc-100 bg-zinc-50/70 px-3.5 py-3">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
          <Meta rotulo="Destinatário" valor={`${sol.destinatario.rotulo ?? '—'}${sol.destinatario.tipo === 'role' ? ' (permissão)' : ''}`} />
          {/* Solicitante + selo de proveniência (v5.4.0/Round4): "via integração <plataforma>"
              quando a solicitação veio da API externa; nada quando origem é null/ausente
              (aberta na tela). */}
          <div className="min-w-0">
            <dt className="text-2xs font-medium uppercase tracking-wide text-zinc-400">Solicitante</dt>
            <dd className="mt-0.5 flex items-center gap-1.5">
              <span className="truncate text-sm text-zinc-800" title={sol.solicitante_email ?? undefined}>{sol.solicitante_email ?? '—'}</span>
              {sol.origem && <Badge variant="neutro" className="shrink-0">via integração {sol.origem.plataforma}</Badge>}
            </dd>
          </div>
          <Meta rotulo="Aberta em" valor={fmtDataHoraSP(sol.criado_em)} />
        </dl>
        {sol.descricao && (
          <div className="mt-2.5 border-t border-zinc-200/70 pt-2.5">
            <dt className="text-2xs font-medium uppercase tracking-wide text-zinc-400">Descrição</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-zinc-700">{sol.descricao}</dd>
          </div>
        )}
      </div>

      {/* ── Zona 3 — Campos preenchidos: rótulo pequeno → valor destacado (curtos em grade de dois) ── */}
      {(camposValor.length > 0 || camposAnexo.length > 0) && (
        <div className="mb-5">
          <p className="mb-2.5 text-2xs font-semibold uppercase tracking-wider text-zinc-400">Campos</p>
          {camposValor.length > 0 && (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              {camposValor.map(r => (
                <div key={r.campo_id} className={r.tipo_campo === 'texto_longo' ? 'sm:col-span-2' : ''}>
                  <dt className="text-2xs font-medium uppercase tracking-wide text-zinc-400">{r.rotulo}</dt>
                  <dd className={`mt-0.5 text-sm font-medium text-zinc-800 ${r.tipo_campo === 'texto_longo' ? 'whitespace-pre-wrap font-normal' : ''}`}>{fmtValor(r)}</dd>
                </div>
              ))}
            </dl>
          )}
          {camposAnexo.map(r => {
            const arquivos = sol.anexos.filter(a => a.campo_id === r.campo_id)
            const subindo = anexando === r.campo_id
            return (
              <div key={r.campo_id} className="mt-3">
                <dt className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-zinc-400">{r.rotulo}</dt>
                {arquivos.length > 0
                  ? <div className="space-y-1.5">{arquivos.map(a => <BotaoAnexo key={a.id} a={a} />)}</div>
                  : !podeAnexar && <span className="text-xs text-zinc-400">—</span>}
                {/* v5.9.0 — anexar DEPOIS da abertura: é por aqui que o comprovante do
                    pagamento efetuado chega a quem abriu o pedido. Disponível enquanto a
                    solicitação não estiver encerrada, para o solicitante e o atendente. */}
                {podeAnexar && (
                  <div className="mt-1.5">
                    {/* Acessibilidade: o input NÃO pode ser `hidden` — `display:none` o tira do
                        tab-order e o <label> não é focável por natureza, então o controle só
                        responderia a mouse (achado ALTO do revisor). Com `sr-only` ele
                        continua no tab-order e recebe foco; o `peer-focus-visible` desenha o
                        anel na moldura visível, e o htmlFor garante que Enter/Espaço no
                        input abram o seletor de arquivos. */}
                    <input
                      id={`anexar-${sol.id}-${r.campo_id}`}
                      type="file" multiple className="sr-only peer" disabled={anexando !== null}
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.csv,application/pdf,image/*"
                      onChange={e => {
                        if (e.target.files?.length && r.campo_id != null) anexarNoCampo(r.campo_id, e.target.files)
                        e.target.value = ''   // permite reescolher o MESMO arquivo depois
                      }}
                    />
                    <label
                      htmlFor={`anexar-${sol.id}-${r.campo_id}`}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-2.5 py-2 text-xs text-zinc-500 hover:bg-zinc-50 peer-focus-visible:border-[var(--text-secondary)] peer-focus-visible:shadow-[0_0_0_3px_var(--focus-ring)] ${anexando !== null ? 'pointer-events-none opacity-60' : ''}`}
                    >
                      {subindo
                        ? <><Loader2 size={13} className="shrink-0 animate-spin" /> Enviando…</>
                        : <><Paperclip size={13} className="shrink-0" /> Adicionar arquivo (PDF, imagem ou planilha, ≤&nbsp;10&nbsp;MB)</>}
                    </label>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Anexos gerais (sem campo), se houver — bloco próprio */}
      {anexosGerais.length > 0 && (
        <div className="mb-5">
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-zinc-400">Anexos</p>
          <div className="space-y-1.5">{anexosGerais.map(a => <BotaoAnexo key={a.id} a={a} />)}</div>
        </div>
      )}

      {/* Trilha da APROVAÇÃO (v5.9.0) — independente do desfecho: continua visível depois
          de concluída/rejeitada/cancelada, porque `aprovado_em` não é derivado do status.
          É o que impede o desfecho de apagar o registro de quem autorizou. */}
      {sol.aprovado_em && (
        <div className="border-t border-zinc-100 pt-3 mb-4 text-xs text-warning-deep">
          <p>Aprovada por {sol.aprovado_por_email ?? '—'} em {fmtDataHoraSP(sol.aprovado_em)}.</p>
        </div>
      )}

      {/* Encerramento: só quando de fato encerrou. Era `status !== 'aberta'`, o que com a
          etapa nova exibiria "Aprovada por — em [vazio]" usando os campos da decisão
          TERMINAL, que uma aprovada ainda não tem. */}
      {!emAnd && (
        <div className="border-t border-zinc-100 pt-3 mb-4 text-xs text-zinc-500">
          <p>{STATUS_LABEL[sol.status]} por {sol.decidido_por_email ?? '—'} em {fmtDataHoraSP(sol.decidido_em)}.</p>
          {sol.justificativa && <p className="mt-1"><span className="font-medium">Justificativa:</span> {sol.justificativa}</p>}
        </div>
      )}

      {(podeAprovar || podeConcluir || podeRejeitar || podeCancelar) && (
        <div className="sticky -bottom-5 -mx-6 -mb-5 px-6 py-3 bg-white border-t border-zinc-100 flex flex-wrap gap-2">
          {/* Aprovar vem ANTES de Concluir: é a ordem do ciclo de vida. Ambos ficam
              disponíveis ao mesmo tempo numa solicitação aberta — aprovar é OPCIONAL,
              quem quiser encerra direto. */}
          {podeAprovar && (
            <button
              type="button" disabled={ocupado}
              onClick={() => run(() => aprovarSolicitacao(sol.id))}
              className={`${PILL} ${PILL_NEUTRO}`}
              title="Autoriza agora; a conclusão fica para quando for executada"
            >
              {ocupado ? <Loader2 size={13} className="animate-spin" /> : <ThumbsUp size={13} />} Aprovar
            </button>
          )}
          {podeConcluir && (
            <button
              type="button" disabled={ocupado}
              onClick={() => run(() => concluirSolicitacao(sol.id))}
              className={`${PILL} ${PILL_PRIMARIA}`} style={PILL_PRIMARIA_STYLE}
            >
              {ocupado ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Concluir
            </button>
          )}
          {podeRejeitar && <button type="button" disabled={ocupado} onClick={() => setRejeitando(true)} className={`${PILL} ${PILL_PERIGO}`}><Ban size={13} /> Rejeitar</button>}
          {podeCancelar && <button type="button" disabled={ocupado} onClick={() => setCancelando(true)} className={`${PILL} ${PILL_NEUTRO}`}><X size={13} /> Cancelar</button>}
        </div>
      )}

      {cancelando && (
        <ConfirmModal
          titulo="Cancelar solicitação"
          mensagem="Cancelar esta solicitação? Esta ação não pode ser desfeita."
          confirmarLabel="Cancelar solicitação"
          cancelarLabel="Voltar"
          onConfirmar={() => run(() => cancelarSolicitacao(sol.id))}
          onFechar={() => setCancelando(false)}
        />
      )}

      {rejeitando && (
        <ModalCentral titulo="Rejeitar solicitação" subtitulo="A justificativa é obrigatória e fica registrada." onClose={() => setRejeitando(false)}>
          <textarea autoFocus rows={3} value={justificativa} onChange={e => setJustificativa(e.target.value)} className={INPUT} placeholder="Motivo da rejeição" />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setRejeitando(false)} className={`${PILL} ${PILL_NEUTRO}`}>Voltar</button>
            <button type="button" disabled={ocupado || justificativa.trim().length === 0}
              onClick={() => { setRejeitando(false); run(() => rejeitarSolicitacao(sol.id, justificativa)) }}
              className={`${PILL} ${PILL_PERIGO}`}>Rejeitar</button>
          </div>
        </ModalCentral>
      )}
    </ListDrawer>
  )
}

function Meta({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-medium uppercase tracking-wide text-zinc-400">{rotulo}</dt>
      <dd className="mt-0.5 truncate text-sm text-zinc-800" title={valor}>{valor}</dd>
    </div>
  )
}
