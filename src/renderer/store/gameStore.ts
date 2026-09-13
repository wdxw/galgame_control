import { create } from 'zustand'
import type { Game } from '../../shared/types'

export type GameFilter = 'all' | 'recent' | 'favorites'

interface GameStore {
  games: Game[]
  loading: boolean
  searchQuery: string
  filter: GameFilter
  selectedGameId: string | null
  detailPanelOpen: boolean

  // Actions
  fetchGames: () => Promise<void>
  setSearchQuery: (query: string) => void
  setFilter: (filter: GameFilter) => void
  selectGame: (id: string | null) => void
  openDetailPanel: (id: string) => void
  closeDetailPanel: () => void
  addGame: (game: Game) => Promise<void>
  updateGame: (id: string, fields: Partial<Game>) => Promise<void>
  deleteGame: (id: string) => Promise<void>
}

export const useGameStore = create<GameStore>((set, get) => ({
  games: [],
  loading: false,
  searchQuery: '',
  filter: 'all',
  selectedGameId: null,
  detailPanelOpen: false,

  fetchGames: async () => {
    set({ loading: true })
    try {
      const query = get().searchQuery
      const games = query
        ? await window.api.searchGames(query)
        : await window.api.getAllGames()
      set({ games, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query })
    // Debounced fetch is handled by the hook
  },

  setFilter: (filter: GameFilter) => {
    set({ filter })
  },

  selectGame: (id: string | null) => {
    set({ selectedGameId: id })
  },

  openDetailPanel: (id: string) => {
    set({ selectedGameId: id, detailPanelOpen: true })
  },

  closeDetailPanel: () => {
    set({ detailPanelOpen: false, selectedGameId: null })
  },

  addGame: async (game: Game) => {
    await window.api.addGame(game)
    await get().fetchGames()
  },

  updateGame: async (id: string, fields: Partial<Game>) => {
    await window.api.updateGame(id, fields)
    await get().fetchGames()
  },

  deleteGame: async (id: string) => {
    await window.api.deleteGame(id)
    const state = get()
    if (state.selectedGameId === id) {
      set({ selectedGameId: null, detailPanelOpen: false })
    }
    await state.fetchGames()
  }
}))
