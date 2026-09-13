import { Minus, Square, X } from 'lucide-react'
import { useTranslation } from '../../i18n/useTranslation'

export function TitleBar() {
  const { t } = useTranslation()

  return (
    <div className="h-10 bg-surface-200/90 border-b border-surface-100/20 backdrop-blur-xl flex items-center justify-between titlebar-drag select-none shrink-0">
      {/* App title */}
      <div className="flex items-center gap-3 ml-4">
        <span className="text-accent font-semibold text-sm tracking-wide">
          {t('app.title')}
        </span>
      </div>

      {/* Window controls */}
      <div className="flex h-full titlebar-no-drag">
        <button
          onClick={() => window.api.minimizeWindow()}
          className="h-full w-12 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label={t('titlebar.minimize')}
        >
          <Minus size={16} />
        </button>
        <button
          onClick={() => window.api.maximizeWindow()}
          className="h-full w-12 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label={t('titlebar.maximize')}
        >
          <Square size={14} />
        </button>
        <button
          onClick={() => window.api.closeWindow()}
          className="h-full w-12 flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-500/80 transition-colors"
          aria-label={t('titlebar.close')}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
