'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2, Undo2 } from 'lucide-react'
import ListDrawer from '@/components/shared/list-drawer'
import Button from '@/components/ui/button'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import {
  desfazerAntecipacao, excluirAntecipacao, historicoAntecipacoes, listarAntecipacoes,
  type ResultadoLeitura,
} from '@/app/financeiro/geral/actions'
import { mensagemDeFalhaDaAcao, podeDesfazerEntrada, registroDaEntrada, rotuloOperacao } from '@/lib/financeiro-geral/gestao'
import type { EntradaHistorico, ListaAntecipacoes, RegistroAntecipacao } from '@/lib/financeiro-geral/schemas'
import { fmtBRL2, fmtDataHoraSP, fmtDate } from '@/lib/fmt'
import ConfirmarAcaoModal from './confirmar-acao-modal'
import FormAntecipacaoModal, { type EstadoForm } from './form-antecipacao-modal'

// Painel de registro de antecipações (v6.4.0) — só abre para quem tem 'financeiro/geral/gestao' (a
// seção nem renderiza o botão sem a área; as actions e as RPCs checam de novo). Drawer com a lista
// (editar, excluir com confirmação), o formulário (modal sobre o drawer) e o histórico com "Desfazer".
//
// O dado vem das SERVER ACTIONS a cada abertura e a cada mutação (`versao`): o painel não guarda cópia
// que envelheça — depois de salvar/excluir/desfazer ele rebusca E faz `router.refresh()` para a seção
// de Antecipações (e Custos, que contém o custo de antecipação) refletirem o novo número.

interface Props {
  hoje: string
  onFechar: () => void
}

interface Carga {
  versao: number
  lista: ResultadoLeitura<ListaAntecipacoes>
  historico: ResultadoLeitura<EntradaHistorico[]>
}

type Confirmacao =
  | { tipo: 'excluir'; registro: RegistroAntecipacao }
  | { tipo: 'desfazer'; entrada: EntradaHistorico }

function descreverRegistro(r: NonNullable<ReturnType<typeof registroDaEntrada>>): string {
  return `${r.conta} · ${fmtDate(r.data)} · ${fmtBRL2(r.valor_antecipado)} (líquido ${fmtBRL2(r.valor_liquido)})`
}

/** " — Asaas · 05/10/2026 · R$ …" do registro que a entrada descreve; vazio se a entrada não traz registro. */
function textoDoRegistro(e: EntradaHistorico): string {
  const r = registroDaEntrada(e)
  return r ? ` — ${descreverRegistro(r)}` : ''
}

export default function PainelAntecipacoes({ hoje, onFechar }: Props) {
  const router = useRouter()
  const [versao, setVersao] = useState(0)
  const [carga, setCarga] = useState<Carga | null>(null)
  const [form, setForm] = useState<EstadoForm | null>(null)
  const [geracao, setGeracao] = useState(0)
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)

  // `loading` DERIVADO da chave "última carregada" (react-padroes §1a): nada de setState síncrono no efeito.
  const carregando = carga === null || carga.versao !== versao

  useEffect(() => {
    let cancelado = false
    void (async () => {
      try {
        const [lista, historico] = await Promise.all([listarAntecipacoes(), historicoAntecipacoes(20)])
        if (!cancelado) setCarga({ versao, lista, historico })
      } catch (e) {
        // A action pode LANÇAR (sessão expirada, permissão, rede): vira erro na tela, não "Carregando…"
        // eterno nem rejeição não tratada.
        if (cancelado) return
        const erro = mensagemDeFalhaDaAcao(e)
        setCarga({ versao, lista: { ok: false, erro }, historico: { ok: false, erro } })
      }
    })()
    return () => { cancelado = true }
  }, [versao])

  /** Depois de qualquer mutação: rebusca o painel e atualiza a página por trás. */
  function mutado(texto: string) {
    setMensagem(texto)
    setForm(null)
    setConfirmacao(null)
    setVersao(v => v + 1)
    router.refresh()
  }

  const lista = carga?.lista.ok ? carga.lista.dados : null
  const registros = lista?.registros ?? []
  const contas = lista?.contas ?? []

  return (
    <>
      <ListDrawer
        titulo="Antecipações"
        subtitulo="Registre, edite ou exclua. Tudo fica no histórico e dá para desfazer."
        onClose={onFechar}
      >
        {mensagem && <FaixaMensagem tipo="sucesso" texto={mensagem} onFechar={() => setMensagem(null)} />}

        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-text-primary">Registros</h3>
          <button
            type="button"
            className={`${PILL} ${PILL_PRIMARIA}`}
            style={PILL_PRIMARIA_STYLE}
            disabled={carregando || lista === null}
            onClick={() => { setGeracao(g => g + 1); setForm({ modo: 'criar' }) }}
          >
            <Plus size={13} aria-hidden /> Nova antecipação
          </button>
        </div>

        {carga?.lista.ok === false && <ErroCarregamento mensagem={carga.lista.erro} />}
        {carregando && carga === null && <p className="py-6 text-center text-sm text-[var(--text-muted)]">Carregando…</p>}

        {lista && (
          registros.length === 0
            ? <p className="py-6 text-center text-sm text-[var(--text-muted)]">Nenhuma antecipação registrada.</p>
            : (
              <div className={carregando ? 'opacity-60' : ''}>
                <table className="w-full table-fixed border-separate border-spacing-0" aria-label="Antecipações registradas">
                  <colgroup>
                    <col style={{ width: 84 }} />
                    <col style={{ width: 72 }} />
                    <col />
                    <col />
                    <col />
                    <col style={{ width: 76 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      {['Data', 'Conta', 'Antecipado', 'Líquido', 'Desconto'].map((h, i) => (
                        <th key={h} scope="col" className={`px-2 py-2 text-2xs font-medium text-[var(--text-muted)] border-b border-zinc-100 ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                      ))}
                      <th scope="col" className="border-b border-zinc-100"><span className="sr-only">Ações</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {registros.map(r => (
                      <tr key={r.id}>
                        <td className="px-2 py-2 text-xs text-zinc-700 border-b border-zinc-50 tabular-nums">{fmtDate(r.data)}</td>
                        <td className="px-2 py-2 text-xs text-zinc-700 border-b border-zinc-50 truncate" title={r.conta}>{r.conta}</td>
                        <td className="px-2 py-2 text-xs text-zinc-700 border-b border-zinc-50 text-right tabular-nums">{fmtBRL2(r.valor_antecipado)}</td>
                        <td className="px-2 py-2 text-xs text-zinc-700 border-b border-zinc-50 text-right tabular-nums">{fmtBRL2(r.valor_liquido)}</td>
                        <td className="px-2 py-2 text-xs text-zinc-700 border-b border-zinc-50 text-right tabular-nums">{fmtBRL2(r.desconto)}</td>
                        <td className="px-1 py-1 border-b border-zinc-50">
                          <div className="flex justify-end gap-0.5">
                            <Button variant="icone" aria-label={`Editar antecipação de ${fmtDate(r.data)} (${r.conta})`} title="Editar" onClick={() => setForm({ modo: 'editar', registro: r })}>
                              <Pencil size={14} />
                            </Button>
                            <Button variant="icone" tone="perigo" aria-label={`Excluir antecipação de ${fmtDate(r.data)} (${r.conta})`} title="Excluir" onClick={() => setConfirmacao({ tipo: 'excluir', registro: r })}>
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        )}

        <h3 className="mb-2 mt-8 text-sm font-semibold text-text-primary">Histórico recente</h3>
        {carga?.historico.ok === false && <ErroCarregamento mensagem={carga.historico.erro} />}
        {carga?.historico.ok && (
          carga.historico.dados.length === 0
            ? <p className="py-3 text-sm text-[var(--text-muted)]">Nada no histórico ainda.</p>
            : (
              <ul className={`divide-y divide-zinc-100 ${carregando ? 'opacity-60' : ''}`}>
                {carga.historico.dados.map(e => {
                  return (
                    <li key={e.diario_id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0 text-xs">
                        <p className="font-medium text-zinc-800">
                          {rotuloOperacao(e)}{textoDoRegistro(e)}
                        </p>
                        <p className="mt-0.5 text-[var(--text-subtle)]">
                          {e.usuario_nome ?? 'Alguém'} · {fmtDataHoraSP(e.quando)}
                        </p>
                      </div>
                      {podeDesfazerEntrada(e) && (
                        <button
                          type="button"
                          onClick={() => setConfirmacao({ tipo: 'desfazer', entrada: e })}
                          className={`${PILL} ${PILL_NEUTRO} shrink-0`}
                        >
                          <Undo2 size={12} aria-hidden /> Desfazer
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )
        )}
      </ListDrawer>

      {form && (
        <FormAntecipacaoModal
          key={form.modo === 'editar' ? `editar-${form.registro.id}` : `criar-${geracao}`}
          estado={form}
          contas={contas}
          hoje={hoje}
          onFechar={() => setForm(null)}
          onSalvo={mutado}
        />
      )}

      {confirmacao?.tipo === 'excluir' && (
        <ConfirmarAcaoModal
          titulo="Excluir antecipação"
          perigo
          rotuloConfirmar="Excluir"
          mensagem={<>Excluir a antecipação de <strong>{fmtBRL2(confirmacao.registro.valor_antecipado)}</strong> da conta <strong>{confirmacao.registro.conta}</strong> em {fmtDate(confirmacao.registro.data)}? A exclusão fica no histórico e dá para desfazer.</>}
          onConfirmar={() => excluirAntecipacao(confirmacao.registro.id)}
          onFechar={() => setConfirmacao(null)}
          onConcluido={mutado}
        />
      )}

      {confirmacao?.tipo === 'desfazer' && (
        <ConfirmarAcaoModal
          titulo="Desfazer alteração"
          rotuloConfirmar="Desfazer"
          mensagem={<>Desfazer: <strong>{rotuloOperacao(confirmacao.entrada).toLowerCase()}</strong>{textoDoRegistro(confirmacao.entrada)}? O registro volta ao estado de antes dessa alteração.</>}
          onConfirmar={() => desfazerAntecipacao(confirmacao.entrada.diario_id)}
          onFechar={() => setConfirmacao(null)}
          onConcluido={mutado}
        />
      )}
    </>
  )
}
