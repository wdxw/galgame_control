import { useEffect, useState } from 'react'
import { CheckCircle, AlertCircle, Info, X, AlertTriangle } from 'lucide-react'

interface ToastProps {
  id: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
}

const icons = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle
}

const colors = {
  info: 'border-blue-500/50 bg-blue-500/10',
  success: 'border-green-500/50 bg-green-500/10',
  warning: 'border-yellow-500/50 bg-yellow-500/10',
  error: 'border-red-500/50 bg-red-500/10'
}

const iconColors = {
  info: 'text-blue-400',
  success: 'text-green-400',
  warning: 'text-yellow-400',
  error: 'text-red-400'
}

export function Toast({ id, message, type }: ToastProps) {
  const [exiting, setExiting] = useState(false)
  const Icon = icons[type]

  const handleDismiss = () => {
    setExiting(true)
  }

  return (
    <div
      className={`
        flex min-w-[300px] max-w-[420px] items-center gap-3 rounded-lg border
        bg-surface-200/[0.85] p-3 shadow-lg backdrop-blur-xl animate-slide-up
        ${colors[type]}
        ${exiting ? 'opacity-0 translate-x-4 transition-all duration-200' : ''}
      `}
    >
      <Icon size={18} className={iconColors[type]} />
      <p className="flex-1 text-sm text-white/90">{message}</p>
      <button
        onClick={handleDismiss}
        className="p-0.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  )
}
