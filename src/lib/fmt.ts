export const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  }).format(v)

export const fmtMi = (v: number) => {
  if (Math.abs(v) >= 1_000_000)
    return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mi`
  if (Math.abs(v) >= 1_000)
    return `R$ ${(v / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} k`
  return fmtBRL(v)
}

/** Converte string ISO 'yyyy-MM-dd' para 'dd/mm/aaaa'. */
export const fmtDate = (s: string) => {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}
