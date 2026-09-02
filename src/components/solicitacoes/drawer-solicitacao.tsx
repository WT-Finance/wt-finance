'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Download, Check, X, Ban, ThumbsUp, Paperclip, Trash2, FileText, FileSpreadsheet, FileImage, File as FileIcon } from 'lucide-react'
import ListDrawer from '@/components/shared/list-drawer'
import ModalCentral from '@/components/shared/modal-central'
import ConfirmModal from '@/components/shared/confirm-modal'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import Badge from '@/components/ui/badge'
import { PILL, PILL_NEUTRO, PILL_PERIGO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import { CAMPO } from '@/lib/ui/campos'
import { fmtDataHoraSP } from '@/lib/fmt'
import { concluirSolicitacao, rejeitarSolicitacao, cancelarSolicitacao, anexoUrl,
  aprovarSolicitacao, anexarEmSolicitacao, uploadAnexo, descartarAnexos, excluirAnexo, type AnexoMeta } from '@/app/solicitacoes/actions'
import { STATUS_LABEL, statusBadge, fmtDataBR, fmtValor, vencida } from '@/lib/solicitacoes/format'
import { emAndamento } from '@/lib/solicitacoes/schemas'
import type { Solicitacao } from '@/lib/solicitacoes/schemas'

const INPUT = `${CAMPO} resize-none`

/** Alvo de um upload: um campo de anexo do tipo (id) ou o bloco LIVRE (anexo geral).
 *  Sentinela em vez de -1 porque `campo_id` é um id de verdade, e -1 seria um id fingindo
 *  não ser id — o tipo já diz que são duas coisas diferentes. */
type AlvoAnexo = number | 'livre'

/** Controle de "Adicionar arquivo". Um só componente para os DOIS lugares onde ele aparece
 *  — nos campos de anexo do tipo e no bloco de anexo livre — porque duas cópias divergiriam
 *  no primeiro ajuste (foi o que a v5.7.2 aprendeu com ordem e busca).
 *
 *  Vive no MÓDULO, não dentro do drawer: componente definido no corpo de outro dispara
 *  `static-components` do React Compiler (lint em `error`) e, pior que o lint, remonta a
 *  subárvore a cada render do pai. Num `<input type="file">` isso significa perder a
 *  seleção em curso. O que ele fechava por closure vem por prop (skill `react-padroes` §1c).
 *
 *  Acessibilidade: o input NÃO pode ser `hidden` — `display:none` o tira do tab-order e o
 *  <label> não é focável por natureza, então o controle só responderia a mouse (achado ALTO
 *  do revisor). Com `sr-only` ele segue no tab-order e recebe foco; o `peer-focus-visible`
 *  desenha o anel na moldura visível, e o `htmlFor` faz Enter/Espaço abrirem o seletor. */
function ControleAnexar({ solId, alvo, anexando, onSelecionar }: {
  solId: number
  alvo: AlvoAnexo
  /** O que está subindo agora no drawer inteiro (trava todos os controles), ou null. */
  anexando: AlvoAnexo | null
  onSelecionar: (alvo: AlvoAnexo, files: FileList) => void
}) {
  const id = `anexar-${solId}-${alvo}`
  const subindo = anexando === alvo
  const travado = anexando !== null
  return (
    <div className="mt-1.5">
      <input
        id={id}
        type="file" multiple className="sr-only peer" disabled={travado}
        accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.csv,application/pdf,image/*"
        onChange={e => {
          if (e.target.files?.length) onSelecionar(alvo, e.target.files)
          e.target.value = ''   // permite reescolher o MESMO arquivo depois
        }}
      />
      <label
        htmlFor={id}
        className={`flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-2.5 py-2 text-xs text-zinc-500 hover:bg-zinc-50 peer-focus-visible:border-[var(--text-secondary)] peer-focus-visible:shadow-[0_0_0_3px_var(--focus-ring)] ${travado ? 'pointer-events-none opacity-60' : ''}`}
      >
        {subindo
          ? <><Loader2 size={13} className="shrink-0 animate-spin" /> Enviando…</>
          : <><Paperclip size={13} className="shrink-0" /> Adicionar arquivo (PDF, imagem ou planilha, ≤&nbsp;10&nbsp;MB)</>}
      </label>
    </div>
  )
}

/** Linha de um anexo: baixar (ocupa a linha) + excluir (v5.9.1).
 *
 *  Os dois são botões IRMÃOS dentro de um container, nunca aninhados: `<button>` dentro de
 *  `<button>` é HTML inválido e faria o clique de excluir disparar o download junto.
 *
 *  Vive no MÓDULO, e isso é correção de BUG, não estilo. Definido no corpo do drawer, a
 *  identidade da função era recriada a cada render — e o React remonta por TIPO, não por
 *  `key`. Qualquer estado do drawer (digitar na justificativa de rejeição, por exemplo)
 *  remontava TODAS as linhas de anexo. Pior: em `confirmarExclusao` os setStates são
 *  agrupados num commit só, então o modal fechava e a linha remontava juntos — e o cleanup
 *  de foco do `ModalCentral` (`anterior?.focus?.()`) tentava devolver o foco a um nó que
 *  já havia sido substituído. `.focus()` em nó destacado é no-op: o foco caía no
 *  `document.body`, quebrando a navegação por teclado no fluxo que esta versão criou.
 *  (Achado ALTO do revisor; mesma classe que levou `ControleAnexar` ao módulo na v5.9.0.)
 *
 *  `bloqueioObrigatorio` chega preenchido quando este é o ÚLTIMO anexo de um campo
 *  obrigatório (E4). O botão então fica inerte MAS FOCÁVEL: `aria-disabled` em vez do
 *  `disabled` nativo, porque `disabled` tira do tab-order e quem navega por teclado passaria
 *  direto, sem nunca saber que o controle existe nem por que está bloqueado. O motivo vai no
 *  `aria-label` e num `aria-describedby` — `title` sozinho só serve a quem usa mouse.
 *  Esconder também não serve: controle que desaparece sem explicação faz o usuário concluir
 *  que a funcionalidade não existe (foi o que motivou a reversão da D7 na v5.9.0). */
function BotaoAnexo({ a, bloqueioObrigatorio, baixando, excluindo, podeExcluir, onBaixar, onPedirExclusao }: {
  a: Solicitacao['anexos'][number]
  /** Motivo do bloqueio (E4), ou undefined quando a exclusão está liberada. */
  bloqueioObrigatorio?: string
  baixando: number | null
  excluindo: number | null
  podeExcluir: boolean
  onBaixar: (id: number) => void
  onPedirExclusao: (a: Solicitacao['anexos'][number]) => void
}) {
  const ocupado = excluindo !== null || baixando !== null
  const bloqueado = !!bloqueioObrigatorio
  const idMotivo = `anexo-${a.id}-motivo`
  return (
    <div className="flex items-center gap-1">
      <button
        type="button" disabled={ocupado} onClick={() => onBaixar(a.id)}
        className="foco-neutro flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-left text-xs text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60"
      >
        {baixando === a.id
          ? <Loader2 size={15} className="shrink-0 animate-spin text-zinc-400" />
          : iconeArquivo(a.mime, a.nome, 'shrink-0 text-zinc-400')}
        <span className="min-w-0 flex-1 truncate">{a.nome}</span>
        {baixando !== a.id && <Download size={13} className="shrink-0 text-zinc-400" />}
      </button>
      {podeExcluir && (
        <>
          <button
            type="button"
            aria-disabled={ocupado || bloqueado}
            onClick={() => { if (!ocupado && !bloqueado) onPedirExclusao(a) }}
            aria-label={bloqueado ? `Não é possível excluir ${a.nome}: ${bloqueioObrigatorio}` : `Excluir ${a.nome}`}
            aria-describedby={bloqueado ? idMotivo : undefined}
            title={bloqueioObrigatorio ?? 'Excluir arquivo'}
            className={`foco-neutro shrink-0 rounded-lg border border-zinc-200 bg-white p-2 transition-colors ${
              ocupado || bloqueado
                ? 'cursor-not-allowed text-zinc-300'
                : 'text-zinc-400 hover:border-danger hover:text-danger'
            }`}
          >
            {excluindo === a.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
          {bloqueado && <span id={idMotivo} className="sr-only">{bloqueioObrigatorio}</span>}
        </>
      )}
    </div>
  )
}

/** Ícone por tipo de arquivo (anexo): planilha, imagem, PDF/texto, ou genérico.
 *  Devolve o ELEMENTO pronto, não o componente. Retornar o componente e atribuí-lo a uma
 *  variável PascalCase (`const Icone = iconeArquivo(...)`) faz o React Compiler acusar
 *  `static-components` — ele não distingue "selecionar um de quatro componentes existentes"
 *  de "criar um componente no render". Semanticamente era um falso-positivo, mas a saída é
 *  trivial e o lint fica honesto: aqui não há componente nenhum sendo criado. */
function iconeArquivo(mime: string, nome: string, className: string) {
  const m = (mime || '').toLowerCase()
  const ext = (nome.split('.').pop() ?? '').toLowerCase()
  if (m.includes('sheet') || m === 'text/csv' || ext === 'xlsx' || ext === 'csv') return <FileSpreadsheet size={15} className={className} />
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return <FileImage size={15} className={className} />
  if (m === 'application/pdf' || ext === 'pdf') return <FileText size={15} className={className} />
  return <FileIcon size={15} className={className} />
}

export default function DrawerSolicitacao({ sol, onClose, onAtualizar }: {
  sol: Solicitacao
  onClose: () => void
  /** v5.9.1 — chamado após uma mutação que NÃO fecha o drawer (anexar, excluir anexo).
   *
   *  Quem deriva `sol` da lista do RSC (a tela de Solicitações) não precisa passar: o
   *  `router.refresh()` já devolve o objeto novo e o drawer re-renderiza sozinho. Este
   *  gancho existe para quem carrega o detalhe por SERVER ACTION e não tem lista de onde
   *  derivar — o caso de Movimentações, que buscaria eternamente o mesmo retrato. */
  onAtualizar?: () => void
}) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [rejeitando, setRejeitando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [justificativa, setJustificativa] = useState('')
  // id do anexo sendo baixado no momento (impede duplo-clique e exibe spinner)
  const [baixando, setBaixando] = useState<number | null>(null)
  // O que está recebendo upload agora — trava TODOS os controles e exibe o spinner só no
  // alvo em curso (v5.9.0). Ver `AlvoAnexo` no topo do módulo.
  const [anexando, setAnexando] = useState<AlvoAnexo | null>(null)
  // v5.9.1 — exclusão de anexo: o anexo aguardando confirmação, e o id em exclusão.
  // São dois estados porque o modal precisa do OBJETO (para mostrar o nome) e o spinner
  // precisa do id; derivar um do outro daria um modal aberto durante a exclusão.
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<Solicitacao['anexos'][number] | null>(null)
  const [excluindo, setExcluindo] = useState<number | null>(null)

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
  async function anexarNoCampo(alvo: AlvoAnexo, files: FileList) {
    if (anexando !== null) return
    setErro(null); setAnexando(alvo)
    // 'livre' → sem `campo_id` = anexo GERAL. A 0127 sempre previu `campo_id` nulo como
    // "geral" e o drawer já os exibia; a 0263 reabriu a ESCRITA (a D7 original a fechara).
    const campoId = alvo === 'livre' ? null : alvo
    const metas: AnexoMeta[] = []
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.set('file', file)
        if (campoId !== null) fd.set('campo_id', String(campoId))
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
      router.refresh()   // a page RSC devolve a lista nova; quem deriva dela já se atualiza
      onAtualizar?.()    // quem carrega por action rebusca (Movimentações)
    } finally {
      setAnexando(null)
    }
  }

  /** v5.9.1 — remove o anexo confirmado. A RPC reenforça autoria, estado e a regra do campo
   *  obrigatório; o erro dela é o que a tela mostra (`traduzir` explica o caminho de saída
   *  quando o bloqueio é o do campo obrigatório). */
  async function confirmarExclusao(anexoId: number) {
    setConfirmandoExclusao(null); setErro(null); setExcluindo(anexoId)
    try {
      const r = await excluirAnexo(anexoId)
      if (!r.ok) { setErro(r.erro ?? 'Falha ao excluir o anexo.'); return }
      router.refresh()   // a page RSC devolve a lista nova; quem deriva dela já se atualiza
      onAtualizar?.()    // quem carrega por action rebusca (Movimentações)
    } finally {
      setExcluindo(null)
    }
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
            return (
              <div key={r.campo_id} className="mt-3">
                <dt className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-zinc-400">{r.rotulo}</dt>
                {arquivos.length > 0
                  ? <div className="space-y-1.5">{arquivos.map(a => (
                      <BotaoAnexo key={a.id} a={a} baixando={baixando} excluindo={excluindo}
                        podeExcluir={!!a.sou_autor && emAnd}
                        onBaixar={baixarAnexo} onPedirExclusao={setConfirmandoExclusao}
                        /* E4 — último arquivo de campo obrigatório não sai sem substituto.
                           A trava que VALE é a da RPC; aqui o botão só explica por quê. */
                        bloqueioObrigatorio={r.obrigatorio && arquivos.length === 1
                          ? 'Campo obrigatório: anexe o substituto antes de excluir este arquivo'
                          : undefined} />
                    ))}</div>
                  : !podeAnexar && <span className="text-xs text-zinc-400">—</span>}
                {/* v5.9.0 — anexar DEPOIS da abertura: é por aqui que o comprovante do
                    pagamento efetuado chega a quem abriu o pedido. Disponível enquanto a
                    solicitação não estiver encerrada, para o solicitante e o atendente. */}
                {podeAnexar && <ControleAnexar solId={sol.id} alvo={r.campo_id ?? 'livre'} anexando={anexando} onSelecionar={anexarNoCampo} />}
              </div>
            )
          })}
        </div>
      )}

      {/* Anexos LIVRES (sem campo) — bloco próprio.
          v5.9.0/0263: passou a aparecer também VAZIO, quando quem olha pode anexar. Antes
          era `anexosGerais.length > 0`, o que criava um impasse: o bloco só existia se já
          houvesse anexo, e não havia como criar o primeiro. Este é o lugar onde o
          comprovante de um pagamento entra quando o tipo não tem campo de anexo — o caso
          que originou a versão e que a decisão D7 original deixava sem saída. */}
      {(anexosGerais.length > 0 || podeAnexar) && (
        <div className="mb-5">
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-zinc-400">Outros anexos</p>
          {anexosGerais.length > 0
            ? <div className="space-y-1.5">{anexosGerais.map(a => <BotaoAnexo key={a.id} a={a} baixando={baixando} excluindo={excluindo} podeExcluir={!!a.sou_autor && emAnd} onBaixar={baixarAnexo} onPedirExclusao={setConfirmandoExclusao} />)}</div>
            : <p className="text-xs text-zinc-400">Nenhum anexo além dos campos acima.</p>}
          {podeAnexar && <ControleAnexar solId={sol.id} alvo="livre" anexando={anexando} onSelecionar={anexarNoCampo} />}
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

      {/* v5.9.1 — exclusão de anexo é IRREVERSÍVEL (apaga metadado e binário), então passa
          por confirmação, como o cancelamento. O nome do arquivo vai no texto: quem tem
          três anexos parecidos precisa saber qual está prestes a sumir. */}
      {confirmandoExclusao && (
        <ConfirmModal
          titulo="Excluir anexo"
          mensagem={`Excluir "${confirmandoExclusao.nome}"? O arquivo é removido definitivamente e não há como recuperá-lo.`}
          confirmarLabel="Excluir"
          cancelarLabel="Voltar"
          onConfirmar={() => confirmarExclusao(confirmandoExclusao.id)}
          onFechar={() => setConfirmandoExclusao(null)}
        />
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
