import { create } from 'zustand'
import type { ScanCandidate, ScanProgress } from '../../shared/types'

type ScanPhase = 'idle' | 'scanning' | 'reviewing' | 'importing' | 'complete'

interface ScanStore {
  phase: ScanPhase
  progress: ScanProgress | null
  candidates: ScanCandidate[]
  selectedIds: Set<string>

  startScan: (roots: string[]) => Promise<void>
  cancelScan: () => Promise<void>
  setSelectedIds: (ids: Set<string>) => void
  toggleCandidate: (folderPath: string) => void
  selectExe: (folderPath: string, exePath: string) => void
  reset: () => void
}

export const useScanStore = create<ScanStore>((set, get) => ({
  phase: 'idle',
  progress: null,
  candidates: [],
  selectedIds: new Set(),

  startScan: async (roots: string[]) => {
    set({ phase: 'scanning', progress: null, candidates: [], selectedIds: new Set() })

    // Listen for progress updates
    const unsub = window.api.onScanProgress((progress: ScanProgress) => {
      set({ progress })
    })

    try {
      const candidates = await window.api.startScan(roots)
      // Auto-select all candidates
      const selectedIds = new Set(candidates.map(c => c.folderPath))
      set({ candidates, selectedIds, phase: 'reviewing' })
    } catch (error) {
      set({ phase: 'idle' })
      throw error
    } finally {
      unsub()
    }
  },

  cancelScan: async () => {
    await window.api.cancelScan()
    set({ phase: 'idle' })
  },

  setSelectedIds: (ids: Set<string>) => {
    set({ selectedIds: ids })
  },

  toggleCandidate: (folderPath: string) => {
    const selectedIds = new Set(get().selectedIds)
    if (selectedIds.has(folderPath)) {
      selectedIds.delete(folderPath)
    } else {
      selectedIds.add(folderPath)
    }
    set({ selectedIds })
  },

  selectExe: (folderPath: string, exePath: string) => {
    const candidates = get().candidates.map(c => {
      if (c.folderPath === folderPath) {
        const exeFiles = [...c.exeFiles]
        const idx = exeFiles.findIndex(e => e.path === exePath)
        if (idx > 0) {
          // Move selected EXE to first position
          const [selected] = exeFiles.splice(idx, 1)
          exeFiles.unshift(selected)
          return { ...c, exeFiles }
        }
      }
      return c
    })
    set({ candidates })
  },

  reset: () => {
    set({ phase: 'idle', progress: null, candidates: [], selectedIds: new Set() })
  }
}))
