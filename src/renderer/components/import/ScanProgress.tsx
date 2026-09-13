import { X } from 'lucide-react'
import type { ScanProgress as ScanProgressType } from '../../../shared/types'
import { useTranslation } from '../../i18n/useTranslation'

interface ScanProgressProps {
  progress: ScanProgressType
  onCancel: () => void
}

export function ScanProgress({ progress, onCancel }: ScanProgressProps) {
  const { t } = useTranslation()
  const percent = progress.phase === 'complete' ? 100
    : Math.min(95, Math.round((progress.dirsScanned / Math.max(progress.dirsScanned + 10, 1)) * 100))

  return (
    <div className="bg-surface-200 border border-surface-100/10 rounded-xl p-6 space-y-4">
      <div>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-400">
            {progress.phase === 'walking' ? t('scan.scanning') :
             progress.phase === 'analyzing' ? t('scan.analyzing') :
             t('scan.complete')}
          </span>
          <span className="text-accent font-medium">{percent}%</span>
        </div>
        <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="bg-surface-100 rounded-lg p-3">
          <p className="text-gray-500 text-xs mb-0.5">{t('scan.dirsScanned')}</p>
          <p className="text-white font-medium">{progress.dirsScanned}</p>
        </div>
        <div className="bg-surface-100 rounded-lg p-3">
          <p className="text-gray-500 text-xs mb-0.5">{t('scan.gamesFound')}</p>
          <p className="text-accent font-medium">{progress.gamesFound}</p>
        </div>
      </div>

      {progress.currentDir && (
        <p className="text-xs text-gray-600 truncate">
          {t('scan.scanningPath', { path: progress.currentDir })}
        </p>
      )}

      <button
        onClick={onCancel}
        className="flex items-center gap-2 px-4 py-2 bg-surface-100 hover:bg-white/10
                   text-gray-400 hover:text-white rounded-lg text-sm transition-colors"
      >
        <X size={14} />
        {t('scan.cancel')}
      </button>
    </div>
  )
}
