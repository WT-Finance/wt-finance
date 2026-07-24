'use client'

import { useState } from 'react'
import { mascaraMoeda, numBRL2 } from '@/lib/fmt'

// Input controlado de moeda com máscara pt-BR em tempo real (v5.2.1/M1). Encapsula o ciclo
// "clique-para-editar" das duas superfícies de saldo do Fluxo de Caixa (cards do Gerencial e
// drill do projetado), que antes duplicavam um <input> texto-livre + editStr + parse-no-blur.
// A máscara vem do helper único `mascaraMoeda` (fmt): dígitos crus → centavos → "R$ 1.234,56"
// a cada tecla; `inputMode="numeric"` para o teclado mobile; colar funciona (não-dígitos caem).
// O componente NÃO decide salvar/comparar — reporta o número parseado em `onCommit` (Enter/blur)
// e `onCancel` (Escape); a célula chamadora mantém seu estado de edição/otimista.

export function InputMoeda({
  valorInicial,
  permiteVazio,
  onCommit,
  onCancel,
  className,
  placeholder,
}: {
  valorInicial: number | null
  /** Campo vazio → `null` (ex.: "sem limite"). Sem isso, vazio vira 0. */
  permiteVazio?: boolean
  onCommit: (v: number | null) => void
  onCancel: () => void
  className?: string
  placeholder?: string
}) {
  const [texto, setTexto] = useState(() =>
    valorInicial == null ? '' : `${valorInicial < 0 ? '-' : ''}R$ ${numBRL2(Math.abs(valorInicial))}`,
  )

  const commit = () => {
    const { valor } = mascaraMoeda(texto)
    onCommit(valor == null && !permiteVazio ? 0 : valor)
  }

  return (
    <input
      autoFocus
      inputMode="numeric"
      value={texto}
      placeholder={placeholder}
      onChange={e => setTexto(mascaraMoeda(e.target.value).display)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') onCancel()
      }}
      className={className}
    />
  )
}
