import type { InputHTMLAttributes } from 'react'
import { Input } from '@/components/ui/field'

// v6.5.3 — campo de data de Solicitações (Data limite + campos `data` dos tipos).
//
// O Safari do macOS mostra a data de HOJE dentro de um `<input type="date">` VAZIO, com cara de
// preenchido: a usuária via "26/11/2026", enviava e levava "Informe a data-limite." (o valor era
// ''). Aqui o vazio fica em `--text-subtle`, como placeholder, e o escolhido na cor normal do texto.
// A cor vai no host E no `::-webkit-datetime-edit` (onde o WebKit desenha os segmentos dd/mm/aaaa).
// `aria-invalid` (o modal liga no campo que barrou o envio) pinta a borda pelo `CAMPO`.
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & { value: string }

export default function CampoData({ value, className, ...rest }: Props) {
  const vazio = value === ''
  const cor = vazio
    ? 'text-text-subtle [&::-webkit-datetime-edit]:text-text-subtle'
    : 'text-text-primary [&::-webkit-datetime-edit]:text-text-primary'
  return (
    <Input
      type="date"
      value={value}
      data-vazio={vazio || undefined}
      className={className ? `${cor} ${className}` : cor}
      {...rest}
    />
  )
}
