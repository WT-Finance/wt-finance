'use client'

// Aviso forte de importação destrutiva — uniforme para todas as bases do admin.
// Cada importação SUBSTITUI TODA a base: apaga os registros atuais e carrega os novos.

function formatarNum(n: number): string {
  return n.toLocaleString('pt-BR')
}

export function ModalConfirmacaoUpload({
  baseLabel,
  totalAntes,
  totalDepois,
  onConfirmar,
  onCancelar,
}: {
  /** Nome legível da base (ex.: "Vendas por Produto"). */
  baseLabel:   string
  /** Quantos registros existem hoje na base (serão apagados). */
  totalAntes:  number
  /** Quantos registros serão carregados no lugar. */
  totalDepois: number
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
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancelar}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
          >
            Confirmar importação
          </button>
        </div>
      </div>
    </div>
  )
}
