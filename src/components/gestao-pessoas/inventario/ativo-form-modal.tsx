'use client'

import { useId, useMemo, useState } from 'react'
import ModalCentral from '@/components/shared/modal-central'
import Button from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/field'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { mascaraMoeda, numBRL2 } from '@/lib/fmt'
import { criarAtivo, atualizarAtivo, type FichaEntrada } from '@/app/gestao-pessoas/inventario/actions'
import { ROTULO_ESTADO_CONSERVACAO, mesmoNome } from './derivar'
import type {
  AtivoLista, CatalogosInventario, EstadoConservacao,
} from './tipos'

// Formulário da FICHA patrimonial (v5.6.0/M3) — cadastro, edição e duplicação no mesmo modal.
//
// Duas regras de desenho que vêm direto do briefing:
//
// 1. NA EDIÇÃO NÃO EXISTE CAMPO DE LOCALIZAÇÃO (invariante 3). Não é um campo desabilitado nem
//    escondido por permissão: ele não é renderizado, porque "movimentação ≠ correção de
//    cadastro". A RPC recusa de todo jeito — a UI não repete a regra, ela obedece.
// 2. O PARQUE INTEIRO SERÁ DIGITADO NUMA SENTADA. Daí "Salvar e cadastrar outro", que retém
//    tudo menos o que é único de cada peça (código, nº de série, nota fiscal), e o
//    "Duplicar ativo" da ficha, que chega aqui como valores iniciais.

const ESTADOS: EstadoConservacao[] = ['novo', 'bom', 'regular', 'ruim']

/** Valores que sobrevivem a um "salvar e cadastrar outro" — e que a duplicação preenche. */
export interface ValoresRetidos {
  descricao: string
  categoria_id: string
  area_id: string
  detentor: string
  fornecedor: string
  data_aquisicao: string
  valor_display: string
  estado_conservacao: string
  obs: string
}

export type EstadoForm =
  | { modo: 'criar'; retidos: ValoresRetidos | null }
  | { modo: 'editar'; ativo: AtivoLista }

const VAZIO: ValoresRetidos = {
  descricao: '', categoria_id: '', area_id: '', detentor: '', fornecedor: '',
  data_aquisicao: '', valor_display: '', estado_conservacao: '', obs: '',
}

/**
 * Duplicar: repete categoria, área, fornecedor, aquisição e valor; o CÓDIGO e o Nº DE SÉRIE
 * ficam de fora (são a identidade única da peça, e a nota fiscal segue o mesmo destino).
 * A área/detentor vêm do estado ATUAL do ativo — que é derivado do razão, não coluna.
 */
export function retidosDe(ativo: AtivoLista, catalogos: CatalogosInventario): ValoresRetidos {
  const area = catalogos.areas.find(a => a.nome === ativo.area_atual_nome)
  return {
    descricao:          ativo.descricao,
    categoria_id:       String(ativo.categoria_id),
    area_id:            area ? String(area.id) : '',
    detentor:           ativo.detentor_atual_nome ?? '',
    fornecedor:         ativo.fornecedor ?? '',
    data_aquisicao:     ativo.data_aquisicao ?? '',
    valor_display:      ativo.valor_aquisicao != null ? `R$ ${numBRL2(ativo.valor_aquisicao)}` : '',
    estado_conservacao: ativo.estado_conservacao ?? '',
    obs:                ativo.obs ?? '',
  }
}

interface Props {
  estado: EstadoForm
  catalogos: CatalogosInventario
  onFechar: () => void
  /** `retidos` volta preenchido quando o usuário escolheu seguir cadastrando. */
  onSalvo: (mensagem: string, retidos: ValoresRetidos | null) => void
}

export default function AtivoFormModal({ estado, catalogos, onFechar, onSalvo }: Props) {
  const editando = estado.modo === 'editar'
  // O modal só monta por interação (nunca no SSR) e é remontado a cada abertura, então ler o
  // `estado` no initializer é seguro — sem "ajustar na render" e sem setState em efeito.
  const base = editando ? retidosDe(estado.ativo, catalogos) : (estado.retidos ?? VAZIO)

  const [codigo, setCodigo]         = useState(editando ? estado.ativo.codigo : '')
  const [descricao, setDescricao]   = useState(base.descricao)
  const [categoriaId, setCategoria] = useState(base.categoria_id)
  const [areaId, setAreaId]         = useState(base.area_id)
  const [detentor, setDetentor]     = useState(base.detentor)
  const [serie, setSerie]           = useState(editando ? (estado.ativo.numero_serie ?? '') : '')
  const [fornecedor, setFornecedor] = useState(base.fornecedor)
  const [dataAq, setDataAq]         = useState(base.data_aquisicao)
  const [valor, setValor]           = useState(() => mascaraMoeda(base.valor_display))
  const [notaFiscal, setNota]       = useState(editando ? (estado.ativo.nota_fiscal ?? '') : '')
  const [conservacao, setConserv]   = useState(base.estado_conservacao)
  const [obs, setObs]               = useState(base.obs)
  const [erro, setErro]             = useState<string | null>(null)
  const [salvando, setSalvando]     = useState(false)

  const idDetentores = useId()

  const nomesDetentores = useMemo(
    () => catalogos.detentores.filter(d => d.ativo).map(d => d.nome),
    [catalogos.detentores],
  )
  // Comparação NORMALIZADA (como o UNIQUE do banco): "ana  beatriz" não é pessoa nova se a Ana
  // Beatriz já existe — o upsert reaproveita, e o aviso na tela tem de dizer a mesma coisa.
  const detentorNovo = detentor.trim() !== '' && !nomesDetentores.some(n => mesmoNome(n, detentor))

  function valoresAtuais(): ValoresRetidos {
    return {
      descricao, categoria_id: categoriaId, area_id: areaId, detentor, fornecedor,
      data_aquisicao: dataAq, valor_display: valor.display, estado_conservacao: conservacao, obs,
    }
  }

  function ficha(): FichaEntrada {
    const limpo = (s: string) => (s.trim() === '' ? null : s.trim())
    return {
      descricao:          descricao.trim(),
      categoria_id:       Number(categoriaId),
      codigo:             limpo(codigo),
      numero_serie:       limpo(serie),
      fornecedor:         limpo(fornecedor),
      data_aquisicao:     limpo(dataAq),
      valor_aquisicao:    valor.valor,
      nota_fiscal:        limpo(notaFiscal),
      estado_conservacao: (limpo(conservacao) as EstadoConservacao | null),
      obs:                limpo(obs),
    }
  }

  async function salvar(seguirCadastrando: boolean) {
    if (descricao.trim() === '')  { setErro('Informe a descrição do item.'); return }
    if (categoriaId === '')       { setErro('Escolha a categoria.'); return }
    if (!editando && areaId === '') { setErro('Todo ativo nasce numa área — escolha uma.'); return }

    setErro(null)
    setSalvando(true)
    const nome = detentor.trim()
    const existente = catalogos.detentores.find(d => mesmoNome(d.nome, nome))
    const res = editando
      ? await atualizarAtivo(estado.ativo.id, ficha())
      : await criarAtivo(ficha(), {
          area_destino_id: Number(areaId),
          // Sem pessoa ⇒ o ativo NASCE EM ESTOQUE. Quando a pessoa já existe manda-se o id;
          // nome novo vira cadastro inline no servidor (upsert idempotente por nome normalizado).
          detentor_destino_id:   existente?.id ?? null,
          detentor_destino_nome: existente ? null : (nome || null),
          data_movimentacao:     null,   // a RPC usa o hoje de São Paulo
          obs_movimentacao:      null,
        })
    setSalvando(false)

    if (!res.ok) { setErro(res.erro); return }

    const acao = editando ? 'atualizado' : 'cadastrado'
    onSalvo(`Ativo ${res.codigo} ${acao}.`, seguirCadastrando ? valoresAtuais() : null)
  }

  const rodape = (
    <div>
      {erro && <FaixaMensagem tipo="erro" texto={erro} onFechar={() => setErro(null)} />}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="contorno" size="sm" onClick={onFechar} disabled={salvando}>Cancelar</Button>
        {!editando && (
          <Button variant="contorno" size="sm" onClick={() => salvar(true)} disabled={salvando}>
            Salvar e cadastrar outro
          </Button>
        )}
        <Button variant="solido" size="sm" onClick={() => salvar(false)} disabled={salvando}>
          {salvando ? 'Salvando…' : editando ? 'Salvar ficha' : 'Cadastrar ativo'}
        </Button>
      </div>
    </div>
  )

  return (
    <ModalCentral
      titulo={editando ? 'Editar ficha do ativo' : 'Novo ativo'}
      subtitulo={editando
        ? `${estado.ativo.codigo} · a localização não se edita aqui`
        : 'Identidade e ficha patrimonial; o destino inicial abre o histórico'}
      largura="2xl"
      rodape={rodape}
      onClose={onFechar}
    >
      <div className="grid grid-cols-2 gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Código</span>
          <Input
            value={codigo}
            onChange={e => setCodigo(e.target.value)}
            placeholder="Automático (WG-0001)"
            autoComplete="off"
          />
          <span className="text-2xs text-[var(--text-subtle)]">
            Em branco, o sistema numera sozinho. Preencher só para respeitar etiqueta já colada.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Categoria *</span>
          <Select value={categoriaId} onChange={e => setCategoria(e.target.value)}>
            <option value="">Selecione…</option>
            {catalogos.categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
        </label>

        <label className="col-span-2 flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Descrição do item *</span>
          <Input
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            placeholder="Ex.: Notebook Dell Latitude 5440"
            autoComplete="off"
          />
        </label>

        {/* Destino INICIAL — só no cadastro. Na edição estes dois campos NÃO EXISTEM: é a
            invariante 3 na forma mais honesta, a ausência do campo. */}
        {!editando && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-zinc-600">Área inicial *</span>
              <Select value={areaId} onChange={e => setAreaId(e.target.value)}>
                <option value="">Selecione…</option>
                {catalogos.areas.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </Select>
              <span className="text-2xs text-[var(--text-subtle)]">Departamento administrativo.</span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-zinc-600">Fica com</span>
              <Input
                list={idDetentores}
                value={detentor}
                onChange={e => setDetentor(e.target.value)}
                placeholder="Deixe vazio para entrar em estoque"
                autoComplete="off"
              />
              <datalist id={idDetentores}>
                {nomesDetentores.map(n => <option key={n} value={n} />)}
              </datalist>
              <span className="text-2xs text-[var(--text-subtle)]">
                {detentorNovo
                  ? `"${detentor.trim()}" será cadastrada como pessoa nova.`
                  : 'Sem pessoa, o ativo nasce em estoque.'}
              </span>
            </label>
          </>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Nº de série</span>
          <Input value={serie} onChange={e => setSerie(e.target.value)} autoComplete="off" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Fornecedor</span>
          <Input value={fornecedor} onChange={e => setFornecedor(e.target.value)} autoComplete="off" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Data de aquisição</span>
          <Input type="date" value={dataAq} onChange={e => setDataAq(e.target.value)} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Valor de aquisição</span>
          {/* Máscara de digitação ao vivo (mascaraMoeda): dígitos são centavos e o campo
              reformata a cada tecla. Vazio = SEM valor, que não é zero — o total do custo
              histórico ignora, em vez de somar 0 (invariante 9). */}
          <Input
            value={valor.display}
            onChange={e => setValor(mascaraMoeda(e.target.value))}
            inputMode="numeric"
            placeholder="R$ 0,00"
            className="tabular-nums"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Nota fiscal</span>
          <Input value={notaFiscal} onChange={e => setNota(e.target.value)} autoComplete="off" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Estado de conservação</span>
          <Select value={conservacao} onChange={e => setConserv(e.target.value)}>
            <option value="">Não informado</option>
            {ESTADOS.map(s => <option key={s} value={s}>{ROTULO_ESTADO_CONSERVACAO[s]}</option>)}
          </Select>
        </label>

        <label className="col-span-2 flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Observações</span>
          <Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} className="resize-none" />
        </label>
      </div>

      <p className="mt-4 text-2xs text-[var(--text-subtle)]">
        {editando
          ? 'Para mudar área ou quem está com o ativo, use "Registrar movimentação" — o histórico é a fonte da verdade.'
          : '"Salvar e cadastrar outro" mantém categoria, área, pessoa, fornecedor e valor; código, série e nota fiscal ficam em branco para a próxima peça.'}
      </p>
    </ModalCentral>
  )
}
