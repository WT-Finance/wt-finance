'use client'

import { useState } from 'react'
import { ShieldCheck, ShieldAlert } from 'lucide-react'
import { Card } from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import Button from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import ConfirmModal from '@/components/shared/confirm-modal'
import { Relativo } from './relativo'
import { definirVigiaAction, definirExpectativaAction } from '@/app/admin/ingestao/actions'
import { rotuloProcesso, type IngestaoExpectativa } from './tipos'
import { ROTULO_BASE, ehBaseIngestao } from '@/lib/ingestao/bases'

// Vigia + Expectativas (anexo v6.0.0/M6 §4/§7) — a tela responde "o vigia está de pé?" logo
// depois de "há algo errado agora?" (a faixa de alarmes abertos, que fica ACIMA deste painel na
// página). "Se o vigia parar, ninguém recebe e-mail" É O LIMITE ESTRUTURAL que o anexo pede
// escrito em linguagem que o operador entenda — não é rodapé, é o texto ao lado do próprio
// toggle.

interface Props {
  vigiaCronAtivo: boolean | null
  vigiaUltimaVerificacao: string | null
  expectativas: IngestaoExpectativa[]
  /** Recarrega o painel do servidor após qualquer ação bem-sucedida (o efeito REAL da RPC, não
   *  o que a UI supõe ter feito — anexo §7). */
  onAtualizado: () => Promise<void>
  onMensagem: (mensagem: string) => void
}

/** `interval` do Postgres chega como texto ("00:45:00", "3 days"...) — mostrado como veio, sem
 *  reformatar (não vale a pena um parser de interval só para um rótulo administrativo). */
/** `interval` do Postgres chega como texto ("00:45:00", "30:00:00", "35 days", "1 day 02:00:00").
 *  Converte para pt-BR legível; formato que não casar sai CRU (nunca some nem vira zero). */
function formatarTolerancia(tolerancia: string | null): string {
  if (!tolerancia) return 'sem tolerância definida'
  const dias = Number(/(\d+)\s+days?/.exec(tolerancia)?.[1] ?? 0)
  const hms = /(\d+):(\d{2}):(\d{2})/.exec(tolerancia)
  if (!dias && !hms) return tolerancia
  const minutos = dias * 24 * 60 + (hms ? Number(hms[1]) * 60 + Number(hms[2]) : 0)
  if (minutos % (24 * 60) === 0) return `${minutos / (24 * 60)} dia(s)`
  if (minutos % 60 === 0) return `${minutos / 60} hora(s)`
  return `${minutos} minuto(s)`
}

/** Rótulo do alvo — o nome que o operador conhece, não a chave técnica. */
function rotuloAlvo(e: IngestaoExpectativa): string {
  if (e.tipo === 'base') return ehBaseIngestao(e.alvo) ? ROTULO_BASE[e.alvo] : e.alvo
  return rotuloProcesso(e.alvo)
}

export function VigiaPainel({ vigiaCronAtivo, vigiaUltimaVerificacao, expectativas, onAtualizado, onMensagem }: Props) {
  const [confirmarVigia, setConfirmarVigia] = useState<boolean | null>(null)
  const [erroVigia, setErroVigia] = useState<string | null>(null)
  const ligado = vigiaCronAtivo === true

  async function aplicarVigia(ativo: boolean) {
    setErroVigia(null)
    const res = await definirVigiaAction(ativo)
    if (!res.ok) { setErroVigia(res.erro); return }
    onMensagem(res.ativo ? 'Vigia ligado — ele passa a rodar a cada 15 minutos.' : 'Vigia desligado.')
    await onAtualizado()
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {ligado
              ? <ShieldCheck size={16} className="text-success shrink-0" />
              : <ShieldAlert size={16} className="text-warning-deep shrink-0" />}
            <h2 className="text-sm font-semibold text-zinc-900">Vigia da ingestão</h2>
            <Badge variant={ligado ? 'success' : 'neutro'}>{ligado ? 'Ligado' : 'Desligado'}</Badge>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Última verificação:{' '}
            {vigiaUltimaVerificacao
              ? <Relativo iso={vigiaUltimaVerificacao} />
              : 'nunca verificou ainda'}
          </p>
          <p className="mt-2 max-w-2xl text-xs text-zinc-500">
            {ligado
              ? 'A cada 15 minutos o vigia confere se algum processo agendado ou carga esperada está atrasado, e manda um e-mail quando abre um alarme novo.'
              : 'Enquanto o vigia estiver desligado, NINGUÉM recebe e-mail se um processo agendado parar de rodar ou uma carga esperada não chegar — os alarmes de carga (checksum, ano fechado, par novo) continuam funcionando normalmente, só os dois de baixo (processo sem resultado, carga esperada) dependem do vigia.'}
          </p>
          {erroVigia && <p className="mt-2 text-xs font-medium text-danger">{erroVigia}</p>}
        </div>
        <Button variant="contorno" size="sm" className="shrink-0" onClick={() => setConfirmarVigia(!ligado)}>
          {ligado ? 'Desligar vigia' : 'Ligar vigia'}
        </Button>
      </div>

      {expectativas.length > 0 && (
        <div className="mt-5 border-t border-zinc-100 pt-4">
          <h3 className="mb-2 text-xs font-medium text-zinc-500">
            Expectativas de cadência (o vigia só alarma &ldquo;sem resultado&rdquo;/&ldquo;não chegou&rdquo; para o que estiver ativo aqui)
          </h3>
          <ul className="space-y-2">
            {expectativas.map(exp => (
              <LinhaExpectativa key={exp.alvo} expectativa={exp} onAtualizado={onAtualizado} onMensagem={onMensagem} />
            ))}
          </ul>
        </div>
      )}

      {confirmarVigia !== null && (
        <ConfirmModal
          titulo={confirmarVigia ? 'Ligar o vigia' : 'Desligar o vigia'}
          perigo={!confirmarVigia}
          confirmarLabel={confirmarVigia ? 'Ligar' : 'Desligar'}
          mensagem={
            confirmarVigia
              ? 'A partir de agora, o vigia roda a cada 15 minutos e pode mandar e-mail de alarme quando um processo com expectativa ativa ficar sem resultado dentro da tolerância.'
              : 'Ninguém mais vai ser avisado por e-mail se um processo parar de rodar ou uma carga esperada não chegar. Os alarmes de carga (checksum, ano fechado, par novo) continuam funcionando — só os dois que dependem do vigia param.'
          }
          onConfirmar={() => aplicarVigia(confirmarVigia)}
          onFechar={() => setConfirmarVigia(null)}
        />
      )}
    </Card>
  )
}

function LinhaExpectativa({
  expectativa, onAtualizado, onMensagem,
}: {
  expectativa: IngestaoExpectativa
  onAtualizado: () => Promise<void>
  onMensagem: (mensagem: string) => void
}) {
  const [tolerancia, setTolerancia] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const precisaTolerancia = !expectativa.ativo && !expectativa.tolerancia

  async function ativar() {
    setErro(null)
    setConfirmando(true)
    const res = await definirExpectativaAction(expectativa.alvo, true, tolerancia || undefined)
    setConfirmando(false)
    if (!res.ok) { setErro(res.erro); return }
    onMensagem(`Expectativa de "${rotuloAlvo(expectativa)}" ativada.`)
    setTolerancia('')
    await onAtualizado()
  }

  async function desativar() {
    setErro(null)
    setConfirmando(true)
    const res = await definirExpectativaAction(expectativa.alvo, false)
    setConfirmando(false)
    if (!res.ok) { setErro(res.erro); return }
    onMensagem(`Expectativa de "${rotuloAlvo(expectativa)}" desativada.`)
    await onAtualizado()
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs">
      <span className="min-w-0 flex-1">
        <span className="font-medium text-zinc-700">{rotuloAlvo(expectativa)}</span>
        <span className="text-zinc-400"> · {expectativa.tipo === 'base' ? 'carga' : 'processo'} · {formatarTolerancia(expectativa.tolerancia)}</span>
      </span>
      <Badge variant={expectativa.ativo ? 'success' : 'neutro'}>{expectativa.ativo ? 'Ativa' : 'Inativa'}</Badge>

      {expectativa.ativo ? (
        <Button variant="ghost" onClick={desativar} disabled={confirmando}>Desativar</Button>
      ) : precisaTolerancia ? (
        <span className="flex items-center gap-1.5">
          <Input
            variant="compacto"
            className="w-40"
            placeholder='ex.: "45 minutes"'
            value={tolerancia}
            onChange={e => setTolerancia(e.target.value)}
            aria-label={`Tolerância para ${rotuloAlvo(expectativa)}`}
          />
          <Button variant="ghost" onClick={ativar} disabled={confirmando || tolerancia.trim() === ''}>Ativar</Button>
        </span>
      ) : (
        <Button variant="ghost" onClick={ativar} disabled={confirmando}>Ativar</Button>
      )}

      {erro && <span className="w-full text-danger">{erro}</span>}
    </li>
  )
}
