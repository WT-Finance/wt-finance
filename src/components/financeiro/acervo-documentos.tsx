'use client'

import { useMemo, useState } from 'react'
import { Search, Plus, Download, FileText, Upload, Loader2, X } from 'lucide-react'
import ModalCentral from '@/components/shared/modal-central'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { PILL, PILL_GESTAO, PILL_GESTAO_STYLE } from '@/components/shared/botoes'
import Button from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/field'
import { uploadDocumento, documentoUrl } from '@/app/financeiro/acervo/actions'
import type { AcervoDocumento } from '@/lib/schemas-rpc'

// Acervo de Documentos (v4.34.0) — biblioteca em formato de GLOSSÁRIO: documentos agrupados
// por letra inicial do título, ordem alfabética ('#' por último para títulos que não começam
// com A-Z). Busca client-side (título/descrição/nome do arquivo, acento-insensível). O botão
// "Adicionar" só é renderizado quando `podeAdicionar` (calculado no server pela área de
// gestão). Download com o padrão popup-safe de drawer-solicitacao.tsx (window.open síncrono
// antes do await, redireciona para a signed URL depois).

const LIMITE_BYTES = 25 * 1024 * 1024 // 25 MB

/** Bytes → "512 B" / "340,5 KB" / "1,2 MB" — formatação NÚMERO→STRING (fora do escopo do
 *  lint de coerção, que só barra a direção string→número). */
function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

/** Normaliza para comparação/agrupamento: remove diacríticos + lowercase. */
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Letra do glossário: 1º caractere do título (sem diacríticos, maiúsculo); A-Z ou '#'. */
function letraDe(titulo: string): string {
  const c = normalizar(titulo).trim().charAt(0).toUpperCase()
  return c >= 'A' && c <= 'Z' ? c : '#'
}

/** Pill "Adicionar" (âmbar --gestao) — MÓDULO-nível (nunca definir componente no render). */
function BotaoAdicionar({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${PILL} ${PILL_GESTAO} whitespace-nowrap${className ? ` ${className}` : ''}`}
      style={PILL_GESTAO_STYLE}
    >
      <Plus size={13} /> Adicionar
    </button>
  )
}

interface Props {
  documentosIniciais: AcervoDocumento[]
  podeAdicionar: boolean
  erroInicial?: string | null
}

export default function AcervoDocumentos({ documentosIniciais, podeAdicionar, erroInicial }: Props) {
  const [documentos, setDocumentos] = useState<AcervoDocumento[]>(documentosIniciais)
  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [erroCarga, setErroCarga] = useState<string | null>(erroInicial ?? null)
  const [erroDownload, setErroDownload] = useState<string | null>(null)
  const [baixando, setBaixando] = useState<number | null>(null)

  const filtrados = useMemo(() => {
    const q = normalizar(busca.trim())
    if (!q) return documentos
    return documentos.filter(d =>
      normalizar(d.titulo).includes(q) ||
      normalizar(d.descricao).includes(q) ||
      normalizar(d.nome_arquivo).includes(q))
  }, [documentos, busca])

  // Agrupamento A-Z (glossário): letras em ordem alfabética com '#' por ÚLTIMO; dentro de
  // cada letra, títulos por localeCompare pt-BR (acento/caixa-insensível).
  const grupos = useMemo(() => {
    const mapa = new Map<string, AcervoDocumento[]>()
    for (const doc of filtrados) {
      const letra = letraDe(doc.titulo)
      const arr = mapa.get(letra)
      if (arr) arr.push(doc)
      else mapa.set(letra, [doc])
    }
    const letras = [...mapa.keys()].sort((a, b) => {
      if (a === '#') return 1
      if (b === '#') return -1
      return a.localeCompare(b, 'pt-BR')
    })
    return letras.map(letra => ({
      letra,
      docs: [...(mapa.get(letra) ?? [])].sort((a, b) =>
        a.titulo.localeCompare(b.titulo, 'pt-BR', { sensitivity: 'base' })),
    }))
  }, [filtrados])

  async function baixar(doc: AcervoDocumento) {
    // Evita duplo-clique enquanto já há um download em progresso.
    if (baixando !== null) return
    setErroDownload(null)
    setBaixando(doc.id)
    // Abre a janela SÍNCRONA (antes do await) para não ser bloqueada pelo popup-blocker;
    // depois redireciona para a URL assinada (padrão de drawer-solicitacao.tsx).
    const w = window.open('', '_blank')
    if (w) w.opener = null
    try {
      const r = await documentoUrl(doc.id)
      if (r.ok) {
        if (w) w.location.href = r.url
        else window.open(r.url, '_blank', 'noopener')
      } else {
        w?.close()
        setErroDownload(r.erro)
      }
    } catch {
      w?.close()
      setErroDownload('Falha ao gerar o link do documento. Tente novamente.')
    } finally {
      setBaixando(null)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Acervo de Documentos</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Biblioteca de documentos do financeiro — modelos, manuais e referências.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por título ou descrição…"
            aria-label="Buscar documentos do acervo"
            className="foco-neutro w-72 max-w-full rounded-lg border border-zinc-300 bg-white py-2 pl-8 pr-3 text-sm text-zinc-700 outline-none transition placeholder:text-zinc-400"
          />
        </div>
        {podeAdicionar && <BotaoAdicionar onClick={() => setModalAberto(true)} />}
      </div>

      {erroCarga && <FaixaMensagem tipo="erro" texto={erroCarga} onFechar={() => setErroCarga(null)} />}
      {erroDownload && <FaixaMensagem tipo="erro" texto={erroDownload} onFechar={() => setErroDownload(null)} />}

      {grupos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-200 py-10 text-center">
          {busca.trim() ? (
            <p className="text-sm text-zinc-400">Nenhum documento encontrado para «{busca.trim()}».</p>
          ) : (
            <>
              <p className="text-sm text-zinc-400 mb-3">Nenhum documento no acervo ainda.</p>
              {podeAdicionar && <BotaoAdicionar onClick={() => setModalAberto(true)} className="mx-auto" />}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {grupos.map(({ letra, docs }) => (
            <section key={letra} aria-labelledby={`acervo-letra-${letra}`}>
              <h2
                id={`acervo-letra-${letra}`}
                className="text-2xl font-semibold text-brand-deep border-b border-zinc-200 pb-1.5 mb-2"
              >
                {letra}
              </h2>
              <ul className="divide-y divide-zinc-100">
                {docs.map(doc => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => baixar(doc)}
                      disabled={baixando !== null}
                      aria-label={`Baixar ${doc.titulo}`}
                      className="foco-neutro flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-zinc-50 disabled:opacity-60"
                    >
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-text-primary truncate">{doc.titulo}</p>
                        {doc.descricao && (
                          <p className="text-sm text-text-muted mt-0.5 line-clamp-2">{doc.descricao}</p>
                        )}
                        <p className="mt-1 flex items-center gap-1 text-xs text-text-subtle">
                          <FileText size={12} className="shrink-0" /> <span className="truncate">{doc.nome_arquivo}</span>
                        </p>
                      </div>
                      {baixando === doc.id
                        ? <Loader2 size={16} className="shrink-0 animate-spin text-zinc-400" />
                        : <Download size={16} className="shrink-0 text-zinc-400" />}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {modalAberto && (
        <ModalUpload
          onFechar={() => setModalAberto(false)}
          onCriado={doc => setDocumentos(prev => [...prev, doc])}
        />
      )}
    </div>
  )
}

// ── Modal "Adicionar documento" ───────────────────────────────────────────────

function ModalUpload({ onFechar, onCriado }: { onFechar: () => void; onCriado: (doc: AcervoDocumento) => void }) {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function selecionar(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setErro(null)
    if (file.size > LIMITE_BYTES) {
      setErro(`Arquivo maior que 25 MB (${fmtBytes(file.size)}). Escolha um arquivo menor.`)
      return
    }
    setArquivo(file)
  }

  async function enviar() {
    setErro(null)
    const t = titulo.trim()
    const d = descricao.trim()
    if (!t) { setErro('Informe o título do documento.'); return }
    if (!d) { setErro('Informe a descrição do documento.'); return }
    if (!arquivo) { setErro('Selecione um arquivo.'); return }
    if (arquivo.size > LIMITE_BYTES) { setErro(`Arquivo maior que 25 MB (${fmtBytes(arquivo.size)}).`); return }
    const fd = new FormData()
    fd.set('file', arquivo)
    fd.set('titulo', t)
    fd.set('descricao', d)
    setEnviando(true)
    try {
      const res = await uploadDocumento(fd)
      if (!res.ok) { setErro(res.erro); return }
      onCriado(res.documento)
      onFechar()
    } catch {
      setErro('Falha ao enviar o documento. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <ModalCentral titulo="Adicionar documento" subtitulo="Envie um arquivo ao acervo do financeiro." onClose={onFechar}>
      {erro && <div className="mb-3"><FaixaMensagem tipo="erro" texto={erro} onFechar={() => setErro(null)} /></div>}
      <div className="space-y-4">
        <div>
          <label htmlFor="acervo-titulo" className="block text-xs font-medium text-zinc-600 mb-1">
            Título <span className="text-danger">*</span>
          </label>
          <Input id="acervo-titulo" value={titulo} onChange={e => setTitulo(e.target.value)} autoFocus placeholder="Ex.: Manual de Reembolso" />
        </div>

        <div>
          <label htmlFor="acervo-descricao" className="block text-xs font-medium text-zinc-600 mb-1">
            Descrição <span className="text-danger">*</span>
          </label>
          <Textarea id="acervo-descricao" rows={3} value={descricao} onChange={e => setDescricao(e.target.value)} className="resize-none" placeholder="Do que se trata este documento" />
        </div>

        <div>
          <span className="block text-xs font-medium text-zinc-600 mb-1">Arquivo <span className="text-danger">*</span></span>
          <label className="foco-neutro flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-50">
            <Upload size={14} /> {arquivo ? 'Trocar arquivo' : 'Selecionar arquivo (qualquer tipo, máx. 25 MB)'}
            <input type="file" className="hidden" onChange={e => { selecionar(e.target.files); e.target.value = '' }} />
          </label>
          {arquivo && (
            <div className="mt-1 flex items-center justify-between gap-2 rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-600">
              <span className="truncate">{arquivo.name} — {fmtBytes(arquivo.size)}</span>
              <button type="button" onClick={() => setArquivo(null)} aria-label="Remover arquivo selecionado" className="foco-neutro shrink-0 rounded p-0.5 text-zinc-400 hover:text-danger">
                <X size={13} />
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="contorno" onClick={onFechar}>Cancelar</Button>
          <Button variant="solido" onClick={enviar} disabled={enviando} className="gap-1.5">
            {enviando && <Loader2 size={13} className="animate-spin" />} {enviando ? 'Enviando…' : 'Adicionar'}
          </Button>
        </div>
      </div>
    </ModalCentral>
  )
}
