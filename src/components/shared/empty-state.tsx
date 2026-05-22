import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  message: string
}

export default function EmptyState({ icon: Icon, message }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4">
      <Icon
        size={32}
        strokeWidth={1.2}
        style={{ color: 'var(--text-subtle)' }}
        className="mb-3"
      />
      <p className="text-sm text-center" style={{ color: 'var(--text-muted)' }}>
        {message}
      </p>
    </div>
  )
}
