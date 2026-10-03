import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Star } from 'lucide-react'
import type { Game, GameRating } from '../../../shared/types'
import { useTranslation } from '../../i18n/useTranslation'

export function ManualEgsRatingCard({ game }: { game: Game }) {
  const { t, language } = useTranslation()
  const [rating, setRating] = useState<GameRating | null>(null)
  const [busy, setBusy] = useState(true)
  const [editing, setEditing] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [entry, setEntry] = useState('')
  const [score, setScore] = useState('')
  const [votes, setVotes] = useState('')
  const [error, setError] = useState<'load' | 'save' | 'open' | null>(null)
  const sequence = useRef(0)

  const load = async () => {
    const request = ++sequence.current
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.getGameRating(game.id, 'erogamescape')
      if (request === sequence.current) setRating(result)
    } catch { if (request === sequence.current) setError('load') }
    finally { if (request === sequence.current) setBusy(false) }
  }
  useEffect(() => {
    void load()
    return () => { sequence.current++ }
  }, [game.id, game.vndbId])

  const edit = () => {
    setEntry(rating?.sourceUrl || rating?.externalId || '')
    setScore(rating?.score == null ? '' : String(rating.score))
    setVotes(rating?.voteCount == null ? '' : String(rating.voteCount))
    setConfirmClear(false)
    setError(null)
    setEditing(true)
  }
  const save = async (clear = false) => {
    const request = ++sequence.current
    setBusy(true)
    setError(null)
    try {
      const result = clear
        ? await window.api.clearManualRating(game.id, game.vndbId)
        : await window.api.saveManualRating(game.id, game.vndbId, {
          entry: entry.trim(), score: score.trim() === '' ? null : Number(score),
          voteCount: votes.trim() === '' ? null : Number(votes)
        })
      if (request === sequence.current) {
        setRating(result)
        setEditing(false)
        setConfirmClear(false)
      }
    } catch { if (request === sequence.current) setError('save') }
    finally { if (request === sequence.current) setBusy(false) }
  }
  const open = async () => {
    if (!rating?.externalId || !rating.egsSite) return
    const request = sequence.current
    setError(null)
    try { await window.api.openRatingSource('erogamescape', rating.externalId, rating.egsSite) }
    catch { if (request === sequence.current) setError('open') }
  }
  const inputClass = 'mt-1 w-full rounded-lg border border-surface-100/25 bg-surface-100/70 px-2 py-1.5 text-sm text-white'
  const buttonClass = 'text-xs text-accent hover:underline disabled:opacity-50'
  return (
    <div data-rating-provider="erogamescape" className="rounded-lg border border-accent/20 bg-accent/5 p-3">
      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        <Star size={14} className="shrink-0 text-accent" />
        <span className="text-xs font-semibold text-accent">{t('egs.title')}</span>
        <span className="rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent">{t('egs.manual')}</span>
        <div className="ml-auto text-right">
          {rating?.score != null && <strong className="text-sm text-accent">{rating.score} / 100</strong>}
          {busy ? <p className="text-xs text-gray-500">{t('ratings.loading')}</p> : rating?.score == null && (
            <p className="text-xs text-gray-500">{t(rating?.externalId ? 'ratings.unrated' : 'egs.empty')}</p>
          )}
        </div>
      </div>
      {rating?.voteCount != null && <p className="mt-1 text-xs text-gray-500">{t('detail.votes', { n: rating.voteCount.toLocaleString() })}</p>}
      {rating?.externalId && <p className="mt-1 break-words text-xs text-gray-500">{rating.egsSite === 'koko' ? 'koko.kyara.top' : rating.egsSite === 'legacy' ? 'erogamescape.dyndns.org' : 'erogamescape.org'} · #{rating.externalId}</p>}
      {rating?.updatedAt != null && <p className="mt-1 text-xs text-gray-500">{t('egs.entered', {
        date: new Date(rating.updatedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')
      })}</p>}
      {editing ? (
        <form className="mt-3 space-y-3" data-egs-form onSubmit={event => { event.preventDefault(); void save() }}>
          <fieldset disabled={busy} className="space-y-3">
            <label className="block text-xs text-gray-400">{t('egs.entry')}
              <input name="entry" value={entry} onChange={event => setEntry(event.target.value)} required maxLength={2048} className={inputClass} placeholder={t('egs.entryPlaceholder')} />
            </label>
            <p className="text-xs text-gray-500">{t('egs.hint')}</p>
            <label className="block text-xs text-gray-400">{t('egs.score')}
              <input name="score" type="number" min="0" max="100" step="any" value={score} onChange={event => setScore(event.target.value)} className={inputClass} />
            </label>
            <label className="block text-xs text-gray-400">{t('egs.votes')}
              <input name="votes" type="number" min="0" step="1" value={votes} onChange={event => setVotes(event.target.value)} className={inputClass} />
            </label>
            <div className="flex gap-4">
              <button type="submit" className={buttonClass}>{t('egs.save')}</button>
              <button type="button" className={buttonClass} onClick={() => { setEditing(false); setError(null) }}>{t('ratings.cancel')}</button>
            </div>
          </fieldset>
        </form>
      ) : (
        <div className="mt-2 flex flex-wrap gap-3">
          {rating?.externalId && <button disabled={busy} onClick={() => void open()} className={`${buttonClass} flex items-center gap-1`}><ExternalLink size={12} />{t('ratings.view')}</button>}
          {rating && <button disabled={busy} onClick={edit} className={buttonClass}>{t(rating.externalId ? 'egs.edit' : 'egs.add')}</button>}
          {rating?.externalId && <button disabled={busy} onClick={() => { setError(null); setConfirmClear(true) }} className={buttonClass}>{t('egs.clear')}</button>}
          {error === 'load' && <button disabled={busy} onClick={() => void load()} className={buttonClass}>{t('ratings.retry')}</button>}
        </div>
      )}
      {confirmClear && <div role="alertdialog" aria-label={t('egs.clearPrompt')} className="mt-3 rounded border border-accent/20 p-2">
        <p className="text-xs text-gray-400">{t('egs.clearPrompt')}</p>
        <div className="mt-2 flex gap-4">
          <button disabled={busy} className={buttonClass} onClick={() => void save(true)}>{t('egs.confirmClear')}</button>
          <button disabled={busy} className={buttonClass} onClick={() => setConfirmClear(false)}>{t('ratings.cancel')}</button>
        </div>
      </div>}
      {error && <p role="alert" className="mt-2 text-xs text-red-400">{t(error === 'open' ? 'ratings.openError' : error === 'load' ? 'egs.loadError' : 'egs.saveError')}</p>}
    </div>
  )
}
