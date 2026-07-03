// v4.36.0 (Fase 4b) — validação/split de destinatários de e-mail, ISOMÓRFICA.
// SEM 'use client' e SEM 'server-only': é a FONTE ÚNICA da regra, reusada tanto no servidor
// (src/lib/email/fatura.ts e as actions do faturamento) quanto na célula editável do modal
// "Revisar envio" (validação AO VIVO no cliente, destacando o trecho inválido). Não
// reimplementar o split/validação em outro lugar (mesmo espírito de @/lib/carga/coercao).

/** Formato de e-mail — MESMA regex de @/lib/asaas/client.emailValido (comportamento idêntico). */
export function emailValido(email: string | null | undefined): boolean {
  if (!email) return false
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
}

/**
 * Split dos destinatários (string "a@x; b@y") → válidos e inválidos.
 * Separa por ';', trima, descarta vazios, valida cada trecho. Dedupe preservando ordem.
 * O cadastro guarda a string concatenada ("ENVIAR PARA") — esta é a regra de leitura dela.
 */
export function splitDestinatarios(texto: string | null | undefined): { validos: string[]; invalidos: string[] } {
  const partes = (texto ?? '').split(';').map(s => s.trim()).filter(Boolean)
  const validos: string[] = []
  const invalidos: string[] = []
  for (const p of partes) {
    if (emailValido(p)) validos.push(p)
    else invalidos.push(p)
  }
  return { validos: [...new Set(validos)], invalidos }
}
