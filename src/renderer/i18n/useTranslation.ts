import { useCallback } from 'react'
import { useUIStore } from '../store/uiStore'
import { zh, en, type TranslationKey } from './translations'

const translations = { zh, en }

export function useTranslation() {
  const language = useUIStore(state => state.language)

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => {
      const dict = translations[language] || translations.zh
      let text = dict[key] ?? key

      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, String(v))
        }
      }

      return text
    },
    [language]
  )

  return { t, language }
}
