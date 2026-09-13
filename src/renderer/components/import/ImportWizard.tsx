import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useScanStore } from '../../store/scanStore'
import { useGameStore } from '../../store/gameStore'
import { useUIStore } from '../../store/uiStore'
import { useTranslation } from '../../i18n/useTranslation'
import { ScanProgress } from './ScanProgress'
import { ScanResults } from './ScanResults'
import type { Game } from '../../../shared/types'

export function ImportWizard() {
  const { phase, progress, candidates, selectedIds, reset, cancelScan } = useScanStore()
  const { addGame } = useGameStore()
  const { addToast } = useUIStore()
  const [importing, setImporting] = useState(false)
  const { t } = useTranslation()

  const handleCancel = () => {
    cancelScan()
    reset()
  }

  const handleImport = async () => {
    setImporting(true)
    let imported = 0
    let failed = 0

    for (const candidate of candidates) {
      if (!selectedIds.has(candidate.folderPath)) continue

      const topExe = candidate.exeFiles[0]
      if (!topExe) continue

      try {
        const gameId = uuidv4()

        // Try local cover first, then fall back to EXE icon
        let coverPath: string | null = null
        let coverSource: Game['coverSource'] = 'none'

        if (candidate.localCovers.length > 0) {
          try {
            coverPath = await window.api.copyCoverFile(gameId, candidate.localCovers[0])
            coverSource = 'local'
          } catch {
            // Fall back to raw path if copy fails (e.g., permission issue)
            coverPath = candidate.localCovers[0]
            coverSource = 'local'
          }
        } else {
          // Extract EXE icon as default cover
          try {
            const iconPath = await window.api.extractExeIcon(gameId, topExe.path)
            if (iconPath) {
              coverPath = iconPath
              coverSource = 'local'
            }
          } catch {
            // Will import without cover
          }
        }

        const game: Game = {
          id: gameId,
          title: candidate.folderName,
          originalTitle: null,
          exePath: topExe.path,
          gameDir: candidate.folderPath,
          coverPath,
          coverSource,
          vndbId: null,
          developer: null,
          description: null,
          releaseDate: null,
          playTime: 0,
          lastPlayed: null,
          dateAdded: new Date().toISOString(),
          isFavorite: false,
          notes: null,
          exeArgs: null
        }

        await addGame(game)
        imported++
      } catch (err) {
        failed++
        console.error(`[ImportWizard] Failed to import ${candidate.folderName}:`, err)
      }
    }

    if (imported > 0) {
      addToast(t('import.success', { count: imported }), 'success')
    }
    if (failed > 0) {
      addToast(`${failed} game(s) skipped (already imported)`, 'warning')
    }
    if (imported === 0 && failed === 0) {
      addToast('No games were imported', 'info')
    }

    reset()
    setImporting(false)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold text-white">{t('import.title')}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {phase === 'scanning'
            ? t('import.scanning')
            : phase === 'reviewing'
              ? t('import.reviewing', { count: candidates.length })
              : t('import.preparing')}
        </p>
      </div>

      {phase === 'scanning' && progress && (
        <ScanProgress progress={progress} onCancel={handleCancel} />
      )}

      {phase === 'reviewing' && (
        <ScanResults
          candidates={candidates}
          selectedIds={selectedIds}
          onImport={handleImport}
          onCancel={handleCancel}
          importing={importing}
        />
      )}
    </div>
  )
}
