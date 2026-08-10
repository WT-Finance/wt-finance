'use client'

import { useId, useMemo, useState } from 'react'
import ModalCentral from '@/components/shared/modal-central'
import Button from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/field'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { fmtDate, hojeSP } from '@/lib/fmt'
import { registrarMovimentacao } from '@/app/gestao-pessoas/inventario/actions'
import {
  DESTINO_POR_TIPO, ROTULO_MOTIVO_BAIXA, ROTULO_STATUS, ROTULO_TIPO, mesmoNome, rotuloDestino,
  tiposPermitidos,
} from './derivar'
import type {
  AreaPatrimonio, AtivoLista, Detentor, MotivoBaixa, Movimentacao, TipoMovimentacao,
} from './tipos'

// Modal de movimentação. Os campos são CONDICIONAIS ao tipo, governados por `DESTINO_POR_TIPO`
// (a mesma tabela que vira CHECK por tipo no banco na M1) — a UI não tem regra própria.
// Não existe campo "registrado por": vem da sessão (invariante 7).
// A barra de ação vive no RODAPÉ FIXO do ModalCentral, com a faixa de erro junto (v5.4.3):
// no corpo rolável, a mensagem nasceria fora da vista.

const MOTIVOS: MotivoBaixa[] = ['venda', 'descarte', 'perda', 'doacao', 'sinistro']

interface Props {
  ativo: AtivoLista
  /** Último destino conhecido — exibido como ORIGEM (derivada, nunca gravada). */
  ultimaMovimentacao: Movimentacao | null
  areas: AreaPatrimonio[]
  detentores: Detentor[]
  locaisSugeridos: string[]
  onFechar: () => void
  /** Registrada com sucesso: a página recarrega o razão e o estado derivado sai de lá. */
  onRegistrada: (mensagem: string) => void
}

export default function MovimentacaoModal({
  ativo, ultimaMovimentacao, areas, detentores, locaisSugeridos, onFechar, onRegistrada,
}: Props) {
  const permitidos = tiposPermitidos(ativo.status)
  const [tipo, setTipo] = useState<TipoMovimentacao>(permitidos[0])
  // O modal só monta por interação do usuário (nunca no SSR), então `hojeSP()` no
  // initializer não corre risco de divergência de hidratação.
  const [data, setData] = useState(() => hojeSP())
  const [areaId, setAreaId] = useState('')
  const [detentor, setDetentor] = useState('')
  const [texto, setTexto] = useState('')
  const [motivo, setMotivo] = useState<MotivoBaixa>('venda')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const idDetentores = useId()
  const idLocais     = useId()

  const exige = DESTINO_POR_TIPO[tipo]
  const origem = ultimaMovimentacao ? rotuloDestino(ultimaMovimentacao) : null

  const nomesDetentores = useMemo(
    () => detentores.filter(d => d.ativo).map(d => d.nome),
    [detentores],
  )

  // Pessoa digitada que ainda não existe = cadastro inline (`upsert_detentor`, no servidor).
  // Comparação NORMALIZADA, como o UNIQUE do banco: o upsert reaproveita "ana  beatriz" como a
  // Ana Beatriz existente, então a UI não pode anunciar cadastro novo.
  const detentorNovo = detentor.trim() !== '' && !nomesDetentores.some(n => mesmoNome(n, detentor))

  async function submeter() {
    if (exige.area === 'obrigatorio' && areaId === '') {
      setErro('Escolha a área de destino.'); return
    }
    if (exige.detentor === 'obrigatorio' && detentor.trim() === '') {
      setErro('Informe quem fica com o ativo.'); return
    }
    if (exige.texto === 'obrigatorio' && texto.trim() === '') {
      setErro(tipo === 'envio_manutencao' ? 'Informe a assistência ou o fornecedor.' : 'Informe o destino.'); return
    }
    if (data.trim() === '') { setErro('Informe a data da movimentação.'); return }

    setErro(null)
    setSalvando(true)
    const nome = detentor.trim()
    const existente = detentores.find(d => mesmoNome(d.nome, nome))
    // Campo que o tipo NÃO admite vai nulo — a mesma tabela `DESTINO_POR_TIPO` que decide o
    // que aparece decide o que é enviado. O CHECK por tipo do banco é a barreira final.
    const res = await registrarMovimentacao({
      ativo_id:              ativo.id,
      tipo,
      data_movimentacao:     data,
      area_destino_id:       exige.area     && areaId !== '' ? Number(areaId) : null,
      detentor_destino_id:   exige.detentor ? (existente?.id ?? null) : null,
      detentor_destino_nome: exige.detentor && !existente ? (nome || null) : null,
      destino_texto:         exige.texto    ? (texto.trim() || null) : null,
      motivo_baixa:          exige.motivo_baixa ? motivo : null,
      obs: obs.trim() || null,
    })
    setSalvando(false)

    if (!res.ok) { setErro(res.erro); return }
    onRegistrada(`${ROTULO_TIPO[tipo]} registrada — ${ativo.codigo} está ${ROTULO_STATUS[res.status].toLowerCase()}.`)
  }

  const rodape = (
    <div>
      {erro && <FaixaMensagem tipo="erro" texto={erro} onFechar={() => setErro(null)} />}
      <div className="flex justify-end gap-2">
        <Button variant="contorno" size="sm" onClick={onFechar} disabled={salvando}>Cancelar</Button>
        <Button variant="solido" size="sm" onClick={submeter} disabled={salvando}>
          {salvando ? 'Registrando…' : 'Registrar movimentação'}
        </Button>
      </div>
    </div>
  )

  return (
    <ModalCentral
      titulo="Registrar movimentação"
      subtitulo={`${ativo.codigo} · ${ativo.descricao}`}
      largura="2xl"
      rodape={rodape}
      onClose={onFechar}
    >
      {/* Origem: destino da movimentação anterior — mostrada, nunca gravada (invariante 2). */}
      <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-3.5 py-2.5">
        <p className="text-2xs font-semibold uppercase tracking-[0.5px] text-[var(--text-subtle)]">Situação atual</p>
        <p className="mt-0.5 text-sm text-zinc-700">
          {origem ?? '—'}
          {ultimaMovimentacao && (
            <span className="text-[var(--text-subtle)]"> · desde {fmtDate(ultimaMovimentacao.data_movimentacao)}</span>
          )}
        </p>
      </div>

      {/* Aviso (não é erro nem sucesso — as duas únicas variantes da FaixaMensagem), então
          caixa local nos tokens de atenção. `--warning-deep` é o tom que passa AA em corpo pequeno. */}
      {ativo.status === 'baixado' && (
        <p className="mb-4 rounded-lg border border-warning bg-warning-bg px-4 py-2.5 text-sm text-[var(--warning-deep)]">
          Ativo baixado. A única movimentação possível é a reativação — a baixa não se apaga,
          se reverte com um registro novo.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Tipo *</span>
          <Select value={tipo} onChange={e => setTipo(e.target.value as TipoMovimentacao)}>
            {permitidos.map(t => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Data *</span>
          <Input type="date" value={data} onChange={e => setData(e.target.value)} />
          <span className="text-2xs text-[var(--text-subtle)]">
            Data anterior é permitida — o histórico se reordena sozinho.
          </span>
        </label>

        {exige.area && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-zinc-600">
              Área de destino {exige.area === 'obrigatorio' && '*'}
            </span>
            <Select value={areaId} onChange={e => setAreaId(e.target.value)}>
              <option value="">Selecione…</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </Select>
            <span className="text-2xs text-[var(--text-subtle)]">Departamento administrativo.</span>
          </label>
        )}

        {exige.detentor && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-zinc-600">
              Fica com {exige.detentor === 'obrigatorio' && '*'}
            </span>
            <Input
              list={idDetentores}
              value={detentor}
              onChange={e => setDetentor(e.target.value)}
              placeholder="Comece a digitar o nome…"
              autoComplete="off"
            />
            <datalist id={idDetentores}>
              {nomesDetentores.map(n => <option key={n} value={n} />)}
            </datalist>
            <span className="text-2xs text-[var(--text-subtle)]">
              {detentorNovo
                ? `"${detentor.trim()}" será cadastrada como pessoa nova.`
                : 'Pessoa não cadastrada? Digite o nome — ela é criada ao salvar.'}
            </span>
          </label>
        )}

        {exige.texto && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-zinc-600">
              {tipo === 'envio_manutencao' ? 'Assistência / fornecedor' : 'Local ou terceiro'}
              {exige.texto === 'obrigatorio' && ' *'}
            </span>
            <Input
              list={idLocais}
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder="Ex.: TecnoService Assistência"
              autoComplete="off"
            />
            <datalist id={idLocais}>
              {locaisSugeridos.map(l => <option key={l} value={l} />)}
            </datalist>
          </label>
        )}

        {exige.motivo_baixa && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-zinc-600">Motivo da baixa *</span>
            <Select value={motivo} onChange={e => setMotivo(e.target.value as MotivoBaixa)}>
              {MOTIVOS.map(m => <option key={m} value={m}>{ROTULO_MOTIVO_BAIXA[m]}</option>)}
            </Select>
          </label>
        )}

        {tipo === 'devolucao_estoque' && (
          <div className="self-end pb-1 text-2xs text-[var(--text-subtle)]">
            O ativo fica <strong className="font-semibold">sem detentor</strong> — em estoque.
          </div>
        )}

        <label className="col-span-2 flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">
            Observação{tipo === 'emprestimo' && ' (registre aqui a previsão de retorno)'}
          </span>
          <Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} className="resize-none" />
        </label>
      </div>

      <p className="mt-4 text-2xs text-[var(--text-subtle)]">
        Quem registra é identificado pela sessão — não há campo para isso. Movimentação não se
        edita nem se apaga: um erro de destino se conserta com uma movimentação nova.
      </p>
    </ModalCentral>
  )
}
