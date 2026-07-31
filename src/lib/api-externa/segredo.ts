import 'server-only'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'

// v5.4.0/M2 — Segredo de API das chaves de integração externa (app.api_chave).
//
// O segredo é IRRECUPERÁVEL por design (mesmo padrão da senha provisória do
// admin, v4.14): só o HASH (sha256, hex) é persistido em app.api_chave.
// segredo_hash — o valor em claro nunca é gravado, só devolvido à UI UMA VEZ
// no momento da criação da chave. Se o admin perder o segredo, a única saída é
// revogar a chave e criar uma nova (não existe "ver de novo"/"resetar" aqui).
//
// Isso significa que resolver a chave no runtime (api_chave_resolver, RPC) é
// uma busca por IGUALDADE de hash no banco — não uma comparação de segredo em
// claro. compararHashConstante existe para o caso em que a comparação acontece
// em código (fora do WHERE do banco), evitando um ataque de timing por
// diferença de tempo entre bytes que batem/não batem.

const PREFIXO_SEGREDO = 'jns_'
const BYTES_SEGREDO = 20 // 20 bytes → 40 chars hex

/** Gera um segredo de API novo (ex.: "jns_3f9a1c...").  Nunca persistido em claro. */
export function gerarSegredo(): string {
  return `${PREFIXO_SEGREDO}${randomBytes(BYTES_SEGREDO).toString('hex')}`
}

/** Hash SHA-256 (hex) do segredo — é isso, e só isso, que vai para o banco. */
export function hashSegredo(segredo: string): string {
  return createHash('sha256').update(segredo, 'utf8').digest('hex')
}

/**
 * Compara dois hashes hex em TEMPO CONSTANTE (`crypto.timingSafeEqual`): evita
 * vazar, pela diferença de tempo de uma comparação byte-a-byte comum, quantos
 * bytes iniciais do hash "acertaram" (ataque de timing). Tamanhos diferentes
 * são rejeitados ANTES do timingSafeEqual (que LANÇA se os buffers tiverem
 * tamanhos distintos — o guard evita a exceção e já é, em si, uma rejeição segura).
 */
export function compararHashConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length === 0 || bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
