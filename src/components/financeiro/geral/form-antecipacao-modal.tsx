'use client'

import { useState } from 'react'
import ModalCentral from '@/components/shared/modal-central'
import Button from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { salvarAntecipacao } from '@/app/financeiro/geral/actions'
import { DATA_PISO, descontoEmCentavos, descontoFormatado, lerValorDigitado, mensagemDeFalhaDaAcao, validarFormulario } from '@/lib/financeiro-geral/gestao'
import type { RegistroAntecipacao } from '@/lib/financeiro-geral/schemas'
import { numBRL2 } from '@/lib/fmt'

// Formulário de uma antecipação (criar e editar no mesmo modal): conta, data, valor antecipado e valor
// líquido. O DESCONTO é exibido, derivado (antecipado − líquido) — NUNCA digitado. O valor é texto livre
// em pt-BR e só é normalizado no ENVIO (`validarFormulario` → `toNum` canônico, padrão da v6.2.1); mascarar
// no `onChange` impediria escrever "1.234,56". A validação daqui é uma DICA: a barreira é o banco.
//
// `key` do componente (no pai) muda entre criar e editar e a cada abertura: o `useState` com initializer só
// roda na montagem, e um modal reaproveitado entre itens manteria o estado do anterior.

export type EstadoForm =
  | { modo: 'criar' }
  | { modo: 'editar'; registro: RegistroAntecipacao }

interface Props {
  estado: EstadoForm
  contas: readonly { id: number; nome: string }[]
  hoje: string
  onFechar: () => void
  onSalvo: (mensagem: string) => void
}

/** 1234.5 → "1.234,50": o valor do registro volta ao campo no formato que o usuário digita. */
const paraCampo = (v: number) => numBRL2(v)

export default function FormAntecipacaoModal({ estado, contas, hoje, onFechar, onSalvo }: Props) {
  const editando = estado.modo === 'editar'
  const base = editando ? estado.registro : null

  const [contaId, setContaId] = useState(base ? String(base.conta_id) : '')
  const [data, setData] = useState(base?.data ?? hoje)
  const [antecipado, setAntecipado] = useState(base ? paraCampo(base.valor_antecipado) : '')
  const [liquido, setLiquido] = useState(base ? paraCampo(base.valor_liquido) : '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const desconto = descontoFormatado(antecipado, liquido)
  // Líquido legível acima do antecipado: o banco recusaria — avisa antes do clique.
  const a = lerValorDigitado(antecipado)
  const l = lerValorDigitado(liquido)
  const liquidoAcima = a.ok && l.ok && l.centavos > a.centavos
  const descontoOk = descontoEmCentavos(antecipado, liquido) !== null

  // Conta do registro que já não está na lista (conta desativada depois): continua escolhível na edição.
  const opcoes = base && !contas.some(c => c.id === base.conta_id)
    ? [{ id: base.conta_id, nome: base.conta }, ...contas]
    : contas

  async function salvar() {
    const v = validarFormulario({ contaId, data, valorAntecipado: antecipado, valorLiquido: liquido }, hoje)
    if (!v.ok) { setErro(v.erro); return }
    setErro(null)
    setSalvando(true)
    // A action pode LANÇAR (sessão expirada, permissão, rede): sem try/finally o botão ficaria preso em
    // "Salvando…". `onSalvo` fica fora do try — erro dele não é falha da action.
    let res: Awaited<ReturnType<typeof salvarAntecipacao>>
    try {
      res = await salvarAntecipacao({
        id: base ? base.id : null,
        contaId: v.entrada.contaId,
        data: v.entrada.data,
        valorAntecipado: v.entrada.valorAntecipado,
        valorLiquido: v.entrada.valorLiquido,
      })
    } catch (e) {
      setErro(mensagemDeFalhaDaAcao(e))
      return
    } finally {
      setSalvando(false)
    }
    if (!res.ok) { setErro(res.erro); return }
    onSalvo(res.mensagem)
  }

  const rodape = (
    <div>
      {/* Erro DENTRO do modal, junto do botão — erro fora da vista não é visto (v5.4.3). */}
      {erro && <FaixaMensagem tipo="erro" texto={erro} onFechar={() => setErro(null)} />}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="contorno" size="sm" onClick={onFechar} disabled={salvando}>Cancelar</Button>
        <Button variant="solido" size="sm" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Registrar antecipação'}
        </Button>
      </div>
    </div>
  )

  return (
    <ModalCentral
      titulo={editando ? 'Editar antecipação' : 'Registrar antecipação'}
      subtitulo="O desconto é calculado: valor antecipado menos valor líquido."
      rodape={rodape}
      onClose={onFechar}
    >
      <div className="grid grid-cols-2 gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Conta *</span>
          <Select value={contaId} onChange={e => setContaId(e.target.value)}>
            <option value="">Escolha…</option>
            {opcoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Data *</span>
          <Input type="date" value={data} min={DATA_PISO} max={hoje} onChange={e => setData(e.target.value)} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Valor antecipado (R$) *</span>
          <Input
            value={antecipado}
            onChange={e => setAntecipado(e.target.value)}
            inputMode="decimal"
            placeholder="Ex.: 10.000,00"
            autoComplete="off"
            className="tabular-nums"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-600">Valor líquido recebido (R$) *</span>
          <Input
            value={liquido}
            onChange={e => setLiquido(e.target.value)}
            inputMode="decimal"
            placeholder="Ex.: 9.700,00"
            autoComplete="off"
            className="tabular-nums"
          />
        </label>

        <div className="col-span-2 flex items-baseline justify-between rounded-lg bg-band-soft px-4 py-3">
          <span className="text-xs font-semibold text-zinc-600">Desconto (calculado)</span>
          <span className="text-sm font-semibold tabular-nums text-zinc-800">{descontoOk && desconto ? desconto : '—'}</span>
        </div>
        {liquidoAcima && (
          <p role="alert" className="col-span-2 -mt-1 text-xs text-danger">
            O valor líquido não pode passar do valor antecipado.
          </p>
        )}
      </div>
    </ModalCentral>
  )
}
