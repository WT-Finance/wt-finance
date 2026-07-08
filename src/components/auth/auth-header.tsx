import Image from 'next/image'

// v4.40.0 (checkpoint do Yan): cabeçalho institucional das telas públicas/auth vira o
// LOCKUP DUPLO [JANUS] | [WELCOME GROUP] — os dois logos separados pela barra fina, sem
// wordmark textual embaixo (o "JANUS" em texto saiu). Mesma hierarquia óptica do lockup
// dos e-mails internos: Janus 36px de altura, Welcome levemente menor (32px). As artes
// já são cinza-neutro (fill baked) — telas de plataforma não usam var(--brand) (ADR-0103).
// A className externa (dos callers) segue sendo o container (centra + margem); o lockup
// horizontal é um filho interno — contrato dos 5 call-sites preservado.

export default function AuthHeader({
  className = 'flex flex-col items-center',
}: {
  className?: string
}) {
  return (
    <div className={className}>
      <div className="flex items-center justify-center gap-4">
        <div className="relative h-9 w-[147px]">
          <Image
            src="/logos/logo-janus.svg"
            alt="Janus"
            fill
            priority
            className="object-contain"
          />
        </div>
        <div className="h-10 w-px bg-zinc-300" aria-hidden />
        <div className="relative h-8 w-[165px]">
          <Image
            src="/logos/welcome-group.svg"
            alt="Welcome Group"
            fill
            className="object-contain"
          />
        </div>
      </div>
    </div>
  )
}
