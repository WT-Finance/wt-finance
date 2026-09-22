'use client'

// Aviso forte de importação destrutiva — uniforme para todas as bases do admin.
// Cada importação SUBSTITUI TODA a base: apaga os registros atuais e carrega os novos.
//
// v6.0.0/M4: o `antes → depois` continua sendo o GATE HUMANO que existia desde sempre — é ele
// que pega o arquivo legítimo porém ERRADO (ex.: só um ano em vez de todos), que passa por
// todos os checksums porque é internamente coerente (anexo M4 §5). Nas cinco bases do contrato
// de ingestão, o servidor agora devolve bem mais do que antes (checksums, datas rejeitadas, Σ do
// arquivo, avisos não-bloqueantes) — `detalhes` é essa camada extra; ela não substitui o
// antes/depois, complementa. Diff por ano fica para quando `ingestao.baseline` existir (M6).

import { fmtBRL2 } from '@/lib/fmt'

function formatarNum(n: number): string {
  return n.toLocaleString('pt-BR')
}

export interface DetalhesConferencia {
  rejeitadasPorData: number
  paresNovos: number
  checksumsConferidos: number
  checksumsFalhos: number
  /** Σ do próprio arquivo (reais). */
  somaArquivo: number | null
  /** Diferença da soma contra a base atual (reais). NÃO é a Σ do arquivo — exibi-la com aquele
   *  rótulo fazia um recarregamento do mesmo arquivo anunciar "Σ do arquivo: R$ 0,00". */
  somaDiff: number | null
  avisos: readonly string[]
}

export function ModalConfirmacaoUpload({
  baseLabel,
  totalAntes,
  totalDepois,
  detalhes,
  onConfirmar,
  onCancelar,
}: {
  /** Nome legível da base (ex.: "Vendas por Produto"). */
  baseLabel:   string
  /** Quantos registros existem hoje na base (serão apagados). */
  totalAntes:  number
  /** Quantos registros serão carregados no lugar. */
  totalDepois: number
  /** Fluxo novo (cinco bases do contrato de ingestão): o que a CONFERÊNCIA do servidor
   *  devolveu. `undefined`/`null` no fluxo antigo (só Pessoas), que mostra só o antes/depois. */
  detalhes?: DetalhesConferencia | null
  onConfirmar: () => void
  onCancelar:  () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onCancelar} />
      <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-base font-semibold text-zinc-900 mb-2">Confirmar importação</h3>
        <p className="text-sm text-zinc-600 mb-4">
          Esta importação vai <span className="font-semibold">APAGAR</span> os{' '}
          <span className="font-medium">{formatarNum(totalAntes)}</span> registros atuais de{' '}
          <span className="font-medium">«{baseLabel}»</span> e carregar{' '}
          <span className="font-medium">{formatarNum(totalDepois)}</span> novos.
          Esta ação não pode ser desfeita.
        </p>

        {detalhes ? (
          <div className="mb-4 space-y-2.5 rounded-lg bg-zinc-50 p-3">
            <p className="text-xs text-zinc-600">
              Conferido pelo servidor: {formatarNum(detalhes.checksumsConferidos)} checksum(s) do
              arquivo batendo com o conteúdo
              {detalhes.checksumsFalhos > 0 ? (
                <span className="font-medium text-danger"> — {formatarNum(detalhes.checksumsFalhos)} falhando</span>
              ) : '.'}
              {detalhes.rejeitadasPorData > 0 && (
                <> {formatarNum(detalhes.rejeitadasPorData)} linha(s) com data fora da faixa aceita ficam sem data.</>
              )}
              {detalhes.paresNovos > 0 && (
                <> {formatarNum(detalhes.paresNovos)} par(es) novo(s) entram como &quot;Não classificadas&quot;.</>
              )}
            </p>
            {detalhes.somaArquivo !== null && (
              <p className="text-xs text-zinc-600">
                Σ do arquivo: <span className="font-medium">{fmtBRL2(detalhes.somaArquivo)}</span>
                {detalhes.somaDiff !== null && (
                  <> · diferença contra a base atual: <span className="font-medium">{fmtBRL2(detalhes.somaDiff)}</span></>
                )}
              </p>
            )}
            {detalhes.avisos.length > 0 && (
              <div className="rounded-md bg-warning-bg px-2.5 py-2">
                <ul className="space-y-1">
                  {detalhes.avisos.map((aviso, i) => (
                    <li key={i} className="text-2xs text-warning-deep">{aviso}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancelar}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            className="px-4 py-2 text-sm rounded-lg bg-action-primary text-action-primary-fg hover:opacity-90 transition-colors font-medium"
          >
            Confirmar importação
          </button>
        </div>
      </div>
    </div>
  )
}
