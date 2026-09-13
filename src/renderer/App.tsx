import { useEffect, useState } from 'react'
import { useGameStore } from './store/gameStore'
import { useUIStore } from './store/uiStore'
import { useScanStore } from './store/scanStore'
import { AppShell } from './components/layout/AppShell'
import { Sidebar } from './components/layout/Sidebar'
import { TitleBar } from './components/layout/TitleBar'
import { GameGrid } from './components/grid/GameGrid'
import { ImportWizard } from './components/import/ImportWizard'
import { GameDetailPanel } from './components/details/GameDetailPanel'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { Toast } from './components/common/Toast'

export default function App() {
  const { fetchGames } = useGameStore()
  const { toasts } = useUIStore()
  const { phase } = useScanStore()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const applyTheme = (theme: string) => {
    document.body.setAttribute('data-theme', theme)
  }

  useEffect(() => {
    fetchGames()

    // Load settings
    window.api.getSettings().then(settings => {
      if (settings.sidebarCollapsed) {
        useUIStore.setState({ sidebarCollapsed: true })
      }
      if (settings.language) {
        useUIStore.setState({ language: settings.language })
      }
      if (settings.theme) {
        applyTheme(settings.theme)
      }
    }).catch(() => {})
  }, [fetchGames])

  const handleSettingsClose = async () => {
    // Refresh settings after saving
    const settings = await window.api.getSettings()
    if (settings.theme) {
      applyTheme(settings.theme)
    }
    setSettingsOpen(false)
  }

  return (
    <AppShell
      titleBar={<TitleBar />}
      sidebar={<Sidebar onOpenSettings={() => setSettingsOpen(true)} />}
    >
      {phase !== 'idle' && phase !== 'complete' ? (
        <ImportWizard />
      ) : (
        <GameGrid />
      )}
      <GameDetailPanel />
      <SettingsPanel open={settingsOpen} onClose={handleSettingsClose} />
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <Toast key={toast.id} {...toast} />
        ))}
      </div>
    </AppShell>
  )
}
