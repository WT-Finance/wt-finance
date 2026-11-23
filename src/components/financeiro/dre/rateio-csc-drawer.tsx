'use client'

import { Fragment, useState, useTransition } from 'react'
import ListDrawer from '@/components/shared/list-drawer'
import Button from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import {
  CENTROS_RATEIO, PCTS_VAZIO, ROTULO_RATEIO, categoriaTravada, chaveCategoria, chaveGrupo, estadoInicial,
  lerPct, montarItens,
  type CentroRateio, type EstadoRateio, type GrupoRateio, type ItemRateio, type Pcts, type RateioCsc,
} from '@/lib/dre-centro/rateio'

// ── Drawer do RATEIO DO CSC (v6.5.1, 0308) ───────────────────────────────────
// Um % por GRUPO (bloco-folha da DRE) ou por CATEGORIA, para Trips, Weddings e Corporativo; Σ = 100 por linha.
// Grupo preenchido TRAVA as categorias dele (os campos delas mostram o % do grupo, desabilitados). Sem centro
// fica de fora do rateio. Salvar SUBSTITUI o conjunto inteiro (salvar_dre_rateio_csc) — quem vê a DRE edita.

const SUBTITULO =
  'Reparte o que caiu no CSC entre Trips, Weddings e Corporativo. Sem centro fica de fora. ' +
  'Preencher o grupo trava as categorias dele. Linha em branco = sem rateio (o valor fica no CSC).'

export interface RateioCscDrawerProps {
  grupos: GrupoRateio[]
  /** O que está salvo; null = a leitura falhou (o drawer avisa e não deixa salvar por cima). */
  salvo: RateioCsc | null
  onSalvar: (itens: ItemRateio[]) => Promise<{ ok: boolean; erro?: string }>
  onClose: () => void
}

const somaDe = (p: Pcts | undefined) => {
  if (!p) return null
  const v = CENTROS_RATEIO.map(c => lerPct(p[c]))
  if (v.every(x => x === null)) return null
  return v.reduce<number>((s, x) => s + (x == null || Number.isNaN(x) ? 0 : x), 0)
}
const fmtSoma = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`)

function LinhaRateio({
  rotulo, nivel, valor, travadaCom, erro, onMudar,
}: {
  rotulo: string
  nivel: 'grupo' | 'categoria'
  valor: Pcts | undefined
  /** Categoria travada: mostra o % do grupo, desabilitado. */
  travadaCom?: Pcts
  erro?: string
  onMudar: (c: CentroRateio, v: string) => void
}) {
  const exibido = travadaCom ?? valor ?? PCTS_VAZIO
  const soma = somaDe(travadaCom ?? valor)
  const id = `${nivel}-${rotulo}`
  return (
    <>
      <tr className={nivel === 'grupo' ? 'bg-band-soft' : ''}>
        <td className={`py-1.5 pr-3 text-[13px] ${nivel === 'grupo' ? 'pl-2 font-semibold text-text-primary' : 'pl-7 text-text-secondary'}`}>
          {rotulo}
          {travadaCom && <span className="ml-1.5 text-[11px] text-text-muted">(pelo grupo)</span>}
        </td>
        {CENTROS_RATEIO.map(c => (
          <td key={c} className="px-1 py-1.5">
            <Input
              variant="compacto"
              inputMode="decimal"
              aria-label={`${rotulo} — % ${ROTULO_RATEIO[c]}`}
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? `${id}-erro` : undefined}
              disabled={travadaCom != null}
              value={exibido[c]}
              onChange={e => onMudar(c, e.target.value)}
              className="w-20 text-right tabular-nums disabled:opacity-60"
            />
          </td>
        ))}
        <td className={`pl-2 py-1.5 text-right text-[12px] tabular-nums ${erro ? 'text-danger' : 'text-text-muted'}`}>{fmtSoma(soma)}</td>
      </tr>
      {erro && (
        <tr>
          <td colSpan={5} id={`${id}-erro`} className="pb-1.5 pl-7 text-[12px] text-danger">{erro}</td>
        </tr>
      )}
    </>
  )
}

export default function RateioCscDrawer({ grupos, salvo, onSalvar, onClose }: RateioCscDrawerProps) {
  const [estado, setEstado] = useState<EstadoRateio>(() => estadoInicial(salvo))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()

  const orfaos = (salvo?.itens ?? []).filter(i => (i as { ativo?: unknown }).ativo === false)

  const mudar = (k: string) => (c: CentroRateio, v: string) => {
    setEstado(prev => ({ ...prev, [k]: { ...(prev[k] ?? PCTS_VAZIO), [c]: v } }))
    setErros(prev => {
      if (!(k in prev)) return prev
      const resto = { ...prev }
      delete resto[k]
      return resto
    })
  }

  function salvar() {
    setErroGeral(null)
    const r = montarItens(estado, grupos)
    setErros(r.erros)
    if (Object.keys(r.erros).length > 0) {
      setErroGeral('Corrija as linhas marcadas — cada uma precisa somar 100%.')
      return
    }
    iniciar(async () => {
      const res = await onSalvar(r.itens)
      if (res.ok) onClose()
      else setErroGeral(res.erro ?? 'Não foi possível salvar o rateio.')
    })
  }

  return (
    <ListDrawer titulo="Rateio do CSC" subtitulo={SUBTITULO} onClose={onClose}>
      {salvo == null && (
        <p className="mb-4 rounded-md border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
          Não foi possível ler o rateio salvo. Recarregue a página antes de editar — salvar agora apagaria o que existe.
        </p>
      )}
      {orfaos.length > 0 && (
        <p className="mb-4 rounded-md border border-wt-border bg-band-soft px-3 py-2 text-sm text-text-secondary">
          {orfaos.length === 1 ? 'Há 1 percentual salvo' : `Há ${orfaos.length} percentuais salvos`} para grupo ou categoria
          que não está mais na DRE (o editor da estrutura mudou). Ele não vale e sai quando você salvar.
        </p>
      )}

      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr className="text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary">
            <th className="pb-2 pl-2 text-left">Grupo / categoria</th>
            {CENTROS_RATEIO.map(c => <th key={c} className="px-1 pb-2 text-right">{ROTULO_RATEIO[c]} %</th>)}
            <th className="pb-2 pl-2 text-right">Soma</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map(g => {
            const kg = chaveGrupo(g.chave)
            const travada = categoriaTravada(estado, g.chave)
            return (
              <Fragment key={g.chave}>
                <LinhaRateio rotulo={g.rotulo} nivel="grupo" valor={estado[kg]} erro={erros[kg]} onMudar={mudar(kg)} />
                {g.categorias.map(c => {
                  const kc = chaveCategoria(c.categoria_id)
                  return (
                    <LinhaRateio
                      key={kc}
                      rotulo={c.rotulo}
                      nivel="categoria"
                      valor={estado[kc]}
                      travadaCom={travada ? (estado[kg] ?? PCTS_VAZIO) : undefined}
                      erro={travada ? undefined : erros[kc]}
                      onMudar={mudar(kc)}
                    />
                  )
                })}
              </Fragment>
            )
          })}
        </tbody>
      </table>

      <div className="sticky bottom-0 -mx-6 mt-4 flex items-center justify-end gap-2 border-t border-zinc-100 bg-white px-6 py-3">
        {erroGeral && <p role="alert" className="mr-auto text-sm text-danger">{erroGeral}</p>}
        <Button variant="contorno" size="sm" onClick={onClose} disabled={salvando}>Cancelar</Button>
        <Button variant="solido" size="sm" onClick={salvar} disabled={salvando || salvo == null}>
          {salvando ? 'Salvando…' : 'Salvar rateio'}
        </Button>
      </div>
    </ListDrawer>
  )
}

