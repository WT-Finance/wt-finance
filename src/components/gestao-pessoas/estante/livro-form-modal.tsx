'use client'

import { useState } from 'react'
import ModalCentral from '@/components/shared/modal-central'
import Button from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/field'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { criarLivro, atualizarLivro, type LivroEntrada } from '@/app/gestao-pessoas/estante/actions'
import type { LivroLista } from './tipos'

// Formulário de catálogo da Estante (molde: ativo-form-modal.tsx do Inventário) —
// cadastro e edição no mesmo modal. Sem campo de estado/portador: quem está com o
// livro muda só por movimentação (registrada à parte), nunca por aqui.

export type EstadoForm =
  | { modo: 'criar' }
  | { modo: 'editar'; livro: LivroLista }

interface Props {
  estado: EstadoForm
  onFechar: () => void
  onSalvo: (mensagem: string) => void
}

export default function LivroFormModal({ estado, onFechar, onSalvo }: Props) {
  const editando = estado.modo === 'editar'
  const base = editando ? estado.livro : null

  const [titulo, setTitulo]     = useState(base?.titulo ?? '')
  const [autor, setAutor]       = useState(base?.autor ?? '')
  const [editora, setEditora]   = useState(base?.editora ?? '')
  const [ano, setAno]           = useState(base?.ano != null ? String(base.ano) : '')
  const [isbn, setIsbn]         = useState(base?.isbn ?? '')
  const [obs, setObs]           = useState(base?.obs ?? '')
  const [erro, setErro]         = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (titulo.trim() === '') { setErro('Informe o título do livro.'); return }

    const anoLimpo = ano.trim()
    const anoNum = anoLimpo === '' ? null : Number(anoLimpo)
    if (anoNum != null && !Number.isInteger(anoNum)) { setErro('Ano inválido — use só números.'); return }

    const limpo = (s: string) => (s.trim() === '' ? null : s.trim())
    const entrada: LivroEntrada = {
      titulo:  titulo.trim(),
      autor:   limpo(autor),
      editora: limpo(editora),
      ano:     anoNum,
      isbn:    limpo(isbn),
      obs:     limpo(obs),
    }

    setErro(null)
    setSalvando(true)
    const res = editando
      ? await atualizarLivro(estado.livro.id, entrada)
      : await criarLivro(entrada)
    setSalvando(false)

    if (!res.ok) { setErro(res.erro); return }
    onSalvo(editando ? `"${entrada.titulo}" atualizado.` : `"${entrada.titulo}" cadastrado na estante.`)
  }

  const rodape = (
    <div>
      {/* Erro DENTRO do modal, junto do botão — erro fora da vista não é visto (v5.4.3). */}
      {erro && <FaixaMensagem tipo="erro" texto={erro} onFechar={() => setErro(null)} />}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="contorno" size="sm" onClick={onFechar} disabled={salvando}>Cancelar</Button>
        <Button variant="solido" size="sm" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando…' : editando ? 'Salvar' : 'Cadastrar livro'}
        </Button>
      </div>
    </div>
  )

  return (
    <ModalCentral
      titulo={editando ? 'Editar livro' : 'Cadastrar livro'}
      subtitulo={editando ? estado.livro.titulo : 'Quem fica com ele é decidido depois, pela movimentação'}
      largura="2xl"
      rodape={rodape}
      onClose={onFechar}
    >
      <div className="grid grid-cols-2 gap-3.5">
        <label className="col-span-2 flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Título *</span>
          <Input value={titulo} onChange={e => setTitulo(e.target.value)} autoComplete="off" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Autor</span>
          <Input value={autor} onChange={e => setAutor(e.target.value)} autoComplete="off" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Editora</span>
          <Input value={editora} onChange={e => setEditora(e.target.value)} autoComplete="off" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Ano</span>
          <Input
            value={ano}
            onChange={e => setAno(e.target.value)}
            inputMode="numeric"
            placeholder="Ex.: 2019"
            className="tabular-nums"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">ISBN</span>
          <Input value={isbn} onChange={e => setIsbn(e.target.value)} autoComplete="off" />
        </label>

        <label className="col-span-2 flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Observação</span>
          <Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} className="resize-none" />
        </label>
      </div>
    </ModalCentral>
  )
}
