'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import Button from '@/components/ui/button'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { salvarAntecipacao } from '@/app/financeiro/geral/actions'
import { DATA_PISO, descontoFormatado, mensagemDeFalhaDaAcao, validarFormulario } from '@/lib/financeiro-geral/gestao'
import { mascaraMoeda } from '@/lib/fmt'

// Linha EDITÁVEL de "Novo registro" (v6.5.0), logo abaixo do cabeçalho da lista — mesmo comportamento da
// "Nova linha" da Base de dados do Gerencial (campos inline, Salvar/✕ na coluna de ações). Salva pela MESMA
// action do formulário (`salvarAntecipacao`, com `id: null`) e valida com o MESMO `validarFormulario`; a barreira
// real continua sendo a RPC. Erro de validação/da action aparece numa faixa logo abaixo da linha, que segue
// aberta; sucesso entrega a mensagem ao pai (`onSalvo`), que fecha a linha e rebusca a lista.
// Valor: máscara de moeda ao vivo (`mascaraMoeda`, a do Gerencial) — o texto "R$ 1.234,56" é lido por
// `lerValorDigitado` na hora de salvar. O DESCONTO é só leitura (antecipado − líquido). Enter salva, Esc cancela.

interface Props {
  contas: readonly { id: number; nome: string }[]
  hoje: string
  onCancelar: () => void
  onSalvo: (mensagem: string) => void
}

// Tela de plataforma é NEUTRA (ui-design-system): nada de `--brand`; foco via `foco-neutro`.
const CAMPO = 'foco-neutro w-full rounded border border-zinc-200 bg-white px-1 py-0.5 text-xs disabled:opacity-50'
const CEL = 'px-2 py-1 border-b border-zinc-300'
/** Colunas de valor: mesmo `px-5` da lista (painel), para os campos ficarem alinhados com os valores abaixo. */
const CEL_VALOR = 'px-5 py-1 border-b border-zinc-300'

export default function AntecipacoesLinhaNova({ contas, hoje, onCancelar, onSalvo }: Props) {
  const [contaId, setContaId] = useState('')
  const [data, setData] = useState(hoje)
  const [antecipado, setAntecipado] = useState('')
  const [liquido, setLiquido] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Trava anti-duplo-envio SÍNCRONA: o estado só vale no próximo render, e Enter repetido passaria entre os dois.
  const emVoo = useRef(false)

  async function salvar() {
    if (emVoo.current) return
    const v = validarFormulario({ contaId, data, valorAntecipado: antecipado, valorLiquido: liquido }, hoje)
    if (!v.ok) { setErro(v.erro); return }
    setErro(null)
    emVoo.current = true
    setSalvando(true)
    // A action pode LANÇAR (sessão expirada, permissão, rede): sem try/finally a linha ficaria presa em
    // "Salvando…". `onSalvo` fica fora do try — erro dele não é falha da action.
    let res: Awaited<ReturnType<typeof salvarAntecipacao>>
    try {
      res = await salvarAntecipacao({
        id: null,
        contaId: v.entrada.contaId,
        data: v.entrada.data,
        valorAntecipado: v.entrada.valorAntecipado,
        valorLiquido: v.entrada.valorLiquido,
      })
    } catch (e) {
      setErro(mensagemDeFalhaDaAcao(e))
      return
    } finally {
      emVoo.current = false
      setSalvando(false)
    }
    if (!res.ok) { setErro(res.erro); return }
    onSalvo(res.mensagem)
  }

  // Enter salva e Esc cancela, vindo de qualquer campo da linha; Enter num botão/select mantém o gesto nativo.
  function aoTeclar(e: KeyboardEvent<HTMLTableRowElement>) {
    const alvo = e.target as HTMLElement
    // stopPropagation SEMPRE: o Esc do modal ("overlay-stack", no document) fecharia o registro inteiro junto.
    // Com a action em voo o Esc não cancela: a linha sumiria com o registro sendo criado.
    if (e.key === 'Escape') { e.stopPropagation(); if (!emVoo.current) onCancelar(); return }
    if (e.key === 'Enter' && alvo.tagName === 'INPUT') { e.preventDefault(); void salvar() }
  }

  return (
    <>
      <tr className="bg-band-soft" onKeyDown={aoTeclar}>
        <td className={CEL}>
          <input
            type="date"
            aria-label="Data da antecipação"
            value={data}
            min={DATA_PISO}
            max={hoje}
            autoFocus
            disabled={salvando}
            onChange={e => setData(e.target.value)}
            className={CAMPO}
          />
        </td>
        <td className={CEL}>
          <select aria-label="Conta" value={contaId} disabled={salvando} onChange={e => setContaId(e.target.value)} className={CAMPO}>
            <option value="">Conta…</option>
            {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </td>
        <td className={CEL_VALOR}>
          <input
            type="text"
            inputMode="numeric"
            aria-label="Valor antecipado"
            placeholder="R$ 0,00"
            autoComplete="off"
            value={antecipado}
            disabled={salvando}
            onChange={e => setAntecipado(mascaraMoeda(e.target.value).display)}
            className={`${CAMPO} text-right tabular-nums`}
          />
        </td>
        <td className={CEL_VALOR}>
          <input
            type="text"
            inputMode="numeric"
            aria-label="Valor líquido recebido"
            placeholder="R$ 0,00"
            autoComplete="off"
            value={liquido}
            disabled={salvando}
            onChange={e => setLiquido(mascaraMoeda(e.target.value).display)}
            className={`${CAMPO} text-right tabular-nums`}
          />
        </td>
        <td className={`${CEL_VALOR} text-right text-xs tabular-nums text-zinc-500`}>
          {descontoFormatado(antecipado, liquido) ?? '—'}
        </td>
        <td className={CEL}>
          <div className="flex justify-end gap-1">
            <Button variant="solido" size="sm" onClick={() => void salvar()} disabled={salvando} className="px-2.5! py-1! text-xs!">
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
            <Button variant="contorno" size="sm" onClick={onCancelar} disabled={salvando} aria-label="Cancelar novo registro" title="Cancelar" className="px-2! py-1! text-xs!">
              ✕
            </Button>
          </div>
        </td>
      </tr>
      {erro && (
        <tr>
          <td colSpan={6} className="px-2 pt-2">
            <FaixaMensagem tipo="erro" texto={erro} onFechar={() => setErro(null)} />
          </td>
        </tr>
      )}
    </>
  )
}
