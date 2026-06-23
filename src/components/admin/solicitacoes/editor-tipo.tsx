'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Plus, X } from 'lucide-react'
import { salvarTipo } from '@/app/admin/solicitacoes/actions'
import { TIPOS_CAMPO, type CampoDef, type TipoAdmin, type TipoCampo } from '@/lib/solicitacoes/schemas'
import ModalCentral from '@/components/shared/modal-central'
import Checkbox from '@/components/ui/checkbox'
import { Input, Select } from '@/components/ui/field'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'

// v4.16.0 (spec §2.4 C) — editor de Tipo de Solicitação (criar/editar). Nome do
// tipo + construtor de campos (rótulo, tipo, obrigatório, reordenar ↑/↓, remover;
// sub-editor de opções para 'seleção'). Validação leve no client; o servidor
// revalida. Tema neutro Group (tokens neutros, .foco-neutro, pills de @/.../botoes).

const ROTULO_TIPO: Record<TipoCampo, string> = {
  texto_curto: 'Texto curto',
  texto_longo: 'Texto longo',
  numero:      'Número',
  moeda:       'Moeda (R$)',
  data:        'Data',
  selecao:     'Seleção',
  anexo:       'Anexo',
}

// Linha do construtor com chave estável (key independente do índice, que muda ao reordenar).
type Linha = CampoDef & { _key: string }

let _seq = 0
function novaChave(): string {
  _seq += 1
  return `campo-${Date.now()}-${_seq}`
}

function comoLinhas(campos: CampoDef[]): Linha[] {
  return [...campos]
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .map(c => ({ ...c, _key: novaChave() }))
}

export function EditorTipo({
  modo,
  tipo,
  onFechar,
  onSalvo,
}: {
  modo:     'criar' | 'editar'
  tipo?:    TipoAdmin
  onFechar: () => void
  onSalvo:  (msg: string) => void
}) {
  const [nome, setNome] = useState(tipo?.nome ?? '')
  const [linhas, setLinhas] = useState<Linha[]>(() => comoLinhas(tipo?.campos ?? []))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function adicionarCampo() {
    setLinhas(prev => [
      ...prev,
      { _key: novaChave(), rotulo: '', tipo_campo: 'texto_curto', obrigatorio: false, opcoes: null,
        data_permite_passado: true, data_aviso_dias_futuro: null },
    ])
  }

  function removerCampo(key: string) {
    setLinhas(prev => prev.filter(l => l._key !== key))
  }

  function atualizarCampo(key: string, patch: Partial<CampoDef>) {
    setLinhas(prev => prev.map(l => (l._key === key ? { ...l, ...patch } : l)))
  }

  function mudarTipo(key: string, tipoCampo: TipoCampo) {
    setLinhas(prev =>
      prev.map(l => {
        if (l._key !== key) return l
        // Ao virar seleção, garantir ≥1 opção; ao deixar de ser, descartar opções.
        if (tipoCampo === 'selecao') {
          return { ...l, tipo_campo: tipoCampo, opcoes: l.opcoes && l.opcoes.length > 0 ? l.opcoes : [''] }
        }
        // Ao virar data, semear a config de data (permite passado ON por padrão).
        if (tipoCampo === 'data') {
          return {
            ...l, tipo_campo: tipoCampo, opcoes: null,
            data_permite_passado:   l.data_permite_passado ?? true,
            data_aviso_dias_futuro: l.data_aviso_dias_futuro ?? null,
          }
        }
        return { ...l, tipo_campo: tipoCampo, opcoes: null }
      }),
    )
  }

  function mover(index: number, delta: -1 | 1) {
    setLinhas(prev => {
      const destino = index + delta
      if (destino < 0 || destino >= prev.length) return prev
      const novo = [...prev]
      const [item] = novo.splice(index, 1)
      novo.splice(destino, 0, item)
      return novo
    })
  }

  // --- sub-editor de opções (seleção) ---
  function adicionarOpcao(key: string) {
    setLinhas(prev => prev.map(l => (l._key === key ? { ...l, opcoes: [...(l.opcoes ?? []), ''] } : l)))
  }

  function atualizarOpcao(key: string, idx: number, valor: string) {
    setLinhas(prev =>
      prev.map(l =>
        l._key === key ? { ...l, opcoes: (l.opcoes ?? []).map((o, i) => (i === idx ? valor : o)) } : l,
      ),
    )
  }

  function removerOpcao(key: string, idx: number) {
    setLinhas(prev =>
      prev.map(l => (l._key === key ? { ...l, opcoes: (l.opcoes ?? []).filter((_, i) => i !== idx) } : l)),
    )
  }

  function validar(): string | null {
    if (!nome.trim()) return 'Informe o nome do tipo.'
    if (linhas.length === 0) return 'Adicione ao menos um campo.'
    for (const l of linhas) {
      if (!l.rotulo.trim()) return 'Todo campo precisa de um rótulo.'
      if (l.tipo_campo === 'selecao') {
        const validas = (l.opcoes ?? []).map(o => o.trim()).filter(Boolean)
        if (validas.length === 0) return `O campo «${l.rotulo.trim()}» é de seleção e precisa de ao menos uma opção.`
      }
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    const erroValidacao = validar()
    if (erroValidacao) {
      setErro(erroValidacao)
      return
    }

    const campos: CampoDef[] = linhas.map((l, i) => ({
      rotulo:      l.rotulo.trim(),
      tipo_campo:  l.tipo_campo,
      obrigatorio: l.obrigatorio,
      opcoes:
        l.tipo_campo === 'selecao'
          ? (l.opcoes ?? []).map(o => o.trim()).filter(Boolean)
          : null,
      // Config de data só viaja quando o campo é 'data' (senão default no banco).
      data_permite_passado:   l.tipo_campo === 'data' ? (l.data_permite_passado ?? true) : true,
      data_aviso_dias_futuro: l.tipo_campo === 'data' ? (l.data_aviso_dias_futuro ?? null) : null,
      ordem: i,
    }))

    setSalvando(true)
    const res = await salvarTipo({ id: modo === 'editar' ? tipo!.id : null, nome: nome.trim(), campos })
    setSalvando(false)
    if (!res.ok) {
      setErro(res.erro)
      return
    }
    onSalvo('Tipo salvo.')
  }

  return (
    <ModalCentral
      titulo={modo === 'criar' ? 'Novo tipo de solicitação' : `Editar «${tipo?.nome}»`}
      subtitulo="Defina o nome e os campos que o solicitante preencherá"
      onClose={onFechar}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {erro && <FaixaMensagem tipo="erro" texto={erro} onFechar={() => setErro(null)} />}

        <div>
          <label htmlFor="tipo-nome" className="block text-xs font-medium text-zinc-600 mb-1">
            Nome do tipo <span className="text-danger" aria-hidden="true">*</span>
          </label>
          <Input
            id="tipo-nome"
            type="text"
            required
            autoFocus
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Ex.: Solicitação de pagamento"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-zinc-600">Campos</p>
            <button type="button" onClick={adicionarCampo} className={`${PILL} ${PILL_NEUTRO}`}>
              <Plus size={14} /> Adicionar campo
            </button>
          </div>

          {linhas.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-center text-sm text-zinc-400">
              Nenhum campo ainda. Use «Adicionar campo».
            </p>
          ) : (
            <div className="space-y-3">
              {linhas.map((linha, index) => (
                <fieldset key={linha._key} className="rounded-lg border border-zinc-200 p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0 space-y-2">
                      <Input
                        type="text"
                        value={linha.rotulo}
                        onChange={e => atualizarCampo(linha._key, { rotulo: e.target.value })}
                        placeholder="Rótulo do campo (ex.: Valor a pagar)"
                        aria-label={`Rótulo do campo ${index + 1}`}
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <Select
                          value={linha.tipo_campo}
                          onChange={e => mudarTipo(linha._key, e.target.value as TipoCampo)}
                          aria-label={`Tipo do campo ${index + 1}`}
                          className="w-auto"
                        >
                          {TIPOS_CAMPO.map(t => (
                            <option key={t} value={t}>{ROTULO_TIPO[t]}</option>
                          ))}
                        </Select>
                        <div className="flex items-center gap-2 text-sm text-zinc-700">
                          <Checkbox
                            id={`obrig-${linha._key}`}
                            checked={linha.obrigatorio}
                            onChange={b => atualizarCampo(linha._key, { obrigatorio: b })}
                            aria-label="Campo obrigatório"
                          />
                          <label htmlFor={`obrig-${linha._key}`} className="cursor-pointer">
                            Obrigatório
                          </label>
                        </div>
                      </div>

                      {linha.tipo_campo === 'selecao' && (
                        <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-2.5">
                          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-zinc-400">
                            Opções
                          </p>
                          <div className="space-y-1.5">
                            {(linha.opcoes ?? []).map((opcao, oi) => (
                              <div key={oi} className="flex items-center gap-2">
                                <Input
                                  type="text"
                                  value={opcao}
                                  onChange={e => atualizarOpcao(linha._key, oi, e.target.value)}
                                  placeholder={`Opção ${oi + 1}`}
                                  aria-label={`Opção ${oi + 1} do campo ${index + 1}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => removerOpcao(linha._key, oi)}
                                  disabled={(linha.opcoes ?? []).length <= 1}
                                  aria-label={`Remover opção ${oi + 1}`}
                                  title={(linha.opcoes ?? []).length <= 1 ? 'É preciso ao menos uma opção' : 'Remover opção'}
                                  className="foco-neutro shrink-0 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => adicionarOpcao(linha._key)}
                            className="foco-neutro mt-2 inline-flex items-center gap-1 rounded px-1 text-xs font-medium text-zinc-500 hover:text-zinc-800"
                          >
                            <Plus size={12} /> Adicionar opção
                          </button>
                        </div>
                      )}

                      {linha.tipo_campo === 'data' && (
                        <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-2.5">
                          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-zinc-400">
                            Regra de data
                          </p>
                          <div className="flex items-center gap-2 text-sm text-zinc-700">
                            <Checkbox
                              id={`data-passado-${linha._key}`}
                              checked={linha.data_permite_passado ?? true}
                              onChange={b => atualizarCampo(linha._key, { data_permite_passado: b })}
                              aria-label="Permitir data anterior a hoje"
                            />
                            <label htmlFor={`data-passado-${linha._key}`} className="cursor-pointer">
                              Permitir data anterior a hoje
                            </label>
                          </div>
                          <div className="mt-2">
                            <label htmlFor={`data-aviso-${linha._key}`} className="mb-1 block text-xs text-zinc-500">
                              Avisar se a data estiver a mais de N dias no futuro
                            </label>
                            <Input
                              id={`data-aviso-${linha._key}`}
                              type="number"
                              min={1}
                              inputMode="numeric"
                              value={linha.data_aviso_dias_futuro ?? ''}
                              onChange={e => {
                                const n = e.target.value.trim()
                                const parsed = Number(n)
                                atualizarCampo(linha._key, {
                                  data_aviso_dias_futuro:
                                    n === '' || !Number.isFinite(parsed) ? null : Math.max(1, Math.trunc(parsed)),
                                })
                              }}
                              placeholder="Sem aviso"
                              aria-label={`Avisar se a data estiver a mais de N dias no futuro (campo ${index + 1})`}
                              className="w-40"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-center gap-1">
                      <button
                        type="button"
                        onClick={() => mover(index, -1)}
                        disabled={index === 0}
                        aria-label={`Mover campo ${index + 1} para cima`}
                        className="foco-neutro rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => mover(index, 1)}
                        disabled={index === linhas.length - 1}
                        aria-label={`Mover campo ${index + 1} para baixo`}
                        className="foco-neutro rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronDown size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removerCampo(linha._key)}
                        aria-label={`Remover campo ${index + 1}`}
                        className="foco-neutro rounded-lg p-1 text-zinc-400 transition-colors hover:bg-danger-bg hover:text-danger"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </fieldset>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          <button type="button" onClick={onFechar} disabled={salvando} className={`${PILL} ${PILL_NEUTRO}`}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className={`${PILL} ${PILL_PRIMARIA}`} style={PILL_PRIMARIA_STYLE}>
            {salvando && <Loader2 size={14} className="animate-spin" />}
            Salvar
          </button>
        </div>
      </form>
    </ModalCentral>
  )
}
