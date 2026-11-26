'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import ModalCentral from '@/components/shared/modal-central'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import CamposDinamicos, { type AnexoLocal } from './campos-dinamicos'
import CampoData from './campo-data'
import { Select, Textarea } from '@/components/ui/field'
import GatilhoAjuda from '@/components/ui/gatilho-ajuda'
import { criarSolicitacao, uploadAnexo, type AnexoMeta } from '@/app/solicitacoes/actions'
import type { TipoAbertura, Destinatarios, Moeda } from '@/lib/solicitacoes/schemas'
import { normalizarRespostasNumericas, dataLimitePadrao, validarCamposAbertura } from '@/lib/solicitacoes/format'

type AnexoItem = AnexoLocal & { meta?: AnexoMeta }

export default function ModalNovaSolicitacao({ tipos, destinatarios, onFechar }: {
  tipos: TipoAbertura[]; destinatarios: Destinatarios; onFechar: () => void
}) {
  const router = useRouter()
  const [tipoId, setTipoId] = useState<number | ''>('')
  // v6.5.3 — nasce em hoje + 3 dias corridos (decisão do Yan), editável. Vazia, o Safari do macOS
  // mostrava a data de HOJE no campo e o envio voltava "Informe a data-limite." (o modal só é
  // montado ao abrir, então o padrão sai do dia em que a pessoa abriu, não do carregamento da página).
  const [dataLimite, setDataLimite] = useState(() => dataLimitePadrao())
  const [destMode, setDestMode] = useState<'role' | 'usuario'>('role')
  const [destRole, setDestRole] = useState<string>('')
  const [destUser, setDestUser] = useState<string>('')
  const [descricao, setDescricao] = useState('')
  const [valores, setValores] = useState<Record<string, string>>({})
  // v6.5.3 — moeda por campo `moeda` (ausente = BRL), fora de `valores` de propósito: o aviso
  // de "trocar o tipo limpa os campos" olha `valores`, e uma moeda padrão não é preenchimento.
  const [moedas, setMoedas] = useState<Record<number, Moeda>>({})
  const [anexos, setAnexos] = useState<Record<number, AnexoItem[]>>({})
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // v6.5.3 — id do campo que barrou o envio: ganha `aria-invalid` (borda --danger) e o foco, para o
  // erro não ficar só na faixa do rodapé, longe do campo. Sai quando a pessoa mexe nele.
  const [invalido, setInvalido] = useState<string | null>(null)
  const limparSe = (alvo: string) => { if (invalido === alvo) setInvalido(null) }

  const tipo = tipos.find(t => t.id === tipoId)

  // guarda de anexos: derivado do estado atual para evitar re-render de prop
  const todosAnexos = Object.values(anexos).flat()
  const subindo = todosAnexos.some(a => a.enviando)
  const comAnexoErro = todosAnexos.some(a => a.erro)

  function trocarTipo(novo: number) {
    const temPreenchimento = Object.values(valores).some(Boolean) || Object.keys(anexos).length > 0
    if (temPreenchimento && !window.confirm('Trocar o tipo limpa os campos preenchidos. Continuar?')) return
    setTipoId(novo); setValores({}); setMoedas({}); setAnexos({})
  }

  function setAnexosCampo(id: number, fn: (arr: AnexoItem[]) => AnexoItem[]) {
    setAnexos(prev => ({ ...prev, [id]: fn(prev[id] ?? []) }))
  }
  async function onAnexoSelect(campoId: number, files: FileList) {
    for (const file of Array.from(files)) {
      const idx = (anexos[campoId]?.length ?? 0)
      setAnexosCampo(campoId, a => [...a, { nome: file.name, enviando: true }])
      const fd = new FormData(); fd.set('file', file); fd.set('campo_id', String(campoId))
      const res = await uploadAnexo(fd)
      setAnexosCampo(campoId, a => a.map((it, i) => i === idx
        ? (res.ok ? { nome: file.name, meta: res.anexo } : { nome: `${file.name} — ${res.erro}`, erro: true })
        : it))
    }
  }
  const onAnexoRemove = (campoId: number, idx: number) => setAnexosCampo(campoId, a => a.filter((_, i) => i !== idx))

  const anexosUI: Record<number, AnexoLocal[]> = Object.fromEntries(
    Object.entries(anexos).map(([k, arr]) => [k, arr.map(({ nome, enviando, erro }) => ({ nome, enviando, erro }))]))

  function barrar(mensagem: string, alvo: string) {
    setErro(mensagem); setInvalido(alvo)
    const el = document.getElementById(alvo)
    el?.focus()
    // o anexo é um <label> (não recebe foco): rolar até ele é o que o põe à vista
    el?.scrollIntoView({ block: 'nearest' })
  }

  async function enviar() {
    setErro(null); setInvalido(null)
    if (!tipo) { barrar('Escolha o tipo de solicitação.', 'ns-tipo'); return }
    if (!dataLimite) { barrar('Escolha a data limite no calendário do campo.', 'ns-data'); return }
    const destinatario_role_id = destMode === 'role' ? (destRole ? Number(destRole) : null) : null
    const destinatario_user_id = destMode === 'usuario' ? (destUser || null) : null
    if (!destinatario_role_id && !destinatario_user_id) { barrar('Escolha um destinatário.', 'ns-dest'); return }
    // guarda defensiva: impede race via teclado/submit duplo com anexo ainda subindo
    if (subindo) { setErro('Aguarde o envio dos anexos terminar.'); return }
    // avisa o usuário sobre anexo com falha (em vez de silenciar o erro)
    if (comAnexoErro) { setErro('Há anexo com falha de envio — remova-o ou tente novamente.'); return }
    // v6.2.1 — número/moeda vão ao banco na forma que ele aceita (o regex de lá só aceita UM
    // separador, e "1.234,56" é o jeito natural de digitar). O que não dá para ler para aqui,
    // com o nome do campo, em vez de virar o "valor inválido em um dos campos" do servidor.
    const anexosOk = Object.fromEntries(Object.entries(anexos).map(([k, arr]) => [k, arr.filter(a => a.meta).length]))
    const falha = validarCamposAbertura(tipo.campos, valores, anexosOk)
    if (falha) { barrar(falha.mensagem, `campo-${falha.campoId}`); return }
    const norm = normalizarRespostasNumericas(tipo.campos, valores)
    if (!norm.ok) { barrar(`${norm.rotulo}: valor não reconhecido. Use, por exemplo, 1.234,56.`, `campo-${norm.campoId}`); return }
    // A moeda viaja como `<campo_id>:moeda`, chave que `app.solic_validar_e_snapshotar` lê (0309).
    const respostas: Record<string, string> = { ...norm.respostas }
    for (const c of tipo.campos) {
      if (c.tipo_campo === 'moeda' && c.id != null) respostas[`${c.id}:moeda`] = moedas[c.id] ?? 'BRL'
    }
    const anexosMeta = Object.values(anexos).flat().map(a => a.meta).filter((m): m is AnexoMeta => !!m)
    setEnviando(true)
    const res = await criarSolicitacao({
      tipo_id: tipo.id, destinatario_user_id, destinatario_role_id,
      data_limite: dataLimite, descricao, respostas, anexos: anexosMeta,
    })
    setEnviando(false)
    if (!res.ok) { setErro(res.erro); return }
    router.refresh(); onFechar()
  }

  // alturaFixa (v5.1.1): o modal não "pula" de tamanho quando o Tipo troca os campos
  // dinâmicos — o corpo rola por dentro (ScrollAutoHide do ModalCentral).
  //
  // v5.4.3 — a barra de ação e a mensagem de erro vivem no `rodape` FIXO do ModalCentral,
  // não no corpo rolável. Antes, o erro de validação ("Informe a data-limite") aparecia no
  // TOPO do corpo enquanto o botão "Enviar solicitação" ficava lá embaixo: quem clicava não
  // via a mensagem e o modal parecia não responder. Botar só a faixa no fim do corpo não
  // resolveria — o corpo rola, então erro e botão ainda poderiam estar fora da vista, e
  // inserir a faixa acima do botão empurraria o botão para fora do viewport rolável. No
  // rodapé fixo (DS §4.1: barra de ação fora da região rolável) o painel tem altura fixa,
  // então o rodapé crescer só ENCOLHE o corpo — o botão não se mexe e o erro nasce colado
  // nele. `role="alert"` da FaixaMensagem cobre o anúncio por leitor de tela.
  return (
    <ModalCentral
      titulo="Nova solicitação"
      subtitulo="Abra um pedido para um usuário ou para um grupo de usuários"
      alturaFixa
      onClose={onFechar}
      rodape={
        <>
          {erro && <FaixaMensagem tipo="erro" texto={erro} onFechar={() => { setErro(null); setInvalido(null) }} />}
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onFechar} className={`${PILL} ${PILL_NEUTRO}`}>Cancelar</button>
            {/* desabilitado enquanto há upload em voo (subindo); erro de anexo é tratado via FaixaMensagem no clique */}
            <button type="button" onClick={enviar} disabled={enviando || subindo} className={`${PILL} ${PILL_PRIMARIA}`} style={PILL_PRIMARIA_STYLE}>
              {(enviando || subindo) && <Loader2 size={13} className="animate-spin" />} Enviar solicitação
            </button>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="ns-tipo" className="block text-xs font-medium text-zinc-600 mb-1">Tipo <span className="text-danger">*</span></label>
            <Select id="ns-tipo" value={tipoId} onChange={e => { limparSe('ns-tipo'); trocarTipo(Number(e.target.value)) }}
              aria-invalid={invalido === 'ns-tipo' ? true : undefined} autoFocus>
              <option value="">Selecione…</option>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="ns-data" className="block text-xs font-medium text-zinc-600 mb-1">
              Data limite <span className="text-danger">*</span>
              {/* Abre à ESQUERDA (ancoraDireita): a coluna Data limite fica à direita do
                  modal e o balão vazava/era recortado pelo viewport rolável. (v5.1.1) */}
              <GatilhoAjuda
                rotulo="Data limite"
                texto="Data limite para resposta da solicitação. Prazo padrão de 3 dias."
                classNameBalao="z-30 w-56 !whitespace-normal font-normal leading-snug"
                ancoraDireita
                className="ml-1"
              />
            </label>
            <CampoData id="ns-data" value={dataLimite} onChange={e => { limparSe('ns-data'); setDataLimite(e.target.value) }}
              aria-invalid={invalido === 'ns-data' ? true : undefined} />
          </div>
        </div>

        <div>
          <span className="block text-xs font-medium text-zinc-600 mb-1">Destinatário <span className="text-danger">*</span></span>
          <div className="flex gap-2 mb-2">
            <button type="button" onClick={() => setDestMode('role')} className={`${PILL} ${destMode === 'role' ? PILL_PRIMARIA : PILL_NEUTRO}`} style={destMode === 'role' ? PILL_PRIMARIA_STYLE : undefined}>Grupo</button>
            <button type="button" onClick={() => setDestMode('usuario')} className={`${PILL} ${destMode === 'usuario' ? PILL_PRIMARIA : PILL_NEUTRO}`} style={destMode === 'usuario' ? PILL_PRIMARIA_STYLE : undefined}>Usuário</button>
          </div>
          {destMode === 'role' ? (
            <Select id="ns-dest" aria-label="Grupo destinatário" value={destRole} onChange={e => { limparSe('ns-dest'); setDestRole(e.target.value) }}
              aria-invalid={invalido === 'ns-dest' ? true : undefined}>
              <option value="">Selecione o grupo…</option>
              {destinatarios.roles.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </Select>
          ) : (
            <Select id="ns-dest" aria-label="Usuário destinatário" value={destUser} onChange={e => { limparSe('ns-dest'); setDestUser(e.target.value) }}
              aria-invalid={invalido === 'ns-dest' ? true : undefined}>
              <option value="">Selecione o usuário…</option>
              {destinatarios.usuarios.map(u => <option key={u.user_id} value={u.user_id}>{u.email}</option>)}
            </Select>
          )}
        </div>

        <div>
          <label htmlFor="ns-desc" className="block text-xs font-medium text-zinc-600 mb-1">Descrição</label>
          <Textarea id="ns-desc" rows={2} value={descricao} onChange={e => setDescricao(e.target.value)} className="resize-none" placeholder="Contexto do pedido (opcional)" />
        </div>

        {tipo && tipo.campos.length > 0 && (
          <div className="border-t border-zinc-100 pt-3">
            <p className="text-2xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Campos de {tipo.nome}</p>
            <CamposDinamicos campos={tipo.campos} valores={valores}
              onValor={(id, val) => { limparSe(`campo-${id}`); setValores(p => ({ ...p, [String(id)]: val })) }}
              anexos={anexosUI} onAnexoSelect={(id, files) => { limparSe(`campo-${id}`); void onAnexoSelect(id, files) }}
              onAnexoRemove={onAnexoRemove}
              moedas={moedas} onMoeda={(id, m) => setMoedas(p => ({ ...p, [id]: m }))}
              invalido={invalido?.startsWith('campo-') ? Number(invalido.slice('campo-'.length)) : null} />
          </div>
        )}
      </div>
    </ModalCentral>
  )
}
