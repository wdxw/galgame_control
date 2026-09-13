import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 text-center max-w-sm">
      <div className="text-gray-600">
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-medium text-gray-400 mb-1">{title}</h2>
        <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}
