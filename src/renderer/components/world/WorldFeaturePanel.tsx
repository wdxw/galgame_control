import { useMemo, useState } from 'react'
import { CircleDot, Hammer, Plus, RefreshCw, Sparkles, Star, Trash2, Wand2, X } from 'lucide-react'
import { WORLD_CATALOG, type ModelCategory } from '../../../shared/worldCatalog'
import { PALETTES, type Biome } from '../../../shared/worldRules'
import type { WorldAnalysis, WorldElement } from '../../../shared/types'
import { useTranslation } from '../../i18n/useTranslation'

// The world feature panel: where the recognition is explained and where the
// player overrules it. Their edits always win over the generated scene.

const CATEGORY_KEYS: Record<ModelCategory, 'world.category.building' | 'world.category.landmark' | 'world.category.prop' | 'world.category.plant'> = {
  building: 'world.category.building',
  landmark: 'world.category.landmark',
  prop: 'world.category.prop',
  plant: 'world.category.plant'
}

const STATUS_KEYS: Record<WorldAnalysis['status'], 'world.status.confirmed' | 'world.status.failed' | 'world.status.pending'> = {
  confirmed: 'world.status.confirmed',
  failed: 'world.status.failed',
  pending: 'world.status.pending'
}

export interface WorldFeaturePanelProps {
  analysis: WorldAnalysis | null
  biome: Biome
  elements: WorldElement[]
  removed: string[]
  launchElementId: string | null
  defaultLaunchId: string | null
  busy: boolean
  onAdd(modelId: string, name: string): void
  onRemove(modelId: string): void
  onSetLaunch(modelId: string | null): void
  onRegenerate(): void
  onReanalyze(): void
  onClose(): void
}

export function WorldFeaturePanel(props: WorldFeaturePanelProps) {
  const { t, language } = useTranslation()
  const { analysis, biome, elements, removed, launchElementId, defaultLaunchId, busy } = props
  // The catalogue ships both names; which one a model shows is the reader's choice.
  const nameOf = (model: { name: string; nameEn: string }): string => (language === 'en' ? model.nameEn : model.name)
  // A reason the app wrote has a wording per language; one that quotes the work —
  // the AI's evidence, a tag — is shown as it was written.
  const reasonOf = (element: WorldElement): string =>
    (language === 'en' && element.reasonEn ? element.reasonEn : element.reason) || t(CATEGORY_KEYS[element.category])
  const evidence = analysis
    ? (language === 'en' && analysis.evidenceEn?.length ? analysis.evidenceEn : analysis.evidence)
    : []
  const evidenceKey = analysis?.source === 'ai' ? 'world.aiEvidence' : 'world.baseSceneEvidence'
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')
  const launchId = launchElementId || defaultLaunchId
  const palette = PALETTES[biome] || PALETTES.garden

  const candidates = useMemo(() => {
    const value = query.trim().toLowerCase()
    return WORLD_CATALOG
      .filter(model => !value || model.name.includes(value) || model.nameEn.toLowerCase().includes(value) || model.keywords.some(keyword => keyword.toLowerCase().includes(value)))
      .filter(model => !elements.some(element => element.id === model.id))
      .slice(0, 40)
  }, [query, elements])

  const grouped = useMemo(() => {
    const map = new Map<ModelCategory, typeof candidates>()
    for (const model of candidates) {
      const list = map.get(model.category) || []
      list.push(model)
      map.set(model.category, list)
    }
    return [...map.entries()]
  }, [candidates])

  return (
    <aside className="world-panel" aria-label={t('world.features')}>
      <header>
        <Sparkles size={15} />
        <strong>{t('world.features')}</strong>
        <span className="world-chip">{language === 'en' ? palette.nameEn : palette.name}</span>
        <button className="world-icon-btn" aria-label={t('world.closeFeatures')} onClick={props.onClose}><X size={14} /></button>
      </header>

      <div className="world-panel-body">
        <section>
          <h4>{t('world.evidence')}</h4>
          {analysis ? (
            <>
              <p className="world-panel-note">
                <span className={'world-tag ' + (analysis.source === 'ai' ? 'is-ai' : '')}>
                  {analysis.source === 'ai' ? t('world.sourceAi') : t('world.sourceRules')}
                </span>
                <span>{t(STATUS_KEYS[analysis.status])}</span>
                {analysis.atmosphere.night && <span className="world-tag">{t('world.tagNight')}</span>}
              </p>
              <ul className="world-evidence">
                {(evidence.length ? evidence : [t(evidenceKey)]).map(line => (
                  <li key={line}><CircleDot size={11} />{line}</li>
                ))}
              </ul>
              {analysis.error && <p className="world-panel-error">{analysis.error}</p>}
            </>
          ) : (
            <p className="world-panel-note">{t('world.noAnalysis')}</p>
          )}
          <button className="world-btn world-btn-ghost" disabled={busy} onClick={props.onReanalyze}>
            <RefreshCw size={13} />{busy ? t('world.analyzing') : t('world.reanalyze')}
          </button>
        </section>

        <section>
          <h4>{t('world.elements')} <small>{elements.length}</small></h4>
          <div className="world-element-list">
            {elements.map(element => (
              <div className={'world-element' + (element.id === launchId ? ' is-launch' : '')} key={element.id} data-world-element={element.id}>
                <div>
                  <strong>{nameOf(element)}</strong>
                  <small>{reasonOf(element)}</small>
                </div>
                <button
                  className="world-icon-btn"
                  data-world-bind={element.id}
                  title={element.id === launchId ? t('world.launchCurrent') : t('world.launchSet')}
                  aria-label={t('world.launchSetName', { name: nameOf(element) })}
                  disabled={busy}
                  onClick={() => props.onSetLaunch(element.id === launchId ? null : element.id)}
                >
                  <Star size={13} fill={element.id === launchId ? 'currentColor' : 'none'} />
                </button>
                <button
                  className="world-icon-btn world-danger"
                  title={t('world.removeTitle')}
                  aria-label={t('world.removeName', { name: nameOf(element) })}
                  disabled={busy}
                  onClick={() => props.onRemove(element.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {removed.map(modelId => (
              <div className="world-element is-removed" key={'removed-' + modelId}>
                <div><strong>{modelId}</strong><small>{t('world.removedByYou')}</small></div>
                <button className="world-icon-btn" aria-label={t('world.restoreName', { name: modelId })} disabled={busy} onClick={() => props.onAdd(modelId, modelId)}>
                  <Plus size={13} />
                </button>
              </div>
            ))}
          </div>
          <button className="world-btn world-btn-ghost" data-world-action="add-element" onClick={() => setPicking(!picking)}>
            <Plus size={13} />{t('world.addElement')}
          </button>
          {picking && (
            <div className="world-picker">
              <input value={query} placeholder={t('world.searchModel')} aria-label={t('world.searchModel')} onChange={event => setQuery(event.target.value)} />
              {grouped.map(([category, models]) => (
                <div key={category}>
                  <h5>{t(CATEGORY_KEYS[category])}</h5>
                  <div className="world-picker-grid">
                    {models.map(model => (
                      <button key={model.id} onClick={() => props.onAdd(model.id, nameOf(model))}>{nameOf(model)}</button>
                    ))}
                  </div>
                </div>
              ))}
              {candidates.length === 0 && <p className="world-panel-note">{t('world.noModels')}</p>}
            </div>
          )}
        </section>

        {!!analysis?.pendingElements.length && (
          <section>
            <h4>{t('world.pendingTitle')} <small>{t('world.pendingHint')}</small></h4>
            <div className="world-element-list">
              {analysis.pendingElements.map(element => (
                <div className="world-element is-pending" key={'pending-' + element.id}>
                  <div><strong>{nameOf(element)}</strong><small>{reasonOf(element)}</small></div>
                  <button className="world-icon-btn" aria-label={t('world.adoptName', { name: nameOf(element) })} disabled={busy} onClick={() => props.onAdd(element.id, nameOf(element))}>
                    <Plus size={13} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {!!analysis?.missingElements.length && (
          <section>
            <h4>{t('world.missingTitle')}</h4>
            <p className="world-panel-note">{t('world.missingHint')}</p>
            <div className="world-missing">
              {analysis.missingElements.map(name => <span key={name}>{name}</span>)}
            </div>
          </section>
        )}

        <section>
          <h4>{t('world.layout')}</h4>
          <p className="world-panel-note">{t('world.layoutHint')}</p>
          <button className="world-btn world-btn-ghost" disabled={busy} onClick={props.onRegenerate}>
            <Hammer size={13} />{t('world.regenerate')}
          </button>
        </section>
      </div>

      <footer>
        <Wand2 size={12} />
        <span>{t('world.editsWin')}</span>
      </footer>
    </aside>
  )
}
