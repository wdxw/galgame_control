import { create } from 'zustand'
import type { Language } from '../../shared/types'

interface Toast {
  id: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
}

interface UIStore {
  sidebarCollapsed: boolean
  toasts: Toast[]
  language: Language

  toggleSidebar: () => void
  setLanguage: (lang: Language) => void
  addToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void
}

export const useUIStore = create<UIStore>((set, get) => ({
  sidebarCollapsed: false,
  toasts: [],
  language: 'zh',

  toggleSidebar: () => {
    const collapsed = !get().sidebarCollapsed
    set({ sidebarCollapsed: collapsed })
    window.api.updateSettings({ sidebarCollapsed: collapsed }).catch(() => {})
  },

  setLanguage: (lang: Language) => {
    set({ language: lang })
    window.api.updateSettings({ language: lang }).catch(() => {})
  },

  addToast: (message: string, type: Toast['type'] = 'info') => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    set(state => ({ toasts: [...state.toasts, { id, message, type }] }))

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      get().removeToast(id)
    }, 4000)
  },

  removeToast: (id: string) => {
    set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }))
  }
}))
