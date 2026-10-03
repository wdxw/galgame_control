import type { ReactNode } from 'react'

interface AppShellProps {
  titleBar: ReactNode
  sidebar: ReactNode
  footer?: ReactNode
  children: ReactNode
}

export function AppShell({ titleBar, sidebar, footer, children }: AppShellProps) {
  return (
    <div className="relative isolate h-screen w-screen flex flex-col bg-transparent text-white">
      {/* Title bar */}
      {titleBar}

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebar}

        {/* Content */}
        <main className="app-content relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-surface-300/80 p-4 sm:p-6">
          {children}
        </main>
      </div>
      {footer}
    </div>
  )
}
