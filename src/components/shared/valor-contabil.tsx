import { numBRL2 } from '@/lib/fmt'

// Formato CONTÁBIL de moeda (convenção do design system, v4.22): "R$" ancorado à
// ESQUERDA da célula e o número alinhado à DIREITA (extremidades opostas), com centavos
// e dígitos tabulares (alinhamento vertical entre linhas). Padrão de planilha financeira.
//
// Uso: dentro de uma célula/td. O fundo (faixa de cor) fica no container; aqui só o conteúdo.
// `className` colore o NÚMERO quando preciso (ex.: Resultado <0 em --danger); o "R$" é sempre
// discreto (--text-subtle). Reaproveita numBRL2 (não reimplementar o flex inline nem hardcodar cor).
export function ValorContabil({ valor, className }: { valor: number; className?: string }) {
  return (
    <span className="flex justify-between gap-2 tabular-nums">
      <span className="text-[var(--text-subtle)]">R$</span>
      <span className={className}>{numBRL2(valor)}</span>
    </span>
  )
}
