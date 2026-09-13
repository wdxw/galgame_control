import { useEffect, useRef } from 'react'

interface ContextMenuItem {
  label: string
  icon?: React.ReactNode
  danger?: boolean
  onClick: () => void
}

interface ContextMenuSeparator {
  type: 'separator'
}

interface ContextMenuProps {
  x: number
  y: number
  items: (ContextMenuItem | ContextMenuSeparator)[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = () => onClose()
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    // Delay adding listener to avoid immediate close from the right-click event
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick)
      document.addEventListener('contextmenu', handleClick)
      document.addEventListener('keydown', handleEscape)
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
      document.removeEventListener('contextmenu', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  // Adjust position to keep menu within viewport
  const adjustedX = Math.min(x, window.innerWidth - 200)
  const adjustedY = Math.min(y, window.innerHeight - items.length * 36 - 16)

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-lg border border-surface-100/30
                 bg-surface-200/95 py-1.5 shadow-2xl backdrop-blur-xl animate-fade-in"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((item, i) => {
        if ('type' in item && item.type === 'separator') {
          return <div key={i} className="my-1.5 border-t border-white/5" />
        }

        const menuItem = item as ContextMenuItem
        return (
          <button
            key={i}
            onClick={menuItem.onClick}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors
              ${menuItem.danger
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-gray-300 hover:bg-white/10 hover:text-white'
              }`}
          >
            {menuItem.icon && <span className="text-current">{menuItem.icon}</span>}
            {menuItem.label}
          </button>
        )
      })}
    </div>
  )
}
