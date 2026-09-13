import { Check, Gamepad2, FolderOpen, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { ScanCandidate } from '../../../shared/types'
import { useScanStore } from '../../store/scanStore'
import { useTranslation } from '../../i18n/useTranslation'

interface ScanResultsProps {
  candidates: ScanCandidate[]
  selectedIds: Set<string>
  onImport: () => void
  onCancel: () => void
  importing: boolean
}

export function ScanResults({
  candidates,
  selectedIds,
  onImport,
  onCancel,
  importing
}: ScanResultsProps) {
  const { toggleCandidate } = useScanStore()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { t } = useTranslation()

  const allSelected = candidates.every(c => selectedIds.has(c.folderPath))
  const someSelected = candidates.some(c => selectedIds.has(c.folderPath))

  const toggleAll = () => {
    if (allSelected) {
      useScanStore.getState().setSelectedIds(new Set())
    } else {
      useScanStore.getState().setSelectedIds(new Set(candidates.map(c => c.folderPath)))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={toggleAll}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors
            ${allSelected ? 'bg-accent border-accent' :
              someSelected ? 'border-accent/50' : 'border-gray-600'}`}
          >
            {allSelected && <Check size={12} className="text-surface-300" />}
            {someSelected && !allSelected && (
              <div className="w-2 h-0.5 bg-accent" />
            )}
          </div>
          {allSelected ? t('scan.deselectAll') : t('scan.selectAll')}
        </button>
      </div>

      <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
        {candidates.map(candidate => {
          const isSelected = selectedIds.has(candidate.folderPath)
          const isExpanded = expandedId === candidate.folderPath
          const topExe = candidate.exeFiles[0]

          return (
            <div
              key={candidate.folderPath}
              className={`bg-surface-200 border rounded-xl transition-all overflow-hidden
                ${isSelected ? 'border-accent/40' : 'border-surface-100/10 hover:border-surface-100/30'}`}
            >
              <div
                className="flex items-center gap-3 p-4 cursor-pointer"
                onClick={() => toggleCandidate(candidate.folderPath)}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors
                  ${isSelected ? 'bg-accent border-accent' : 'border-gray-600'}`}
                >
                  {isSelected && <Check size={14} className="text-surface-300" />}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-white truncate">
                    {candidate.folderName}
                  </h3>
                  <p className="text-xs text-gray-600 truncate mt-0.5">
                    {topExe?.name || t('scan.noExe')}
                  </p>
                </div>

                {candidate.localCovers.length > 0 && (
                  <span className="text-xs text-green-400/70 bg-green-500/10 px-2 py-0.5 rounded-full shrink-0">
                    {t('scan.coverFound')}
                  </span>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setExpandedId(isExpanded ? null : candidate.folderPath)
                  }}
                  className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
                >
                  <ChevronDown
                    size={16}
                    className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-surface-100/10 pt-3">
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      {t('scan.executablesFound')}
                      <span className="text-gray-600 ml-1 font-normal lowercase">
                        — click to select
                      </span>
                    </h4>
                    <div className="space-y-1">
                      {candidate.exeFiles.map(exe => {
                        const isTop = exe === topExe
                        return (
                          <button
                            key={exe.path}
                            onClick={() => useScanStore.getState().selectExe(candidate.folderPath, exe.path)}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all
                              ${isTop
                                ? 'bg-accent/10 border border-accent/20'
                                : 'bg-surface-100 hover:bg-surface-100/80 hover:border hover:border-white/10'}`}
                          >
                            <Gamepad2 size={14} className={isTop ? 'text-accent' : 'text-gray-500'} />
                            <span className={`flex-1 text-left truncate ${isTop ? 'text-accent font-medium' : 'text-white/80'}`}>
                              {exe.name}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">
                                {t('scan.score')}: {exe.score}
                              </span>
                              {isTop && (
                                <span className="text-xs text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                                  ✓
                                </span>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {candidate.localCovers.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        {t('scan.coversFound')}
                      </h4>
                      <div className="space-y-1">
                        {candidate.localCovers.map(cover => (
                          <div
                            key={cover}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-100 text-sm"
                          >
                            <FolderOpen size={14} className="text-gray-500" />
                            <span className="text-gray-400 truncate text-xs">
                              {cover.split(/[/\\]/).pop()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-600 break-all">
                    {candidate.folderPath}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-surface-100/10">
        <button
          onClick={onCancel}
          className="px-5 py-2.5 bg-surface-100 hover:bg-white/10 text-gray-300
                     rounded-lg font-medium text-sm transition-colors"
        >
          {t('scan.cancelBtn')}
        </button>
        <button
          onClick={onImport}
          disabled={selectedIds.size === 0 || importing}
          className="px-6 py-2.5 bg-accent hover:bg-accent/80 text-surface-300
                     rounded-lg font-medium text-sm transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {importing ? t('scan.importing') : t('scan.importBtn', { count: selectedIds.size })}
        </button>
      </div>
    </div>
  )
}
