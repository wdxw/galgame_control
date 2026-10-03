import { useEffect, useRef, useState } from 'react'
import { ExternalLink, RefreshCw, Search, Star, X } from 'lucide-react'
import type { Game, GameRating, RatingCandidate, OnlineRatingProvider, RatingProvider } from '../../../shared/types'
import { useTranslation } from '../../i18n/useTranslation'
import type { TranslationKey } from '../../i18n/translations'
import { useGameStore } from '../../store/gameStore'

import { ManualEgsRatingCard } from './ManualEgsRatingCard'

const providers: OnlineRatingProvider[] = ['vndb', 'bangumi']
const statusKeys: Record<GameRating['status'], TranslationKey> = {
  ready: 'ratings.ready', unrated: 'ratings.unrated', unmatched: 'ratings.unmatched',
  'needs-match': 'ratings.needsMatch', restricted: 'ratings.restricted', error: 'ratings.error', disabled: 'ratings.disabled'
}
interface RatingState { loading: boolean; result: GameRating | null; failed: boolean }

export function GameRatings({ game, onFindVndb }: { game: Game; onFindVndb: () => void }) {
  const { t, language } = useTranslation()
  const [hidden, setHidden] = useState<RatingProvider[] | null>(null)
  const [savingVisibility, setSavingVisibility] = useState(false)
  const [visibilityError, setVisibilityError] = useState(false)
  useEffect(() => {
    let cancelled = false
    window.api.getSettings().then(settings => {
      if (!cancelled) setHidden(settings.hiddenRatingProviders)
    }).catch(() => {
      if (!cancelled) { setHidden([]); setVisibilityError(true) }
    })
    return () => { cancelled = true }
  }, [])
  const [states, setStates] = useState<Record<OnlineRatingProvider, RatingState>>({
    vndb: { loading: true, result: null, failed: false }, bangumi: { loading: true, result: null, failed: false }
  })
  const [matching, setMatching] = useState(false)
  const [openError, setOpenError] = useState(false)
  const requestIds = useRef({ vndb: 0, bangumi: 0 })
  const active = useRef(true)

  const load = async (provider: OnlineRatingProvider, force = false) => {
    const requestId = ++requestIds.current[provider]
    setStates(previous => ({ ...previous, [provider]: { ...previous[provider], loading: true, failed: false } }))
    try {
      const result = await window.api.getGameRating(game.id, provider, force)
      if (active.current && requestIds.current[provider] === requestId) {
        setStates(previous => ({ ...previous, [provider]: { loading: false, result, failed: false } }))
        if (provider === 'bangumi' && result.status === 'needs-match') setMatching(true)
      }
    } catch {
      if (active.current && requestIds.current[provider] === requestId) {
        setStates(previous => ({ ...previous, [provider]: { ...previous[provider], loading: false, failed: true } }))
      }
    }
  }

  useEffect(() => {
    active.current = true
    if (hidden !== null) providers.filter(provider => !hidden.includes(provider)).forEach(provider => { void load(provider) })
    return () => {
      active.current = false
      requestIds.current.vndb++
      requestIds.current.bangumi++
    }
  }, [game.id, game.vndbId, hidden])

  const setVisible = async (provider: RatingProvider, visible: boolean) => {
    if (hidden === null || savingVisibility) return
    const next = visible ? hidden.filter(value => value !== provider) : [...hidden, provider]
    setSavingVisibility(true)
    setVisibilityError(false)
    try {
      await window.api.updateSettings({ hiddenRatingProviders: next })
      if (active.current) {
        setHidden(next)
        setOpenError(false)
        if (provider === 'bangumi' && !visible) setMatching(false)
      }
    } catch { if (active.current) setVisibilityError(true) }
    finally { if (active.current) setSavingVisibility(false) }
  }

  const openSource = async (provider: OnlineRatingProvider, id: string) => {
    setOpenError(false)
    try { await window.api.openRatingSource(provider, id) }
    catch { if (active.current) setOpenError(true) }
  }

  return (
    <section className="mt-4 space-y-2" aria-label={t('ratings.title')}>
      <details className="rounded-lg border border-accent/20 bg-accent/5 p-3" data-rating-visibility>
        <summary className="cursor-pointer text-xs text-accent">{t('ratings.visibility')}</summary>
        <p className="mt-2 text-xs text-gray-500">{t('ratings.visibilityHint')}</p>
        <div className="mt-2 flex flex-wrap gap-4">
          {(['vndb', 'bangumi', 'erogamescape'] as RatingProvider[]).map(provider => (
            <label key={provider} className="flex items-center gap-1.5 text-xs text-accent">
              <input type="checkbox" data-rating-toggle={provider} checked={hidden !== null && !hidden.includes(provider)}
                disabled={hidden === null || savingVisibility} className="accent-accent"
                onChange={event => void setVisible(provider, event.target.checked)} />
              {provider === 'erogamescape' ? t('egs.title') : provider === 'vndb' ? 'VNDB' : 'Bangumi'}
            </label>
          ))}
        </div>
      </details>
      {visibilityError && <p role="alert" className="text-xs text-red-400">{t('ratings.visibilityError')}</p>}
      {providers.filter(provider => hidden !== null && !hidden.includes(provider)).map(provider => {
        const state = states[provider]
        const result = state.result
        const id = result?.externalId || (provider === 'vndb' ? game.vndbId : game.bangumiId ? String(game.bangumiId) : null)
        const status = state.failed ? 'error' : result?.status || 'unmatched'
        return (
          <div key={provider} data-rating-provider={provider} className="rounded-lg border border-accent/20 bg-accent/5 p-3">
            <div className="flex flex-wrap items-center gap-2" aria-live="polite">
              <Star size={14} className="shrink-0 text-accent" />
              <span className="text-xs font-semibold text-accent">{provider === 'vndb' ? 'VNDB' : 'Bangumi'}</span>
              <div className="ml-auto text-right">
                {result?.score != null && (
                  <strong className="text-sm text-accent">{result.score.toFixed(1)} / {result.maxScore}</strong>
                )}
                {state.loading ? (
                  <p className="text-xs text-gray-500">{t('ratings.loading')}</p>
                ) : status !== 'ready' && (
                  <p className="text-xs text-gray-500">{t(statusKeys[status])}</p>
                )}
              </div>
            </div>
            {result?.voteCount != null && <p className="mt-1 text-xs text-gray-500">{t('detail.votes', { n: result.voteCount.toLocaleString() })}</p>}
            {result?.updatedAt != null && (
              <p className="mt-1 text-xs text-gray-500">
                {t(result.stale ? 'ratings.stale' : 'ratings.updated', {
                  date: new Date(result.updatedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')
                })}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {id && (
                <button className="flex items-center gap-1 text-accent hover:underline" onClick={() => void openSource(provider, id)}>
                  <ExternalLink size={12} />{t('ratings.view')}
                </button>
              )}
              <button
                disabled={state.loading || status === 'disabled'}
                className="flex items-center gap-1 text-accent hover:underline disabled:opacity-50"
                onClick={() => provider === 'bangumi' ? setMatching(true) : onFindVndb()}
              >
                <Search size={12} />{t(id ? 'ratings.rematch' : 'ratings.find')}
              </button>
              <button
                disabled={state.loading || status === 'disabled'}
                className="flex items-center gap-1 text-accent hover:underline disabled:opacity-50"
                onClick={() => void load(provider, true)}
              >
                <RefreshCw size={12} />{t(status === 'error' || status === 'restricted' ? 'ratings.retry' : 'ratings.refresh')}
              </button>
            </div>
            {provider === 'bangumi' && !id && !state.loading && status !== 'disabled' && (
              <p className="mt-2 text-xs text-gray-500">{t('ratings.publicLimit')}</p>
            )}
          </div>
        )
      })}
      {hidden !== null && !hidden.includes('erogamescape') && <ManualEgsRatingCard key={`${game.id}:${game.vndbId}`} game={game} />}
      {openError && <p role="alert" className="text-xs text-red-400">{t('ratings.openError')}</p>}
      {matching && hidden !== null && !hidden.includes('bangumi') && (
        <RatingMatcher
          game={game}
          initialCandidates={states.bangumi.result?.candidates || []}
          onCancel={() => setMatching(false)}
          onSelected={() => {
            setMatching(false)
            void load('bangumi')
            void useGameStore.getState().fetchGames()
          }}
        />
      )}
    </section>
  )
}

function RatingMatcher({ game, initialCandidates, onCancel, onSelected }: {
  game: Game; initialCandidates: RatingCandidate[]; onCancel: () => void; onSelected: () => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState(game.originalTitle || game.title)
  const [candidates, setCandidates] = useState(initialCandidates)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState<number | null>(null)
  const [error, setError] = useState(false)
  const sequence = useRef(0)

  const search = async () => {
    if (!query.trim()) return
    const request = ++sequence.current
    setSearching(true)
    setError(false)
    setCandidates([])
    try {
      const results = await window.api.searchRatingCandidates(game.id, query)
      if (sequence.current === request) setCandidates(results)
    } catch { if (sequence.current === request) setError(true) }
    finally { if (sequence.current === request) setSearching(false) }
  }
  useEffect(() => {
    if (!initialCandidates.length) void search()
    return () => { sequence.current++ }
  }, [])

  const select = async (id: number) => {
    const request = ++sequence.current
    setSaving(id)
    setError(false)
    try {
      await window.api.selectRatingCandidate(game.id, game.vndbId, id)
      if (sequence.current === request) onSelected()
    } catch { if (sequence.current === request) setError(true) }
    finally { if (sequence.current === request) setSaving(null) }
  }

  return (
    <div className="rounded-lg border border-accent/25 bg-surface-200/80 p-3 space-y-3" data-rating-matcher="bangumi">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">{t('ratings.choose')}</h3>
        <button disabled={saving !== null} onClick={onCancel} aria-label={t('ratings.cancel')} className="text-gray-400 disabled:opacity-50"><X size={16} /></button>
      </div>
      <form onSubmit={event => { event.preventDefault(); void search() }} className="flex gap-2">
        <input value={query} onChange={event => setQuery(event.target.value)} maxLength={300}
          disabled={saving !== null} aria-label={t('ratings.query')}
          className="min-w-0 flex-1 rounded-lg border border-surface-100/25 bg-surface-100/70 px-2 py-1.5 text-sm text-white" />
        <button disabled={searching || saving !== null || !query.trim()} className="text-xs text-accent disabled:opacity-50">{t('ratings.search')}</button>
      </form>
      <p className="text-xs text-gray-500">{t('ratings.matchHint')}</p>
      {error && <p role="alert" className="text-xs text-red-400">{t('ratings.error')}</p>}
      {searching ? <p className="text-xs text-gray-500">{t('ratings.loading')}</p> : (
        <div className="max-h-72 overflow-y-auto space-y-2">
          {candidates.map(candidate => (
            <button key={candidate.id} disabled={saving !== null} onClick={() => void select(candidate.id)}
              className="flex w-full items-center gap-2 rounded-lg border border-surface-100/25 bg-surface-100/60 p-2 text-left hover:border-accent/40 disabled:opacity-50">
              {candidate.imageUrl && <img src={candidate.imageUrl} alt="" className="h-14 w-10 shrink-0 rounded object-cover" onError={event => { event.currentTarget.hidden = true }} />}
              <span className="min-w-0 flex-1">
                <span className="block break-words text-xs font-medium text-white">{candidate.title}</span>
                {candidate.originalTitle !== candidate.title && <span className="block break-words text-xs text-gray-500">{candidate.originalTitle}</span>}
                <span className="block text-xs text-gray-500">{candidate.releaseDate || t('detail.unknown')} · #{candidate.id}</span>
              </span>
              <span className="text-xs text-accent">{t(saving === candidate.id ? 'ratings.saving' : 'ratings.select')}</span>
            </button>
          ))}
          {!candidates.length && !error && <p className="text-xs text-gray-500">{t('ratings.unmatched')}</p>}
        </div>
      )}
      <button disabled={saving !== null} onClick={onCancel} className="text-xs text-gray-400 disabled:opacity-50">{t('ratings.cancel')}</button>
    </div>
  )
}
