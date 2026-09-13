import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { useGameStore } from '../../store/gameStore'
import { useTranslation } from '../../i18n/useTranslation'

export function SearchBar() {
  const { searchQuery, setSearchQuery, fetchGames } = useGameStore()
  const [localQuery, setLocalQuery] = useState(searchQuery)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const { t } = useTranslation()

  useEffect(() => {
    setLocalQuery(searchQuery)
  }, [searchQuery])

  const handleChange = (value: string) => {
    setLocalQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearchQuery(value)
      fetchGames()
    }, 300)
  }

  const handleClear = () => {
    setLocalQuery('')
    setSearchQuery('')
    fetchGames()
  }

  return (
    <div className="relative">
      <Search
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
      />
      <input
        type="text"
        value={localQuery}
        onChange={e => handleChange(e.target.value)}
        placeholder={t('search.placeholder')}
        className="w-full bg-surface-100/[0.65] border border-surface-100/30 rounded-lg
                   pl-8 pr-8 py-2 text-sm text-white placeholder-gray-500
                   focus:outline-none focus:border-accent/60 focus:bg-surface-100/80 transition-colors"
      />
      {localQuery && (
        <button
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded
                     hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
