import Image from 'next/image'

// v4.14.1: cabeçalho institucional reutilizável das telas públicas/auth.
// Logo Welcome Group + wordmark "WT Finance" em neutro (sem dourado).

export default function AuthHeader({
  className = 'flex flex-col items-center',
}: {
  className?: string
}) {
  return (
    <div className={className}>
      <div className="relative h-12 w-44">
        <Image
          src="/logos/welcome-group.svg"
          alt="Welcome Group"
          fill
          priority
          className="object-contain"
        />
      </div>
      <p
        className="mt-3 text-[13px] font-[800] uppercase tracking-[1.5px]"
        style={{ color: 'var(--text-muted)' }}
      >
        WT Finance
      </p>
    </div>
  )
}
