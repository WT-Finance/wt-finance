import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react'
import { CAMPO, CAMPO_COMPACTO } from '@/lib/ui/campos'

// ── <Input> / <Select> / <Textarea> — campos de formulário do DS (v4.26 / Fase B) ──
// Envolvem as classes canônicas CAMPO / CAMPO_COMPACTO (tema neutro de plataforma,
// foco via .foco-neutro — nunca var(--brand)). `variant`: 'padrao' (largura total) |
// 'compacto' (inline em célula). `className` é APENDADO para extras (pl-9, resize-none,
// w-24, tabular-nums…). Encaminham todas as props nativas. Migração é byte-equivalente:
// onde o call-site usava exatamente CAMPO/CAMPO_COMPACTO, troca por <Input>/<Select>.

type Variante = 'padrao' | 'compacto'
const baseDe = (v: Variante) => (v === 'compacto' ? CAMPO_COMPACTO : CAMPO)
const junta = (base: string, extra?: string) => (extra ? `${base} ${extra}` : base)

type InputProps = InputHTMLAttributes<HTMLInputElement> & { variant?: Variante }
export function Input({ variant = 'padrao', className, ...rest }: InputProps) {
  return <input className={junta(baseDe(variant), className)} {...rest} />
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { variant?: Variante; children?: ReactNode }
export function Select({ variant = 'padrao', className, children, ...rest }: SelectProps) {
  return <select className={junta(baseDe(variant), className)} {...rest}>{children}</select>
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { variant?: Variante }
export function Textarea({ variant = 'padrao', className, ...rest }: TextareaProps) {
  return <textarea className={junta(baseDe(variant), className)} {...rest} />
}
